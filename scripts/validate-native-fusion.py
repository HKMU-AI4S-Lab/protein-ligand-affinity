"""Validate the learned full Fusion model on identical browser-generated inputs."""
from pathlib import Path
import importlib.util,json,time
import numpy as np,torch
ROOT=Path(__file__).resolve().parents[1]
def mod(name,file):
 spec=importlib.util.spec_from_file_location(name,ROOT/'scripts'/file);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
ex=mod('exporter','export-research-models.py');derivatives=mod('derivatives','export-fusion-gradients.py');pre=mod('preprocessing','prepare-fusion-fixtures.py')
torch.set_num_threads(4);native,_=ex.load_fusion();native.requires_grad_(False);analytic=derivatives.FusionDerivatives(native).eval();source=pre.load_native();folder=ROOT/'artifacts/fusion-input-references';cases=json.loads((folder/'inputs.json').read_text());report=[]
for case in cases:
 g=np.fromfile(ROOT/case['gridPath'],dtype='<f4').reshape(1,28,24,24,24);t=np.fromfile(ROOT/case['tokensPath'],dtype='<i8').reshape(1,100)
 expectedGrid=source['get_grid'](pre.pybel_atoms(case['atoms'])).reshape(g.shape);expectedTokens=source['label_smiles'](case['smiles'],source['CHARISOSMISET']).reshape(t.shape)
 if not np.array_equal(g,expectedGrid) or not np.array_equal(t,expectedTokens):raise ValueError('Native fixed-input preprocessing mismatch')
 grid=torch.from_numpy(g);tokens=torch.from_numpy(t);expected=derivatives.reference(native,grid,tokens)
 with torch.no_grad():actual=analytic(grid,tokens)
 entry={'id':case['id'],'smiles':case['smiles'],'score':expected[0][0,1].item(),'references':{},'analyticErrors':{},'coordinateMethod':case['coordinateMethod'],'gridSha256':ex.digest(ROOT/case['gridPath']),'tokensSha256':ex.digest(ROOT/case['tokensPath'])}
 for name,a,b in zip(['screening_scores','input_gradient','grad_cam','spatial_activation'],actual,expected):
  err=float((a-b).abs().max());entry['analyticErrors'][name]=err
  if err>1e-5:raise ValueError((name,err))
  p=folder/(case['id']+'-'+name+'.bin');b.numpy().astype('<f4').tofile(p);entry['references'][name]={'path':p.relative_to(ROOT).as_posix(),'sha256':ex.digest(p),'bytes':p.stat().st_size}
 with torch.no_grad():
  changes=[]
  for group in range(8):
   masked=grid.clone();x=(group>>2)&1;y=(group>>1)&1;z=group&1;masked[:,:,x*12:(x+1)*12,y*12:(y+1)*12,z*12:(z+1)*12]=0;changes.append(entry['score']-native(masked,tokens)[0,1].item())
  entry['occlusion']=changes
 if case['id'] in ('0','2'):
  total=torch.zeros_like(grid,dtype=torch.float64);coarse=total.clone();steps=128;started=time.time()
  for i in range(steps+1):
   x=(grid*(i/steps)).detach().requires_grad_();output=native(x,tokens);gradient=torch.autograd.grad(output[0,1],x)[0].detach().to(torch.float64);weight=.5 if i in (0,steps) else 1;total+=gradient*weight
   if i%2==0:coarse+=gradient*weight
   if i==0:entry['baselineScore']=output[0,1].item()
  entry['integratedGradients']={}
  for n,integral in [(64,coarse),(128,total)]:
   values=(grid*integral/n).sum(1)[0].numpy().astype('<f4');p=folder/(case['id']+f'-ig{n}.bin');values.tofile(p);entry['integratedGradients'][str(n)]={'path':p.relative_to(ROOT).as_posix(),'sha256':ex.digest(p),'bytes':p.stat().st_size,'completenessResidual':float(values.astype('f8').sum()-(entry['score']-entry['baselineScore']))}
  entry['integrationSeconds']=time.time()-started
 report.append(entry);print(json.dumps(entry),flush=True)
(folder/'native.json').write_text(json.dumps({'checkpointSha256':ex.digest(ROOT/'artifacts/research-source/fusion-aofb/valid_best_checkpoint.pth'),'cases':report},indent=2))
