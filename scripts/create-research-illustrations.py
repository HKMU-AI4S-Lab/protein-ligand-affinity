"""Four reproducible teaching figures, using verified molecular coordinates/arrays.

Run from the project root. Scientific contract: docs/three-method-refinement.md.
No model inference, contrast amplification or paper-image modification occurs here.
"""
from pathlib import Path
from io import BytesIO
import hashlib, itertools, json, os, sys, textwrap
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle, FancyArrowPatch
from matplotlib.colors import LinearSegmentedColormap, Normalize
from mpl_toolkits.mplot3d.art3d import Poly3DCollection
from mpl_toolkits.mplot3d import proj3d
from PIL import Image, ImageChops
from rdkit import Chem
from rdkit.Chem.Draw import rdMolDraw2D

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/illustrations'; QA=ROOT/'artifacts/figure-qa'; QA.mkdir(exist_ok=True)
SKILL=Path(os.environ.get('NATURE_FIGURE_SCRIPTS',str(Path.home()/'.codex/skills/nature-figure/scripts')))
sys.path.insert(0,str(SKILL))
from audit_panel_alignment import require_matplotlib_panel_alignment
plt.rcParams.update({'font.family':'Arial','svg.fonttype':'none','pdf.fonttype':42,'axes.unicode_minus':False,'savefig.facecolor':'white'})
BLUE='#345da8'; VIOLET='#8066a5'; OCHRE='#a76436'; INK='#203047'; MUTED='#586579'
ATOM={'C':'#555b64','O':'#e43d30','N':'#305dd8','H':'#eeeeee','S':'#e4bf34'}
CMAP=LinearSegmentedColormap.from_list('density',['#f2f5fc',BLUE])
VCMAP=LinearSegmentedColormap.from_list('ligand',['#f7f4fb',VIOLET])
CAMMAP=LinearSegmentedColormap.from_list('cam',['#f2f5fc','#315da8'])
records=[]; image_crops={}
def sha(p): return hashlib.sha256((ROOT/p).read_bytes()).hexdigest()
def load(p): return json.loads((ROOT/p).read_text(encoding='utf-8'))
D=load('artifacts/research-illustration-data.json')['aspirin']
C=load('artifacts/gradcam-illustration-data.json')
assert sha(C['source']['path'])==C['source']['sha256']
captured=load(C['source']['path'])
ethanol=next(r for r in captured if r['input']['smiles']==C['smiles'])
assert C['checkpointSha256']==ethanol['result']['checkpointSha256']
raw_cam=np.array(ethanol['explanation']['values']).reshape(12,12,12)
np.testing.assert_allclose(np.array(C['cam']).reshape(12,12),raw_cam[:,:,C['zIndex']].T[::-1],atol=1e-10)
E=load('public/research/gnina-crossdock/manifest.json')['examples'][0]
gridpath='public/'+E['grid']['path']; protpath='public/'+E['protein']['path']; ligpath='public/'+E['structure']['path']
for key,p in [('grid',gridpath),('protein',protpath),('structure',ligpath)]: assert sha(p)==E[key]['sha256']
G=np.fromfile(ROOT/gridpath,dtype='<f4').reshape(28,48,48,48)
N=load('artifacts/gnina-native-occlusion.json')['1hsg']; assert N['gridSha256']==sha(gridpath)
lig=Chem.MolFromMolFile(str(ROOT/ligpath),removeHs=False)
eth=Chem.MolFromMolBlock(ethanol['result']['molblock'],removeHs=False)
asp=Chem.MolFromSmiles(D['smiles']); assert Chem.MolToSmiles(asp)==Chem.MolToSmiles(Chem.MolFromSmiles('CC(=O)Oc1ccccc1C(=O)O'))
assert [a.GetSymbol() for a in asp.GetAtoms()]==[a['symbol'] for a in D['atoms'][:asp.GetNumAtoms()]]
ASP=np.array([a['xyz'] for a in D['atoms'][:asp.GetNumAtoms()]])
LIG=lig.GetConformer().GetPositions(); ETH=eth.GetConformer().GetPositions()
center=np.array(E['center']); grid_min=center-12; grid_max=center+12

def label(ax,x,y,s,size=None,color=INK,ha='left',weight='normal'):
    return ax.text(x,y,s,transform=ax.transAxes,fontsize=size or FS,color=color,ha=ha,va='center',weight=weight,linespacing=1.45)
def arrow(ax,a,b,color=BLUE,dashed=False):
    ax.add_patch(FancyArrowPatch(a,b,arrowstyle='-|>',mutation_scale=16,linewidth=1.5,color=color,linestyle='--' if dashed else '-',transform=ax.transAxes))
def box(ax,x,y,w,h,s,color=BLUE,size=None):
    ax.add_patch(Rectangle((x,y),w,h,transform=ax.transAxes,facecolor='#f7f9fc',edgecolor=color,linewidth=1.2))
    label(ax,x+w/2,y+h/2,s,size,color,ha='center')
def sub(ax,rect,projection=None):
    return ax.inset_axes(rect,projection=projection)
def outline3(ax,lo,hi,color=BLUE,alpha=1,lw=1):
    corners=list(itertools.product(*zip(lo,hi)))
    for i,a in enumerate(corners):
        for b in corners[i+1:]:
            if sum(x!=y for x,y in zip(a,b))==1: ax.plot(*np.array([a,b]).T,color=color,alpha=alpha,lw=lw)
def molecule(ax,coords,mol,rect,lo,hi,plane=None,region=False,pocket=False):
    a=sub(ax,rect,'3d')
    if pocket:
        # Prepared protein heavy atoms within 5 Angstrom of the ligand, no reorientation.
        pts=[]
        for line in (ROOT/protpath).read_text().splitlines():
            if line.startswith(('ATOM  ','HETATM')):
                v=np.array([float(line[30:38]),float(line[38:46]),float(line[46:54])])
                if np.min(np.linalg.norm(LIG-v,axis=1))<=5: pts.append(v)
        p=np.array(pts);a.scatter(*p.T,c='#97a8c0',s=4,alpha=.3,depthshade=False)
    for b in mol.GetBonds():
        i,j=b.GetBeginAtomIdx(),b.GetEndAtomIdx()
        if mol.GetAtomWithIdx(i).GetSymbol()!='H' and mol.GetAtomWithIdx(j).GetSymbol()!='H': a.plot(*coords[[i,j]].T,color='#777e89',lw=2.1)
    for atom,p in zip(mol.GetAtoms(),coords):
        if atom.GetSymbol()!='H':a.scatter(*p,c=ATOM.get(atom.GetSymbol(),'#777777'),s=64,edgecolors='white',linewidths=.6,depthshade=False)
    outline3(a,lo,hi,color='#afbac9',lw=.8)
    if plane is not None:
        verts=[[(lo[0],lo[1],plane),(hi[0],lo[1],plane),(hi[0],hi[1],plane),(lo[0],hi[1],plane)]]
        a.add_collection3d(Poly3DCollection(verts,facecolors=BLUE,edgecolors=BLUE,alpha=.12,linewidths=1))
    if region:
        outline3(a,grid_min,center,color=OCHRE,lw=2)
        a.add_collection3d(Poly3DCollection([[(grid_min[0],grid_min[1],center[2]),(center[0],grid_min[1],center[2]),tuple(center),(grid_min[0],center[1],center[2])]],facecolor=OCHRE,alpha=.08))
    a.set(xlim=(lo[0],hi[0]),ylim=(lo[1],hi[1]),zlim=(lo[2],hi[2]))
    a.set_box_aspect(np.array(hi)-np.array(lo));a.view_init(elev=23,azim=-57);a.set_axis_off()
    # A separate orientation triad uses the actual camera projection.
    triad=sub(ax,[0,.21,.23,.24]);triad.set_axis_off();triad.patch.set_alpha(0)
    start=np.array(proj3d.proj_transform(*lo,a.get_proj())[:2])
    for i,name in enumerate(['x','y','z']):
        at=np.array(lo,dtype=float);at[i]+=1
        direction=np.array(proj3d.proj_transform(*at,a.get_proj())[:2])-start
        direction/=np.linalg.norm(direction)
        anchor=np.array([.16,.20]);end=anchor+direction*.36
        arrow(triad,anchor,end,MUTED);pos=anchor+direction*.65
        label(triad,*pos,name,TICK,MUTED,ha='center')
    return a
def heat(ax,data,rect,extent,title='',cmap=CMAP,vmax=None,mask=False,compact=False):
    a=sub(ax,rect);im=a.imshow(data,origin='upper',extent=extent,cmap=cmap,vmin=0,vmax=vmax,interpolation='nearest',aspect='equal')
    a.tick_params(labelsize=TICK,length=2,pad=3);a.set_xticks([extent[0],extent[1]],labels=[f'{extent[0]:.1f}',f'{extent[1]:.1f}']);a.set_yticks([extent[2],extent[3]],labels=[f'{extent[2]:.1f}',f'{extent[3]:.1f}'])
    a.tick_params(axis='y',pad=14)
    if compact:
        a.set_xticks([]);a.set_yticks([])
    else:
        a.set_xlabel('x (Å)',fontsize=TICK,labelpad=2);a.set_ylabel('y (Å)',fontsize=TICK,labelpad=2)
    for spine in a.spines.values():spine.set_color('#b4bfce')
    if title:a.set_title(title,fontsize=FS,color=INK,pad=12)
    if mask:a.add_patch(Rectangle((extent[0],extent[2]),(extent[1]-extent[0])/2,(extent[3]-extent[2])/2,fill=False,hatch='//',edgecolor=OCHRE,lw=1.5))
    return a,im
def legend(ax,rect,vmax,cmap=CMAP,labeltext='Density'):
    a=sub(ax,rect);a.imshow(np.linspace(0,1,256).reshape(1,-1),cmap=cmap,aspect='auto',extent=[0,1,0,1]);a.set_axis_off()
    label(ax,rect[0],rect[1]-.045,'0',TICK,MUTED);label(ax,rect[0]+rect[2],rect[1]-.045,f'{vmax:g}',TICK,MUTED,ha='right');label(ax,rect[0],rect[1]+.07,labeltext,TICK,MUTED)
def photo(ax,name,rect):
    path=OUT/'molecular-panels'/f'{name}.png';im=Image.open(path).convert('RGB')
    bounds=ImageChops.difference(im,Image.new('RGB',im.size,'white')).convert('L').point(lambda v:255 if v>18 else 0).getbbox()
    image_crops[name]={'path':path.relative_to(ROOT).as_posix(),'crop':bounds,'adjustments':'none'}
    a=sub(ax,rect);a.imshow(im.crop(bounds));a.set_axis_off()
def canvas(mobile,titles):
    global FS,TICK
    FS=20 if mobile else 18;TICK=18 if mobile else 17
    fig,axes=plt.subplots(4 if mobile else 2,1 if mobile else 2,figsize=(6,21) if mobile else (12,10.8),dpi=300)
    fig.subplots_adjust(left=.035,right=.965,top=.95,bottom=.025,wspace=.15,hspace=.15 if mobile else .20)
    axes=axes.ravel()
    for i,(ax,title) in enumerate(zip(axes,titles)):
        ax.set_axis_off();label(ax,0,1,f'{chr(97+i)}  '+textwrap.fill(title,31),22 if mobile else 21,INK,weight='bold')
    return fig,axes
def finish(fig,axes,id,mobile):
    stem=id+('-mobile' if mobile else '')
    require_matplotlib_panel_alignment(fig,axes=axes,panel_ids=list('abcd'),json_out=QA/(stem+'.alignment.json'))
    fig.savefig(OUT/(stem+'.svg'))
    fig.savefig(QA/(stem+'.pdf'))
    fig.savefig(QA/(stem+'.png'),dpi=300)
    plt.close(fig)
def register(id,inputs,sources,detail):
    record={'id':id,'generator':'scripts/create-research-illustrations.py','kind':'verified teaching figure','width':1200,'height':1080,'mobileHeight':2100,'sources':sources,'inputs':[{'path':p,'sha256':sha(p)} for p in inputs],'detail':detail,'molecularImageCrops':dict(image_crops)}
    for key,suffix in [('output',''),('mobileOutput','-mobile')]:
        p='public/illustrations/'+id+suffix+'.svg';record[key]={'path':p,'sha256':sha(p)}
    records.append(record)

# a -> b -> c/d: connectivity, exact conformer and two views of the same plane.
g=D['gridSlices'];z=g['origin'][2]+(g['z']+.5)*g['spacing']
lo=np.array(g['origin'])+8;hi=lo+8
extent=[lo[0],hi[0],lo[1],hi[1]]
carbon=np.array(g['carbon']).reshape(48,48)[16:32,16:32];oxygen=np.array(g['oxygen']).reshape(48,48)[16:32,16:32];maximum=max(carbon.max(),oxygen.max())
for mobile in [False,True]:
    fig,(a,b,c,d)=canvas(mobile,['Aspirin: chemical structure','The same atoms in space','Carbon channel','Oxygen channel'])
    drawer=rdMolDraw2D.MolDraw2DCairo(900,570);drawer.drawOptions().bondLineWidth=3;drawer.drawOptions().padding=.08;rdMolDraw2D.PrepareAndDrawMolecule(drawer,asp);drawer.FinishDrawing()
    q=sub(a,[0,.30,1,.57]);q.imshow(Image.open(BytesIO(drawer.GetDrawingText())));q.set_axis_off()
    label(a,.02,.19,'Bonds define connectivity.');label(a,.02,.08,'One conformer places the atoms in 3D.',TICK,MUTED)
    molecule(b,ASP,asp,[0,.18,1,.72],lo,hi,plane=z)
    label(b,.03,.13,f'Blue plane: z = {z:.2f} Å',color=BLUE);label(b,.03,.04,'8 Å central field · 0.5 Å voxels',TICK,MUTED)
    for ax,data in [(c,carbon),(d,oxygen)]:
        heat(ax,data,[.15,.36,.66,.49],extent,vmax=maximum)
        legend(ax,[.16,.10,.65,.025],round(maximum,3),labeltext='Atomic density · shared scale')
    finish(fig,[a,b,c,d],'molecule-to-grid',mobile)
register('molecule-to-grid',['artifacts/research-illustration-data.json',C['source']['path']],['unimolrep'],{'smiles':D['smiles'],'sliceIndex':23,'zAngstrom':z,'origin':g['origin'],'spacing':.5,'cropIndices':[16,32],'scale':[0,float(maximum)],'orientation':'x right, y up; input row order preserved','geometry':'fixed browser conformer; heavy-atom connectivity verified by RDKit; hydrogens omitted from rendering only'})

# a -> b -> c -> d: geometry, exact channels and model operations.
protein=G[0,:,:,23].T[::-1];ligand=G[14,:,:,23].T[::-1];dm=float(max(protein.max(),ligand.max()))
ext=[grid_min[0],grid_max[0],grid_min[1],grid_max[1]]
for mobile in [False,True]:
    fig,(a,b,c,d)=canvas(mobile,['Prepared 1HSG complex','Enlarge the binding pocket','Protein and ligand channels','Convolutions to two outputs'])
    photo(a,'complex',[.05,.17,.9,.71]);label(a,.02,.10,'HIV-1 protease + inhibitor MK1',TICK,MUTED)
    photo(b,'pocket',[.02,.20,.96,.67]);label(b,.02,.12,'Pocket atoms within 5 Å of MK1',TICK,MUTED);label(b,.02,.035,'Keep the prepared pose fixed.',TICK,MUTED)
    # Connected inset labels identify the geometry-to-grid transformation.
    if mobile:arrow(a,(.85,.18),(.85,.02))
    else:arrow(a,(.82,.5),(.98,.5))
    heat(c,protein,[.03,.35,.42,.47],ext,title='Protein',vmax=dm,compact=True);heat(c,ligand,[.55,.35,.42,.47],ext,title='Ligand',vmax=dm,cmap=VCMAP,compact=True)
    label(c,.02,.23,'28 channels × 48 × 48 × 48 voxels',TICK,MUTED);label(c,.02,.14,'Carbon hydrophobe channels shown',TICK,MUTED);label(c,.02,.05,'24 Å field · same z · shared scale',TICK,MUTED)
    box(d,.12,.76,.76,.13,'Typed 3D grids');arrow(d,(.5,.75),(.5,.69));box(d,.12,.52,.76,.16,'3D convolution + activation\nLocal patterns → features');arrow(d,(.5,.51),(.5,.45));box(d,.12,.32,.76,.12,'Pooling + learned readout')
    arrow(d,(.35,.31),(.24,.23));arrow(d,(.65,.31),(.76,.23),VIOLET)
    box(d,.02,.055,.44,.16,'Affinity\npK',size=FS);box(d,.54,.055,.44,.16,'Pose score\n0–1',VIOLET,size=FS)
    finish(fig,[a,b,c,d],'bap-workflow',mobile)
register('bap-workflow',[gridpath,protpath,ligpath,'public/illustrations/molecular-panels/complex.png','public/illustrations/molecular-panels/pocket.png'],['gnina','pdb1hsg'],{'channels':[0,14],'channelMeaning':'protein/ligand aliphatic carbon hydrophobe','sliceIndex':23,'scale':[0,dm],'voxelEdgeBounds':[grid_min.tolist(),grid_max.tolist()],'model':'GNINA crossdock_default2018; network panel is an operation diagram, not an activation measurement'})

# a -> b -> c/d: complete two-branch model, derivative, coordinate-registered map.
origin=np.array(C['spatialFrame']['origin']);zcam=origin[2]+2*C['zIndex'];cam=np.array(C['cam']).reshape(12,12)
cam_extent=[origin[0]-1,origin[0]+23,origin[1]-1,origin[1]+23]
for mobile in [False,True]:
    fig,(a,b,c,d)=canvas(mobile,['Predict with both branches','Weight spatial feature maps','Locate the cross-section','Read the verified Grad-CAM'])
    box(a,.01,.73,.43,.14,'SMILES: CCO');box(a,.56,.73,.43,.14,'Ligand grid')
    arrow(a,(.225,.72),(.225,.68));arrow(a,(.775,.72),(.775,.68));box(a,.01,.47,.43,.20,'Sequence\nencoder');box(a,.56,.47,.43,.20,'3D CNN\nfeatures A(k)',VIOLET)
    arrow(a,(.225,.47),(.38,.39));arrow(a,(.775,.47),(.62,.39));box(a,.14,.23,.72,.15,'Cross-attention + fusion')
    arrow(a,(.5,.22),(.5,.13));label(a,.5,.065,f'MAO-B score: {C["score"]:.4f}',ha='center',color=BLUE)
    arrow(a,(.89,.08),(.99,.08),OCHRE,True);arrow(a,(.99,.08),(.99,.46),OCHRE,True);arrow(a,(.99,.46),(.82,.48),OCHRE,True)
    box(b,.08,.73,.84,.15,'Differentiate the fusion score',OCHRE)
    arrow(b,(.5,.72),(.5,.66),OCHRE,True);box(b,.08,.45,.84,.20,'Mean gradient over x, y, z\nChannel weights α(k)',OCHRE)
    arrow(b,(.5,.44),(.5,.38));box(b,.08,.23,.84,.14,'ReLU(Σ α(k) A(k))',VIOLET)
    label(b,.5,.10,'12 × 12 × 12 spatial map',ha='center',color=BLUE)
    elo=ETH.min(0)-2;ehi=ETH.max(0)+2
    molecule(c,ETH,eth,[0,.18,1,.72],elo,ehi,plane=zcam)
    label(c,.03,.13,f'Ethanol · plane z = {zcam:.2f} Å',TICK,BLUE);label(c,.03,.04,'Zoomed conformer · unchanged atoms',TICK,MUTED)
    h,_=heat(d,cam,[.16,.44,.66,.41],cam_extent,vmax=1e-5,cmap=CAMMAP)
    # Projected heavy-atom positions; outline identifies the molecule, not attribution.
    for bond in eth.GetBonds():
        i,j=bond.GetBeginAtomIdx(),bond.GetEndAtomIdx()
        if eth.GetAtomWithIdx(i).GetSymbol()!='H' and eth.GetAtomWithIdx(j).GetSymbol()!='H':h.plot(ETH[[i,j],0],ETH[[i,j],1],color='white',lw=4);h.plot(ETH[[i,j],0],ETH[[i,j],1],color=INK,lw=1)
    for atom,p in zip(eth.GetAtoms(),ETH):
        if atom.GetSymbol()!='H':h.scatter(p[0],p[1],s=35,c=ATOM[atom.GetSymbol()],edgecolors='white',lw=.6)
    legend(d,[.16,.16,.65,.025],1e-5,CAMMAP,'Grad-CAM intensity · fixed scale')
    label(d,.02,.015,'24 Å field · projected atom positions',TICK,MUTED)
    finish(fig,[a,b,c,d],'grad-cam',mobile)
register('grad-cam',['artifacts/gradcam-illustration-data.json',C['source']['path'],'src/lib/research/grad-cam.mjs'],['fusion','gradcam'],{'smiles':'CCO','score':C['score'],'sliceIndex':C['zIndex'],'zAngstrom':zcam,'spatialFrame':C['spatialFrame'],'scale':[0,1e-5],'neutralBelow':1e-8,'maxNativeError':C['maxError'],'projection':'heavy atoms projected on x-y; no invented activations, interpolation or contrast normalization','gradient':'through full fusion graph, spatial feature layer before pooling/projection'})

# a -> b -> c -> d: spatial intervention and paired evaluation.
original=G[:,:,:,11].sum(axis=0).T[::-1];masked=original.copy();masked[24:,:24]=0;om=float(original.max())
baseline=N['baseline'];delta=N['changes'][0];masked_score=baseline-delta
assert np.all(masked[24:,:24]==0) and np.array_equal(masked[:24],original[:24])
for mobile in [False,True]:
    fig,(a,b,c,d)=canvas(mobile,['Mark region A in the fixed complex','Change only the input region','Evaluate twice with the same model','Compare the affinity estimates'])
    molecule(a,LIG,lig,[0,.19,1,.7],grid_min,grid_max,region=True,pocket=True)
    label(a,.02,.12,'Ochre box: lower x, y, z half',TICK,OCHRE);label(a,.02,.035,'12 Å cube · protein and ligand fixed',TICK,MUTED)
    heat(b,original,[.03,.36,.42,.48],ext,title='Original',vmax=om,compact=True);heat(b,masked,[.55,.36,.42,.48],ext,title='Masked',vmax=om,mask=True,compact=True)
    label(b,.02,.25,'24 Å field · x right, y up · same z',TICK,MUTED);label(b,.02,.15,'All 28 channels zeroed in the box',TICK,OCHRE);label(b,.02,.05,'Density sum shown · common scale',TICK,MUTED)
    box(c,.03,.73,.43,.14,'Original grid');box(c,.54,.73,.43,.14,'Masked grid',OCHRE)
    for x,color in [(.245,BLUE),(.755,OCHRE)]:arrow(c,(x,.72),(x,.58),color)
    box(c,.03,.37,.43,.20,'GNINA\nscore',size=FS);box(c,.54,.37,.43,.20,'GNINA\nscore',size=FS)
    label(c,.5,.24,'Identical model and parameters',TICK,MUTED,ha='center')
    label(c,.245,.10,f'{baseline:.3f} pK',ha='center',color=BLUE);label(c,.755,.10,f'{masked_score:.3f} pK',ha='center',color=OCHRE)
    label(d,.5,.79,'Original − masked',ha='center',color=MUTED)
    label(d,.5,.64,f'{baseline:.3f} − {masked_score:.3f}',26,ha='center')
    label(d,.5,.47,f'= +{delta:.3f} pK',31,BLUE,ha='center')
    label(d,.04,.27,'Masking lowers the estimate.');label(d,.04,.15,'This is regional model sensitivity,',TICK,MUTED);label(d,.04,.06,'not a measured binding-energy term.',TICK,MUTED)
    finish(fig,[a,b,c,d],'spatial-occlusion',mobile)
register('spatial-occlusion',[gridpath,protpath,ligpath,'artifacts/gnina-native-occlusion.json'],['occlusion','gnina','pdb1hsg'],{'region':'A: x<24, y<24, z<24; all channels zeroed','regionBounds':[grid_min.tolist(),center.tolist()],'sliceIndex':11,'scale':[0,om],'baseline':baseline,'maskedScore':masked_score,'difference':delta,'geometry':'prepared protein heavy atoms within 5 Å shown as context; ligand coordinates unchanged; no atom deletion','display':'native density sum, x right and y up; hatching marks zeroed quadrant'})
workflow=next(r for r in records if r['id']=='bap-workflow');workflow.update(protein={'path':protpath,'sha256':sha(protpath)},ligand={'path':ligpath,'sha256':sha(ligpath)})
(ROOT/'artifacts/bap-workflow-provenance.json').write_text(json.dumps(workflow,indent=2)+'\n')
(ROOT/'artifacts/method-illustration-provenance.json').write_text(json.dumps([r for r in records if r['id']!='bap-workflow'],indent=2)+'\n')
print('Generated four teaching figures, each with desktop and mobile SVG/PDF/PNG and alignment report.')
