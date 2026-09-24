"""Exact chain-rule graph for the full sequence/grid cross-attention model.
Original weights are shared by forward and reverse operations. No surrogate.
"""
import ast,importlib.util,json,math,time,sys
from pathlib import Path
import numpy as np
import torch
from torch import nn
import torch.nn.functional as F
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('exporter',ROOT/'scripts/export-research-models.py');ex=importlib.util.module_from_spec(spec);spec.loader.exec_module(ex)

class FusionDerivatives(nn.Module):
 def __init__(self,native):
  super().__init__();self.model=native.model
 def attention(self,qinput,kinput,vinput):
  m=self.model.mix_attention_layer;wq,wk,wv=m.in_proj_weight.chunk(3);bq,bk,bv=m.in_proj_bias.chunk(3)
  def heads(x):return x.reshape(1,85,5,32).transpose(1,2)
  q=heads(F.linear(qinput,wq,bq));k=heads(F.linear(kinput,wk,bk));v=heads(F.linear(vinput,wv,bv))
  a=torch.softmax((q/math.sqrt(32))@k.transpose(-1,-2),dim=-1)
  output=F.linear((a@v).transpose(1,2).reshape(1,85,160),m.out_proj.weight,m.out_proj.bias)
  return output,(q,k,v,a)
 def attention_back(self,grad,saved):
  q,k,v,a=saved;m=self.model.mix_attention_layer;wq,wk,wv=m.in_proj_weight.chunk(3)
  g=F.linear(grad,m.out_proj.weight.T).reshape(1,85,5,32).transpose(1,2)
  da=g@v.transpose(-1,-2);dv=a.transpose(-1,-2)@g;dz=a*(da-(da*a).sum(-1,keepdim=True))
  dq=(dz@k)/math.sqrt(32);dk=dz.transpose(-1,-2)@(q/math.sqrt(32))
  def linear(x,w):return F.linear(x.transpose(1,2).reshape(1,85,160),w.T)
  return linear(dq,wq),linear(dk,wk),linear(dv,wv)
 def forward(self,grid,tokens):
  m=self.model;b=m.Drug_Grid_CNNs
  x0=F.relu(b.conv1(grid));saved=[];x=x0
  for i in (2,3,4):
   s=F.relu(getattr(b,f'fire{i}_squeeze')(x));e1=F.relu(getattr(b,f'fire{i}_expand1')(s));e2=F.relu(getattr(b,f'fire{i}_expand2')(s));saved.append((s,e1,e2));x=torch.cat((e1,e2),1)
  spatial=x;pooled=b.avg_pool(x);g=b.dense1(pooled.reshape(1,-1)).reshape(1,160,85).transpose(1,2)
  s=m.Drug_Smi_CNNs(m.drug_smi_embed(tokens).transpose(1,2)).transpose(1,2)
  ga,cache1=self.attention(g,s,s);sa,cache2=self.attention(s,g,g)
  gc=.5*g+.5*ga;sc=.5*s+.5*sa
  gv,gi=gc.max(1);sv,si=sc.max(1);pair=torch.cat((gv,sv),1)
  h1=F.leaky_relu(m.fc1(pair));h2=F.leaky_relu(m.fc2(h1));h3=F.leaky_relu(m.fc3(h2));probs=torch.softmax(m.out(h3),1)
  dlogit=probs*(torch.tensor([[0.,1.]],device=grid.device)-probs[:,1:2])
  dh3=F.linear(dlogit,m.out.weight.T)*torch.where(h3>0,1.,.01)
  dh2=F.linear(dh3,m.fc3.weight.T)*torch.where(h2>0,1.,.01)
  dh1=F.linear(dh2,m.fc2.weight.T)*torch.where(h1>0,1.,.01)
  dpair=F.linear(dh1,m.fc1.weight.T);dgv,dsv=dpair.chunk(2,1)
  dgc=F.one_hot(gi,85).transpose(1,2).to(grid.dtype)*dgv.unsqueeze(1)
  dsc=F.one_hot(si,85).transpose(1,2).to(grid.dtype)*dsv.unsqueeze(1)
  dq1,_,_=self.attention_back(.5*dgc,cache1);_,dk2,dv2=self.attention_back(.5*dsc,cache2)
  dg=.5*dgc+dq1+dk2+dv2
  dp=F.linear(dg.transpose(1,2).reshape(1,-1),b.dense1.weight.T).reshape(1,256,4,4,4)
  dx=F.conv_transpose3d(dp,torch.ones((256,1,3,3,3),device=grid.device)/27,stride=3,padding=1,output_padding=2,groups=256)
  cam=F.relu((dx.mean((2,3,4),keepdim=True)*spatial).sum(1))
  for i,(sq,e1,e2) in reversed(list(zip((2,3,4),saved))):
   d1,d2=dx.chunk(2,1);w1=getattr(b,f'fire{i}_expand1').weight;w2=getattr(b,f'fire{i}_expand2').weight
   ds=F.conv_transpose3d(d1*(e1>0),w1)+F.conv_transpose3d(d2*(e2>0),w2,padding=1)
   dx=F.conv_transpose3d(ds*(sq>0),getattr(b,f'fire{i}_squeeze').weight)
  gradient=F.conv_transpose3d(dx*(x0>0),b.conv1.weight,stride=2,output_padding=1)
  return probs,gradient,cam,spatial

def reference(native,grid,tokens):
 captured=[]
 hook=native.model.Drug_Grid_CNNs.avg_pool.register_forward_pre_hook(lambda _,inputs:captured.append(inputs[0]))
 try:
  x=grid.detach().requires_grad_();score=native(x,tokens);spatial=captured[-1];gradient,ds=torch.autograd.grad(score[0,1],(x,spatial))
  cam=F.relu((ds.mean((2,3,4),keepdim=True)*spatial).sum(1))
  return tuple(x.detach() for x in (score,gradient,cam,spatial))
 finally:hook.remove()

def architecture_smoke():
 source=ROOT/'artifacts/research-source/fusion-aofb';tree=ast.parse((source/'model.py').read_text(encoding='utf-8'));scope={'torch':torch,'nn':nn,'F':F}
 exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.ClassDef) and n.name in ('GridNet','GridSmiMCANet')],type_ignores=[]),'original-architecture','exec'),scope)
 hp=ex.module('fusion_config',source/'config.py').hyperparameter()
 class Wrapper(nn.Module):
  def __init__(self):super().__init__();self.model=scope['GridSmiMCANet'](hp)
  def forward(self,g,t):return torch.softmax(self.model(g,t,None),1)
 return Wrapper().eval()

def main():
 torch.set_num_threads(4);torch.manual_seed(234)
 smoke='--architecture-smoke' in sys.argv
 native=architecture_smoke() if smoke else ex.load_fusion()[0]
 native.requires_grad_(False);model=FusionDerivatives(native).eval()
 g=torch.rand(1,28,24,24,24)*.3;t=torch.randint(0,65,(1,100));expected=reference(native,g,t)
 with torch.no_grad():actual=model(g,t)
 errors={name:float((a-b).abs().max()) for name,a,b in zip(['screening_scores','input_gradient','grad_cam','spatial_activation'],actual,expected)}
 print(json.dumps({'randomArchitectureSmoke':smoke,'errors':errors}),flush=True)
 if max(errors.values())>1e-5:raise ValueError('Analytic derivative mismatch')
 if smoke:
  (ROOT/'artifacts/fusion-derivative-architecture-smoke.json').write_text(json.dumps({'learnedWeights':False,'errors':errors},indent=2));return
 import onnx,onnxruntime as ort
 out=ROOT/'public/research/fusion-aofb';out.mkdir(exist_ok=True,parents=True);dest=out/'gradients.onnx'
 torch.onnx.export(model,(g,t),str(dest),input_names=['grid','tokens'],output_names=['screening_scores','input_gradient','grad_cam','spatial_activation'],opset_version=17,dynamo=False,do_constant_folding=False)
 external=ex.externalize(dest)
 onnx.checker.check_model(str(dest));session=ort.InferenceSession(str(dest),providers=['CPUExecutionProvider']);actual=session.run(None,{'grid':g.numpy(),'tokens':t.numpy()})
 report={'checkpointSha256':ex.digest(ROOT/'artifacts/research-source/fusion-aofb/valid_best_checkpoint.pth'),'artifact':ex.artifact(dest),'analyticErrors':errors,'onnxErrors':{name:float(np.max(np.abs(a-b.numpy()))) for name,a,b in zip(['screening_scores','input_gradient','grad_cam','spatial_activation'],actual,expected)}}
 manifest=json.loads((out/'manifest.json').read_text());manifest.update(artifact=ex.artifact(dest),externalData=external,examples=[],validation={'status':'pending'})
 manifest['outputs']=[{'name':n,'dtype':'float32','shape':shape} for n,shape in [('screening_scores',[1,2]),('input_gradient',[1,28,24,24,24]),('grad_cam',[1,12,12,12]),('spatial_activation',[1,256,12,12,12])]]
 (out/'gradients-manifest.json').write_text(json.dumps(manifest,indent=2))
 (ROOT/'artifacts/fusion-gradients-export.json').write_text(json.dumps(report,indent=2));print(json.dumps(report),flush=True)
if __name__=='__main__':main()
