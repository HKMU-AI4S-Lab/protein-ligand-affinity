"""Export verified scientific panels for responsive editorial figures.

Layouts and all explanatory labels live in TeachingFigure.astro. This script only
renders chemistry, spatial frames and measured arrays, never invented activations.
Existing paper crops and previous teaching exports are not changed.
"""
from pathlib import Path
import json,hashlib
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap
from matplotlib.patches import Rectangle
from mpl_toolkits.mplot3d.art3d import Poly3DCollection
from rdkit import Chem
from rdkit.Chem.Draw import rdMolDraw2D
from PIL import Image
R=Path(__file__).resolve().parents[1];O=R/'public/illustrations/panels';O.mkdir(exist_ok=True)
plt.rcParams.update({'font.family':'Arial','font.size':20,'svg.fonttype':'none','axes.spines.top':False,'axes.spines.right':False,'savefig.facecolor':'white'})
BLUE='#345da8';OCHRE='#a76436';ATOM={'C':'#555b64','N':'#305dd8','O':'#e43d30','H':'#eeeeee','S':'#e4bf34'}
CM=LinearSegmentedColormap.from_list('density',['#f2f5fc',BLUE]);CAM=LinearSegmentedColormap.from_list('cam',['#f2f5fc','#315da8'])
def read(p):return json.loads((R/p).read_text(encoding='utf-8'))
def hash(p):return hashlib.sha256((R/p).read_bytes()).hexdigest()
D=read('artifacts/research-illustration-data.json')['aspirin'];C=read('artifacts/gradcam-illustration-data.json');E=read('public/research/gnina-crossdock/manifest.json')['examples'][0]
assert hash(C['source']['path'])==C['source']['sha256']
r=next(v for v in read(C['source']['path']) if v['input']['smiles']=='CCO')
assert C['checkpointSha256']==r['result']['checkpointSha256']
np.testing.assert_allclose(C['cam'],np.asarray(r['explanation']['values']).reshape(12,12,12)[:,:,C['zIndex']].T[::-1].flatten(),atol=1e-10)
local_paths={k:E[k].get('path',f"research/gnina-crossdock/{E['id']}-grid.bin") for k in ['grid','protein','structure']}
for k in local_paths:assert hash('public/'+local_paths[k])==E[k]['sha256']
G=np.fromfile(R/'public'/local_paths['grid'],dtype='<f4').reshape(28,48,48,48)
N=read('artifacts/gnina-native-occlusion.json')['1hsg'];assert N['gridSha256']==E['grid']['sha256']
import sys
if '--check-inputs' in sys.argv:
 print('Teaching inputs retain verified molecular coordinates, grid bytes, checkpoint and Grad-CAM arrays')
 sys.exit(0)
outputs=[]
def save(fig,name):
 p=O/(name+'.svg');fig.savefig(p,bbox_inches='tight',pad_inches=.12);plt.close(fig);outputs.append(p)
def atoms(name,mol,xyz,lo,hi,plane=None,region=False):
 fig=plt.figure(figsize=(4.8,4.8));ax=fig.add_axes([0,0,1,1],projection='3d')
 for bond in mol.GetBonds():
  i,j=bond.GetBeginAtomIdx(),bond.GetEndAtomIdx()
  if mol.GetAtomWithIdx(i).GetSymbol()=='H' or mol.GetAtomWithIdx(j).GetSymbol()=='H':continue
  midpoint=(xyz[i]+xyz[j])/2
  for k in [i,j]:ax.plot(*np.array([xyz[k],midpoint]).T,color=ATOM.get(mol.GetAtomWithIdx(k).GetSymbol(),'#777'),linewidth=4,solid_capstyle='round')
 for atom,p in zip(mol.GetAtoms(),xyz):
  if atom.GetSymbol()!='H':ax.scatter(*p,s=100,color=ATOM.get(atom.GetSymbol(),'#777'),edgecolor='white',linewidth=.8,depthshade=True)
 import itertools
 def cube(a,b,col,lw):
  corners=list(itertools.product(*zip(a,b)))
  for i,p in enumerate(corners):
   for q in corners[i+1:]:
    if sum(x!=y for x,y in zip(p,q))==1:ax.plot(*np.asarray([p,q]).T,c=col,lw=lw,alpha=.7)
 cube(lo,hi,'#bac4ce',.6)
 if plane is not None:
  verts=[[(lo[0],lo[1],plane),(hi[0],lo[1],plane),(hi[0],hi[1],plane),(lo[0],hi[1],plane)]]
  ax.add_collection3d(Poly3DCollection(verts,facecolor=BLUE,edgecolor=BLUE,alpha=.10,linewidth=1))
 if region:cube(lo,(lo+hi)/2,OCHRE,1.8)
 ax.set(xlim=(lo[0],hi[0]),ylim=(lo[1],hi[1]),zlim=(lo[2],hi[2]));ax.set_box_aspect(hi-lo);ax.view_init(23,-57);ax.set_axis_off();save(fig,name)
def heat(name,arr,extent,maximum,label,mask=False,overlay=None):
 fig,ax=plt.subplots(figsize=(4.5,4.5));im=ax.imshow(arr,origin='upper',extent=extent,vmin=0,vmax=maximum,cmap=CAM if 'cam' in name else CM,interpolation='nearest')
 ax.set_xlabel('x (Å)');ax.set_ylabel('y (Å)');ax.tick_params(labelsize=20);ax.set_xticks([extent[0],extent[1]],labels=[f'{extent[0]:.1f}',f'{extent[1]:.1f}']);ax.set_yticks([extent[2],extent[3]],labels=[f'{extent[2]:.1f}',f'{extent[3]:.1f}'])
 if mask:ax.add_patch(Rectangle((extent[0],extent[2]),(extent[1]-extent[0])/2,(extent[3]-extent[2])/2,fill=False,edgecolor=OCHRE,lw=1.5,hatch='//'))
 if overlay:
  mol,xyz=overlay
  for bond in mol.GetBonds():
   i,j=bond.GetBeginAtomIdx(),bond.GetEndAtomIdx()
   if mol.GetAtomWithIdx(i).GetSymbol()!='H' and mol.GetAtomWithIdx(j).GetSymbol()!='H':
    ax.plot(xyz[[i,j],0],xyz[[i,j],1],c='white',lw=4);ax.plot(xyz[[i,j],0],xyz[[i,j],1],c='#30353b',lw=1)
  for atom,p in zip(mol.GetAtoms(),xyz):
   if atom.GetSymbol()!='H':ax.scatter(*p[:2],s=35,c=ATOM[atom.GetSymbol()],edgecolor='white',lw=.6)
 cb=fig.colorbar(im,ax=ax,orientation='horizontal',shrink=.9,pad=.24,aspect=30);cb.set_ticks([0,maximum]);cb.set_ticklabels(['0','0.00001' if maximum==1e-5 else f'{maximum:.3f}']);cb.set_label(label,fontsize=20);cb.outline.set_visible(False)
 save(fig,name)
asp=Chem.MolFromSmiles(D['smiles']);assert Chem.MolToSmiles(asp)==Chem.MolToSmiles(Chem.MolFromSmiles('CC(=O)Oc1ccccc1C(=O)O'))
assert [a.GetSymbol() for a in asp.GetAtoms()]==[a['symbol'] for a in D['atoms'][:asp.GetNumAtoms()]]
xyz=np.asarray([a['xyz'] for a in D['atoms'][:asp.GetNumAtoms()]]);g=D['gridSlices'];lo=np.array(g['origin'])+8;hi=lo+8;z=g['origin'][2]+(g['z']+.5)*g['spacing']
d=rdMolDraw2D.MolDraw2DSVG(480,340);d.drawOptions().bondLineWidth=2;d.drawOptions().padding=.08;d.drawOptions().baseFontSize=.8;rdMolDraw2D.PrepareAndDrawMolecule(d,asp);d.FinishDrawing();p=O/'aspirin-structure.svg';p.write_text(d.GetDrawingText());outputs.append(p)
atoms('aspirin-space',asp,xyz,lo,hi,plane=z)
carbon=np.asarray(g['carbon']).reshape(48,48)[16:32,16:32];oxygen=np.asarray(g['oxygen']).reshape(48,48)[16:32,16:32];maximum=max(carbon.max(),oxygen.max());extent=[lo[0],hi[0],lo[1],hi[1]]
for k,data in [('carbon',carbon),('oxygen',oxygen)]:heat('aspirin-'+k,data,extent,maximum,'Atomic density')
eth=Chem.MolFromMolBlock(r['result']['molblock'],removeHs=False);xyz=eth.GetConformer().GetPositions();origin=np.asarray(C['spatialFrame']['origin']);zcam=origin[2]+2*C['zIndex']
atoms('ethanol-space',eth,xyz,xyz.min(0)-2,xyz.max(0)+2,plane=zcam)
heat('ethanol-cam',np.asarray(C['cam']).reshape(12,12),[origin[0]-1,origin[0]+23,origin[1]-1,origin[1]+23],1e-5,'Grad-CAM intensity',overlay=(eth,xyz))
center=np.asarray(E['center']);lo=center-12;hi=center+12;extent=[lo[0],hi[0],lo[1],hi[1]]
maximum=max(G[0,:,:,23].max(),G[14,:,:,23].max())
for ch,n in [(0,'protein'),(14,'ligand')]:heat('1hsg-'+n,G[ch,:,:,23].T[::-1],extent,maximum,'Atomic density')
lig=Chem.MolFromMolFile(str(R/'public'/E['structure']['path']),removeHs=False);atoms('1hsg-region-a',lig,lig.GetConformer().GetPositions(),lo,hi,region=True)
original=G[:,:,:,11].sum(axis=0).T[::-1];masked=original.copy();masked[24:,:24]=0
assert np.array_equal(masked[:24],original[:24]) and np.all(masked[24:,:24]==0)
for name,data,mask in [('original',original,False),('masked',masked,True)]:heat('1hsg-'+name,data,extent,original.max(),'Sum of 28 channels',mask=mask)
inputs=['public/research/gnina-crossdock/manifest.json','artifacts/research-illustration-data.json','artifacts/gradcam-illustration-data.json',C['source']['path'],'artifacts/gnina-native-occlusion.json']+['public/'+local_paths[k] for k in ['grid','protein','structure']]
provenance={'generator':'scripts/prepare-teaching-panels.py','inputs':[{'path':p,'sha256':hash(p)} for p in inputs],'outputs':[{'path':p.relative_to(R).as_posix(),'sha256':hash(p.relative_to(R).as_posix())} for p in outputs],'aspirin':{'smiles':D['smiles'],'sliceIndex':g['z'],'z':z,'spacing':g['spacing'],'cropIndices':[16,32],'sharedScale':[0,float(max(carbon.max(),oxygen.max()))]},'gradcam':{'score':C['score'],'z':float(zcam),'scale':[0,1e-5],'checkpointSha256':C['checkpointSha256'],'spatialFrame':C['spatialFrame'],'orientation':'x right, y up; heavy atoms projected; native grid, no contrast normalization'},'occlusion':{'baseline':N['baseline'],'masked':N['baseline']-N['changes'][0],'delta':N['changes'][0],'region':'A: x,y,z indices below 24, all channels zeroed','sliceIndex':11,'scale':[0,float(original.max())]},'operations':'RDKit structure, fixed verified coordinates, direct array plots; no generated scientific content'}
(R/'artifacts/teaching-panel-provenance.json').write_text(json.dumps(provenance,indent=2)+'\n')
print('Exported',len(outputs),'verified panels')
