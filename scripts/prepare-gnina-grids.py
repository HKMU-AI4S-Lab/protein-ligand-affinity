"""CPU-only native libmolgrid 0.5.5 fixtures; run on Linux/WSL.
PYTHONPATH=artifacts/linux-packages python3 scripts/prepare-gnina-grids.py
No conformer generation, minimisation, docking, rotation or translation.
"""
from pathlib import Path
import hashlib,json,shutil
import numpy as np
import molgrid
ROOT=Path(__file__).resolve().parents[1]
source=ROOT/'artifacts/research-source/gnina';out=ROOT/'public/research/gnina-crossdock';out.mkdir(parents=True,exist_ok=True)
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
records=[]
for name,ligand in [('1hsg','MK1'),('1hvr','XK2')]:
    # Preserve protein coordinates and modified protein residue CSO; remove waters and ligand.
    pdb=source/(name+'.pdb');lines=pdb.read_text().splitlines()
    receptor=source/(name+'-receptor.pdb')
    selected=[line for line in lines if (line.startswith('ATOM  ') or line.startswith('HETATM') and line[17:20]=='CSO') and line[16:17] in (' ','A')]
    if len(selected)<100:raise ValueError('Protein atoms missing')
    receptor.write_text('\n'.join(selected)+'\nEND\n')
    sdf=source/(name+'-ligand.sdf')
    if ligand not in sdf.read_text()[:20]:raise ValueError('Wrong ligand source')
    shutil.copyfile(sdf,out/(name+'.sdf'))
    records.append(dict(id=name,receptor=receptor.name,ligand=sdf.name,sourcePdbSha256=digest(pdb),receptorSha256=digest(receptor),ligandSha256=digest(sdf),source=f'https://www.rcsb.org/structure/{name.upper()}',label=f'{name.upper()} · HIV protease / {ligand}'))
# Regression-only tiny molecules from the pinned gnina-torch tests.
pairs=[(r['id'],r['receptor'],r['ligand'],True) for r in records]+[('regression-r1l1','r1.pdb','l1.sdf',False),('regression-r2l2','r2.pdb','l2.sdf',False),('regression-r1l2','r1.pdb','l2.sdf',False)]
maker=molgrid.GridMaker(resolution=.5,dimension=23.5)
results=[]
for name,rec,lig,public in pairs:
    types=source/(name+'.types');types.write_text(f'1 {rec} {lig}\n')
    provider=molgrid.ExampleProvider(data_root=str(source),balanced=False,shuffle=False,default_batch_size=1,iteration_scheme=molgrid.IterationScheme.SmallEpoch)
    provider.populate(str(types));example=provider.next();dims=maker.grid_dimensions(provider.num_types())
    if tuple(dims)!=(28,48,48,48):raise ValueError(f'Incorrect GNINA grid {dims}')
    grid=molgrid.MGrid4f(*dims);maker.forward(example,grid.cpu(),0,False)
    data=grid.tonumpy().astype('<f4');dest=(out if public else source)/(name+'-grid.bin');data.tofile(dest)
    center=example.coord_sets[-1].center()
    record=dict(id=name,gridSha256=digest(dest),bytes=dest.stat().st_size,shape=[1,*dims],sum=float(data.sum()),center=[center.x,center.y,center.z])
    results.append(record);print(record)
(ROOT/'artifacts/gnina-grid-provenance.json').write_text(json.dumps(dict(molgrid=molgrid.__version__,settings=dict(resolution=.5,dimension=23.5,random_translation=0,random_rotation=False,atomTyper='default receptor and ligand GNINA types',addHydrogens='ExampleProvider default',center='ligand coordinate-set center'),preparation='Original crystal heavy-atom coordinates. Waters removed. Protein ATOM and CSO records retained, alternate location blank/A. RCSB ModelServer ligand bond orders; libmolgrid/OpenBabel native hydrogen handling. No pH optimisation or minimisation. Demonstration estimates only.',sources=records,grids=results),indent=2))
