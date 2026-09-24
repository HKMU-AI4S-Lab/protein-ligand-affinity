"""Exact FP32 exports. Run locally; no server or substitute models.

python scripts/export-research-models.py gnina
python scripts/export-research-models.py fusion
Native input fixtures must precede scientific validation; zero inputs only test export.
"""
import argparse, ast, hashlib, importlib.util, json, time
from pathlib import Path
import numpy as np
import torch
from torch import nn
import torch.nn.functional as F
import onnx
import onnxruntime as ort

ROOT=Path(__file__).resolve().parents[1]
def digest(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def module(name,p):
    spec=importlib.util.spec_from_file_location(name,p); m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
def artifact(p): return dict(path=p.relative_to(ROOT/'public').as_posix(),sha256=digest(p),bytes=p.stat().st_size)
def externalize(p):
    """Content-address shared FP32 initializers without changing a tensor byte."""
    model=onnx.load(str(p));weights=p.parent/'weights';weights.mkdir(exist_ok=True);artifacts=[]
    for tensor in model.graph.initializer:
        if len(tensor.raw_data)<65536:continue
        data=tensor.raw_data;sha=hashlib.sha256(data).hexdigest();dest=weights/(sha+'.bin')
        if not dest.exists():dest.write_bytes(data)
        elif digest(dest)!=sha:raise ValueError('Existing weight shard is corrupt')
        location='weights/'+dest.name
        onnx.external_data_helper.set_external_data(tensor,location=location)
        tensor.ClearField('raw_data');tensor.data_location=onnx.TensorProto.EXTERNAL
        artifacts.append(dict(path=location,artifact=artifact(dest)))
    p.write_bytes(model.SerializeToString())
    return list({a['path']:a for a in artifacts}.values())

def load_fusion():
    source=ROOT/'artifacts/research-source/fusion-aofb';p=source/'valid_best_checkpoint.pth'
    if p.stat().st_size!=900665297:raise ValueError(f'Incomplete fusion checkpoint: {p.stat().st_size} / 900665297 bytes. No replacement is allowed.')
    if digest(p)!='73029954ba6581365d5786c78768cf54f1d399c7f891f0e2b7bd5d8c371d12f1':raise ValueError('Fusion checkpoint hash mismatch')
    if digest(source/'model.py')!='7e0be1a53a248357b00c536d262fceb68689ada6ab8494ef089987c0632520cd':raise ValueError('Fusion architecture source hash mismatch')
    text=(source/'model.py').read_text(encoding='utf-8');tree=ast.parse(text);scope=dict(torch=torch,nn=nn,F=F)
    exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.ClassDef) and n.name in ('GridNet','GridSmiMCANet')],type_ignores=[]),str(source/'model.py'),'exec'),scope)
    hp=module('fusion_config',source/'config.py').hyperparameter();model=scope['GridSmiMCANet'](hp).eval()
    model.load_state_dict(torch.load(p,map_location='cpu',weights_only=True),strict=True)
    class Wrapper(nn.Module):
        def __init__(self):super().__init__();self.model=model
        def forward(self,grid,tokens):return torch.softmax(self.model(grid,tokens,None),dim=1)
    return Wrapper().eval(),p
def load_gnina():
    source=ROOT/'artifacts/research-source/gnina';p=source/'crossdock_default2018.pt'
    if digest(p)!='56990c0a31a7aa0a57c5445de64c3d59002bc23de9947a8d028548d89ca803b4':raise ValueError('GNINA checkpoint hash mismatch')
    if digest(source/'models.py')!='0cb48d0c5721338d622bc9c544ec6eb583653756467d3d94d8585a7c67d979b2':raise ValueError('GNINA architecture source hash mismatch')
    models=module('gnina_models',source/'models.py');model=models.Default2018Affinity((28,48,48,48)).eval()
    state=torch.load(p,map_location='cpu',weights_only=True)
    renamed={('features.'+k if 'conv' in k else ('pose.'+k if 'pose_output' in k else 'affinity.'+k)):v for k,v in state.items()}
    model.load_state_dict(renamed,strict=True)
    class Wrapper(nn.Module):
        def __init__(self):super().__init__();self.model=model
        def forward(self,grid):
            log_pose,affinity=self.model(grid);return log_pose.exp(),affinity.reshape(-1,1)
    return Wrapper().eval(),p
def curated_metadata(name, out):
    """Keep each exported example bound to the prepared native input provenance."""
    provenance=json.loads((ROOT/'artifacts/gnina-grid-provenance.json').read_text())
    source=next(r for r in provenance['sources'] if r['id']==name)
    grid=next(r for r in provenance['grids'] if r['id']==name)
    for path,expected in [(out/(name+'-grid.bin'),grid['gridSha256']),
                          (out/(name+'-protein.pdb'),source['receptorSha256']),
                          (out/(name+'.sdf'),source['ligandSha256'])]:
        if digest(path)!=expected:raise ValueError('Curated geometry/grid provenance mismatch: '+name)
    if len(grid['center'])!=3 or not np.isfinite(grid['center']).all():raise ValueError('Invalid grid center')
    ligand={'1hsg':'MK1','1hvr':'XK2'}[name]
    return dict(center=grid['center'],sourceUrl=source['source'],
                description='HIV-1 protease with bound inhibitor '+ligand+'. A prepared crystallographic complex for examining affinity and pose scoring.')

def main():
    args=argparse.ArgumentParser();args.add_argument('model',choices=['gnina','fusion']);args=args.parse_args()
    torch.set_num_threads(2);torch.manual_seed(0)
    fusion=args.model=='fusion';model,checkpoint=load_fusion() if fusion else load_gnina();id='fusion-aofb' if fusion else 'gnina-crossdock'
    out=ROOT/'public/research'/id;out.mkdir(parents=True,exist_ok=True)
    dims=[1,28,24,24,24] if fusion else [1,28,48,48,48]
    grid=torch.zeros(dims,dtype=torch.float32);inputs=(grid,torch.zeros([1,100],dtype=torch.int64)) if fusion else (grid,)
    input_names=['grid','tokens'] if fusion else ['grid'];output_names=['screening_scores'] if fusion else ['pose_scores','affinity']
    dest=out/'model.onnx';start=time.perf_counter()
    torch.onnx.export(model,inputs,str(dest),input_names=input_names,output_names=output_names,opset_version=17,dynamo=False)
    external=externalize(dest) if fusion else []
    onnx.checker.check_model(str(dest))
    session=ort.InferenceSession(str(dest),providers=['CPUExecutionProvider']);actual=session.run(None,{n:t.numpy() for n,t in zip(input_names,inputs)})
    with torch.inference_mode():native=model(*inputs)
    if fusion:native=(native,)
    errors=[float(np.max(np.abs(a-b.numpy()))) for a,b in zip(actual,native)]
    manifest=dict(schemaVersion=3,id=id,format='onnx',runtime='onnxruntime-web',backend='wasm',precision='fp32',preprocessingVersion='fusion-grid-source-v1' if fusion else 'libmolgrid-0.5.5-gnina-default-types-v1',checkpointSha256=digest(checkpoint),sourceRevision=digest(checkpoint.parent/'model.py') if fusion else '5196d00ec78738428313a1af9a11bf73c550edd3',license='Source redistribution review pending' if fusion else 'gnina-torch MIT; upstream GNINA attribution required',redistributionApproved=False,artifact=artifact(dest),externalData=external,executionLocation='browser',explanationCapabilities=['grouped-spatial-occlusion','grad-cam','integrated-gradients'],inputs=[dict(name='grid',dtype='float32',shape=dims)]+([dict(name='tokens',dtype='int64',shape=[1,100])] if fusion else []),outputs=[dict(name=output_names[0],dtype='float32',shape=[1,2])]+([] if fusion else [dict(name='affinity',dtype='float32',shape=[1,1])]),validation=dict(status='pending'),examples=[])
    # Bind curated native grids and final predictions. No generated substitute grids.
    references=[]
    for fixture in sorted(out.glob('*-grid.bin')):
        x=np.fromfile(fixture,dtype='<f4').reshape(dims)
        if fusion:continue # Fusion fixtures must include their original token arrays.
        t=torch.from_numpy(x)
        with torch.inference_mode():pose,affinity=model(t)
        predicted=session.run(None,{'grid':x});err=float(abs(predicted[1].item()-affinity.item()))
        if err>.01:raise ValueError('GNINA native/ONNX affinity parity failed')
        name=fixture.name.removesuffix('-grid.bin');structure=out/(name+'.sdf')
        label={'1hsg':'1HSG · HIV protease / MK1','1hvr':'1HVR · HIV protease / XK2'}.get(name,name)
        manifest['examples'].append(dict(id=name,label=label,grid=artifact(fixture),structure=artifact(structure),referenceAffinity=float(affinity.item()),**curated_metadata(name,out),**({'protein':artifact(out/(name+'-protein.pdb'))} if (out/(name+'-protein.pdb')).exists() else {})))
        references.append(dict(id=name,affinity=float(affinity.item()),poseScores=pose.numpy().tolist(),onnxMaxAffinityError=err,gridSha256=digest(fixture)))
    regression=[]
    if not fusion:
        for name,score_ref,aff_ref in [('r1l1',.64764,1.28360),('r2l2',.43467,1.27934),('r1l2',.19287,1.06574)]:
            fixture=checkpoint.parent/('regression-'+name+'-grid.bin')
            if not fixture.exists():continue
            with torch.inference_mode():pose,affinity=model(torch.from_numpy(np.fromfile(fixture,dtype='<f4').reshape(dims)))
            errors_ref=[abs(pose[0,1].item()-score_ref),abs(affinity.item()-aff_ref)]
            if max(errors_ref)>.005:raise ValueError(f'Published GNINA regression failed: {name} {errors_ref}')
            regression.append(dict(id=name,pose=pose[0,1].item(),affinity=affinity.item(),publishedReferenceErrors=errors_ref))
    (out/'manifest.json').write_text(json.dumps(manifest,indent=2))
    report=dict(model=id,torch=torch.__version__,onnx=onnx.__version__,onnxruntime=ort.__version__,seconds=time.perf_counter()-start,checkpointSha256=digest(checkpoint),onnxSha256=digest(dest),bytes=dest.stat().st_size,zeroInputOperatorSmokeErrors=errors,curatedReferences=references,publishedGninaRegression=regression,scientificValidation='pending browser execution',operators=sorted(set(n.op_type for n in onnx.load(dest).graph.node)))
    (ROOT/'artifacts'/f'{id}-export.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
if __name__=='__main__':main()
