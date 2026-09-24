"""Native libmolgrid 0.5.5 parsing, typing and fixed-coordinate density fixtures.
Run in WSL: PYTHONPATH=artifacts/linux-packages python3 scripts/native-gnina-input-fixtures.py
"""
from pathlib import Path
import hashlib
import json
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT/'artifacts/research-source/gnina'
OUT = ROOT/'artifacts/gnina-input-references'
OUT.mkdir(parents=True, exist_ok=True)


def artifact(path):
    return dict(path=path.relative_to(ROOT).as_posix(), bytes=path.stat().st_size,
                sha256=hashlib.sha256(path.read_bytes()).hexdigest())


def atom_set(coord):
    xyz, types, radii = coord.coords.tonumpy(), coord.type_index.tonumpy(), coord.radii.tonumpy()
    return [dict(xyz=p.tolist(), channel=int(t), radius=float(r)) for p, t, r in zip(xyz, types, radii)]


def main():
    import molgrid
    maker = molgrid.GridMaker(resolution=.5, dimension=23.5)
    report = dict(molgrid=molgrid.__version__, shape=[1, 28, 48, 48, 48],
                  receptorChannels=list(molgrid.defaultGninaReceptorTyper.get_type_names()),
                  ligandChannels=list(molgrid.defaultGninaLigandTyper.get_type_names()), complexes=[], synthetic=[])
    for name, receptor, ligand, grid in [
        ('1hsg','1hsg-receptor.pdb','1hsg-ligand.sdf',ROOT/'public/research/gnina-crossdock/1hsg-grid.bin'),
        ('1hvr','1hvr-receptor.pdb','1hvr-ligand.sdf',ROOT/'public/research/gnina-crossdock/1hvr-grid.bin'),
        ('r1l1','r1.pdb','l1.sdf',SOURCE/'regression-r1l1-grid.bin'),
        ('r2l2','r2.pdb','l2.sdf',SOURCE/'regression-r2l2-grid.bin'),
        ('r1l2','r1.pdb','l2.sdf',SOURCE/'regression-r1l2-grid.bin'),
    ]:
        types_path = OUT/(name+'.types')
        types_path.write_text(f'1 {receptor} {ligand}\n')
        provider = molgrid.ExampleProvider(data_root=str(SOURCE), balanced=False, shuffle=False,
                                         default_batch_size=1, iteration_scheme=molgrid.IterationScheme.SmallEpoch)
        provider.populate(str(types_path))
        example = provider.next()
        center = example.coord_sets[-1].center()
        actual = molgrid.MGrid4f(28, 48, 48, 48)
        maker.forward(example, actual.cpu(), 0, False)
        expected = np.fromfile(grid,dtype='<f4').reshape(28,48,48,48)
        assert np.array_equal(actual.tonumpy(), expected), name
        report['complexes'].append(dict(id=name,receptor=artifact(SOURCE/receptor),ligand=artifact(SOURCE/ligand),
            grid=artifact(grid),center=[center.x,center.y,center.z],
            receptorAtoms=atom_set(example.coord_sets[0]),ligandAtoms=atom_set(example.coord_sets[1])))
    # Synthetic density tests isolate rasterisation from chemistry perception.
    cases = [
        ('all-channels', [[(i%7)-3,(i//7)-1.5,(i%3)*.25] for i in range(28)], list(range(28)),
         [1.2,1.5,1.7,1.8,1.9,1.92,2.,2.1,2.2]*3+[1.2], [0,0,0]),
        ('gaussian-quadratic-boundaries', [[0,0,0],[1.9,0,0],[2.85,0,0],[-2.85,0,0]], [0,0,1,1], [1.9]*4, [0,0,0]),
        ('cube-edge-overlap-outside', [[11.75,0,0],[13.75,0,0],[15,0,0],[-11.75,0,0],[-13.75,0,0],[0,0,0],[0,0,0]], [0]*7, [1.9]*7, [0,0,0]),
        ('large-offset-subvoxel', [[1024.12345,-255.2222,123.87654],[1025.2,-254.9,124.0001]], [14,24], [1.9,1.7], [1024.2222,-255.1111,124.1234]),
    ]
    for name, xyz, channels, radii, center in cases:
        coords=np.asarray(xyz,dtype=np.float32);types=np.asarray(channels,dtype=np.float32);rads=np.asarray(radii,dtype=np.float32)
        native=molgrid.CoordinateSet(coords,types,rads,28)
        c=molgrid.float3(*center);actual=molgrid.MGrid4f(28,48,48,48)
        maker.forward(c,native,actual.cpu())
        path=OUT/(name+'-grid.bin');actual.tonumpy().astype('<f4').tofile(path)
        report['synthetic'].append(dict(id=name,atoms=atom_set(native),center=[c.x,c.y,c.z],grid=artifact(path),transformIdentity=False))
    report['typing']=[]
    for ligand in sorted((OUT/'typing').glob('*.sdf')):
        types_path=OUT/(ligand.stem+'.types')
        types_path.write_text(f'1 {SOURCE/"r2.pdb"} {ligand}\n')
        provider=molgrid.ExampleProvider(balanced=False,shuffle=False,default_batch_size=1,iteration_scheme=molgrid.IterationScheme.SmallEpoch)
        provider.populate(str(types_path));example=provider.next();center=example.coord_sets[-1].center()
        actual=molgrid.MGrid4f(28,48,48,48);maker.forward(example,actual.cpu(),0,False)
        grid=OUT/(ligand.stem+'-grid.bin');actual.tonumpy().astype('<f4').tofile(grid)
        report['typing'].append(dict(id=ligand.stem,receptor=artifact(SOURCE/'r2.pdb'),ligand=artifact(ligand),grid=artifact(grid),
            center=[center.x,center.y,center.z],receptorAtoms=atom_set(example.coord_sets[0]),ligandAtoms=atom_set(example.coord_sets[1])))
    sources=ROOT/'artifacts/research-source/libmolgrid-v0.5.5'
    report['sources']=[artifact(path) for path in sorted(sources.iterdir()) if path.suffix in ('.cpp','.h','.cu')]
    (OUT/'fixtures.json').write_text(json.dumps(report,indent=2))
    print('Native parsing/typing fixtures:',len(report['complexes']),'synthetic grids:',len(report['synthetic']))


def prepare_ligands():
    from rdkit import Chem
    from rdkit.Chem import AllChem
    ligands={'indole':'c1ccc2[nH]ccc2c1','histidine-ring':'c1ncc[nH]1','pyridine':'c1ccncc1',
             'caffeine':'Cn1c(=O)c2c(ncn2C)n(C)c1=O','aniline':'Nc1ccccc1','pyrrole':'c1cc[nH]c1',
             'tetrazole':'c1nnn[nH]1','nitrobenzene':'O=[N+]([O-])c1ccccc1',
             'halogens':'FC(Cl)(Br)I','boron':'B(O)(O)C','phosphate':'COP(=O)(O)O',
             'sulfone':'CS(=O)(=O)C','selenium':'C[Se]C','charged-amine':'C[NH2+]C'}
    folder=OUT/'typing';folder.mkdir(exist_ok=True)
    for name,smiles in ligands.items():
        mol=Chem.MolFromSmiles(smiles);AllChem.Compute2DCoords(mol)
        # Deliberately planar fixed coordinates for parsing/typing tests, not
        # generated bound poses or a claim of meaningful affinity for them.
        (folder/(name+'.sdf')).write_text(Chem.MolToMolBlock(mol)+'\n$$$$\n')
    print('Wrote',len(ligands),'synthetic fixed-coordinate ligand typing fixtures')


def score_native():
    import importlib.util
    import torch
    spec=importlib.util.spec_from_file_location('exporter',ROOT/'scripts/export-research-models.py')
    exporter=importlib.util.module_from_spec(spec);spec.loader.exec_module(exporter)
    torch.set_num_threads(2);model,_=exporter.load_gnina()
    path=OUT/'fixtures.json';report=json.loads(path.read_text())
    for example in report['typing']:
        grid=np.fromfile(ROOT/example['grid']['path'],dtype='<f4').reshape(1,28,48,48,48)
        with torch.no_grad():example['referenceAffinity']=float(model(torch.from_numpy(grid))[1].item())
    path.write_text(json.dumps(report,indent=2))


if __name__=='__main__':
    import sys
    if '--prepare-ligands' in sys.argv:prepare_ligands()
    elif '--score' in sys.argv:score_native()
    else:main()
