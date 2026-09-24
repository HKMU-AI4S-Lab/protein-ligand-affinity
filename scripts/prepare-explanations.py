"""Precomputed GNINA Grad-CAM and Integrated Gradients on exact curated grids.
These fixtures explain CNNaffinity only. They are not visitor-input explanations.
"""
import importlib.util,json,hashlib
from pathlib import Path
import numpy as np
import torch
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('exporter',ROOT/'scripts/export-research-models.py');ex=importlib.util.module_from_spec(spec);spec.loader.exec_module(ex)
torch.set_num_threads(2)
model,checkpoint=ex.load_gnina();out=ROOT/'public/research/gnina-crossdock';manifest=json.loads((out/'manifest.json').read_text(encoding='utf-8'))
for example in manifest['examples']:
    path=ROOT/'public'/example['grid']['path'];grid=torch.from_numpy(np.fromfile(path,dtype='<f4').reshape(1,28,48,48,48)).requires_grad_()
    captured=[]
    handle=model.model.features.register_forward_hook(lambda module,inputs,output:captured.append(output))
    _,affinity=model(grid);activation=captured[-1];gradient=torch.autograd.grad(affinity.sum(),activation)[0];handle.remove()
    cam=torch.relu((gradient.mean((2,3,4),keepdim=True)*activation).sum(1))[0].detach().numpy()
    with torch.no_grad():baseline=model(torch.zeros_like(grid))[1].item()
    def integrate(steps):
        total=torch.zeros_like(grid)
        for i in range(steps+1):
            x=(grid.detach()*(i/steps)).requires_grad_();score=model(x)[1]
            gradient=torch.autograd.grad(score.sum(),x)[0]
            total+=gradient.detach()*(.5 if i in (0,steps) else 1)
        return (grid.detach()*total/steps).sum(1)[0].numpy()
    coarse=integrate(64);ig=integrate(128)
    delta=affinity.item()-baseline;residual=float(ig.sum()-delta)
    # Report error rather than implying exact completeness from a finite quadrature.
    payload=dict(schemaVersion=1,execution='precomputed',exampleId=example['id'],checkpointSha256=manifest['checkpointSha256'],gridSha256=example['grid']['sha256'],target='CNNaffinity',targetValue=affinity.item(),coordinateSystem='Exact libmolgrid reference grid; x,y,z axes; channel-summed spatial attribution',gradCam=dict(layer='features output: final spatial ReLU before flattening',shape=list(cam.shape),values=cam.flatten().tolist(),projection=cam.sum(2).flatten().tolist(),projectionShape=list(cam.shape[:2]),positiveOnly=True),integratedGradients=dict(baseline='all-zero density grid',baselineScore=baseline,steps=128,quadrature='trapezoidal',shape=list(ig.shape),projection=ig.sum(2).flatten().tolist(),projectionShape=list(ig.shape[:2]),attributionSum=float(ig.sum()),outputDifference=delta,completenessResidual=residual,coarse64Residual=float(coarse.sum()-delta),signed=True),limitations=['Precomputed for this exact complex, grid and checkpoint only.','Zero-density baseline and spatial masking can be chemically unrealistic.','Grad-CAM is coarse positive localisation; Integrated Gradients is signed attribution. Neither proves a physical mechanism.'])
    dest=out/(example['id']+'-explanations.json');dest.write_text(json.dumps(payload,separators=(',',':')))
    example['explanation']=ex.artifact(dest)
    print(example['id'],'IG residual',residual,flush=True)
(out/'manifest.json').write_text(json.dumps(manifest,indent=2))
