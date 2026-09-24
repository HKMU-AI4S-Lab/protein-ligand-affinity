"""Recheck actual UI-submitted Fusion grids and live explanations with native PyTorch."""
from pathlib import Path
import importlib.util,json,hashlib,sys
import numpy as np,torch
root=Path(__file__).resolve().parents[1]
def module(name,file):
 spec=importlib.util.spec_from_file_location(name,root/'scripts'/file);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
ex=module('exporter','export-research-models.py');deriv=module('derivative','export-fusion-gradients.py');pre=module('pre','prepare-fusion-fixtures.py').load_native()
torch.set_num_threads(4);native,_=ex.load_fusion();native.requires_grad_(False);source=Path(sys.argv[1]) if len(sys.argv)>1 else root/'artifacts/fusion-ui-outputs.json';records=json.loads(source.read_text());results=[]
for r in records:
 result=r['result'];grid=np.asarray(result['grid']['data'],dtype='<f4').reshape(1,28,24,24,24);tokens=pre['label_smiles'](r['input']['smiles'],pre['CHARISOSMISET']).astype('<i8').reshape(1,100)
 assert hashlib.sha256(grid.tobytes()).hexdigest()==result['gridSha256'];assert hashlib.sha256(tokens.tobytes()).hexdigest()==result['tokensSha256']
 g=torch.from_numpy(grid);t=torch.from_numpy(tokens)
 with torch.no_grad():score=native(g,t)[0,1].item()
 entry={'smiles':r['input']['smiles'],'gridSha256':result['gridSha256'],'scoreError':abs(score-result['outputs'][0]['value'])};assert entry['scoreError']<=1e-4
 e=r.get('explanation')
 if e:
  assert e['gridSha256']==result['gridSha256'] and e['tokensSha256']==result['tokensSha256'];method=e['method'];entry['method']=method
  if method=='grad-cam':expected=deriv.reference(native,g,t)[2].numpy().reshape(-1)
  elif method=='grouped-spatial-occlusion':
   changes=[]
   with torch.no_grad():
    for group in range(8):
     mask=g.clone();x=(group>>2)&1;y=(group>>1)&1;z=group&1;mask[:,:,x*12:(x+1)*12,y*12:(y+1)*12,z*12:(z+1)*12]=0;changes.append(score-native(mask,t)[0,1].item())
   expected=np.asarray(changes)
  else:
   n=e['steps'];total=torch.zeros_like(g,dtype=torch.float64)
   for i in range(n+1):
    x=(g*(i/n)).detach().requires_grad_();y=native(x,t)[0,1];gradient=torch.autograd.grad(y,x)[0].detach();total+=gradient.to(torch.float64)*(.5 if i in (0,n) else 1)
   expected=(g*total/n).sum(1).numpy().reshape(-1)
  actual=np.asarray(e['values']);entry['explanationMaxAbsError']=float(np.max(np.abs(expected-actual)))
  if method=='grad-cam':
   np.testing.assert_allclose(actual,expected,atol=1e-10,rtol=1e-3)
   entry['gradCamTolerance']={'atol':1e-10,'rtol':1e-3}
   assert e['spatialFrame']['spacing']==[2,2,2] and e['spatialFrame']['axes']==['x','y','z']
   np.testing.assert_allclose(e['spatialFrame']['origin'],np.asarray(result['center'])-9.5,atol=1e-12)
  else:assert entry['explanationMaxAbsError']<=1e-4
 results.append(entry);print(json.dumps(entry),flush=True)
out=source.with_name(source.stem+'-native-validation.json');out.write_text(json.dumps({'passed':True,'checkpointSha256':result['checkpointSha256'],'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'cases':results},indent=2))
