"""Capture native intermediate values for the illustrated Grad-CAM example."""
from pathlib import Path
import importlib.util, json, hashlib
import numpy as np
import torch
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('exporter',ROOT/'scripts/export-research-models.py')
ex=importlib.util.module_from_spec(spec);spec.loader.exec_module(ex)
spec=importlib.util.spec_from_file_location('pre',ROOT/'scripts/prepare-fusion-fixtures.py')
pre=importlib.util.module_from_spec(spec);spec.loader.exec_module(pre);native_pre=pre.load_native()
source=ROOT/'artifacts/illustrated-chrome-fusion-outputs.json'
record=next(r for r in json.loads(source.read_text()) if r['input']['smiles']=='CCO')
torch.set_num_threads(4);native,_=ex.load_fusion();native.requires_grad_(False)
g=torch.tensor(record['result']['grid']['data'],dtype=torch.float32).reshape(1,28,24,24,24).requires_grad_()
t=torch.from_numpy(native_pre['label_smiles']('CCO',native_pre['CHARISOSMISET']).astype('int64').reshape(1,100))
captured=[];hook=native.model.Drug_Grid_CNNs.avg_pool.register_forward_pre_hook(lambda _,inputs:captured.append(inputs[0]))
score=native(g,t)[0,1];activation=captured[-1];gradient=torch.autograd.grad(score,activation)[0];hook.remove()
weights=gradient.mean((2,3,4));cam=torch.relu((weights[:,:,None,None,None]*activation).sum(1))[0]
np.testing.assert_allclose(cam.detach().numpy().reshape(-1),record['explanation']['values'],atol=1e-10,rtol=1e-3)
channels=torch.argsort((weights.abs()*activation.detach().mean((2,3,4)))[0],descending=True)[:3].tolist()
result={'source':{'path':str(source.relative_to(ROOT)).replace('\\','/'),'sha256':hashlib.sha256(source.read_bytes()).hexdigest()},'checkpointSha256':record['result']['checkpointSha256'],'smiles':'CCO','score':float(score.detach()),'zIndex':5,'spatialFrame':record['explanation']['spatialFrame'],'channels':[{'index':c,'weight':float(weights[0,c]),'slice':activation[0,c,:,:,5].detach().numpy().T[::-1].reshape(-1).tolist()} for c in channels],'cam':cam[:,:,5].detach().numpy().T[::-1].reshape(-1).tolist(),'maxError':float(np.max(np.abs(cam.detach().numpy().reshape(-1)-record['explanation']['values'])))}
(ROOT/'artifacts/gradcam-illustration-data.json').write_text(json.dumps(result,indent=2))
print('Native Grad-CAM illustration values verified:',result['maxError'])
