"""Generate fixed-input references by executing original UniMolRep functions.

Run: .venv/Scripts/python.exe scripts/prepare-representation-fixtures.py
Requires only installed RDKit and numpy. No browser implementation is imported.
AST adapters remove package-relative imports and supply dependency/container
interfaces; function bodies and constants are not rewritten. MDAnalysis parsing,
protein selection, pocket cuts and conformer generation are outside this fixture.
"""
from __future__ import annotations
import ast
import hashlib
import importlib
import json
from pathlib import Path
import sys
import types
import numpy as np
from rdkit import Chem, rdBase

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "research_works/UniMolRep/MolRep_Toolkit/unimolrep"
OUT = ROOT / "tests/fixtures/unimolrep-native.json"
SOURCE_FILES = ["rep1d/fingerprints.py", "rep2d/graph.py",
                "rep2d/graph_2_5d.py", "rep3d/graph_3d.py", "rep3d/grid.py"]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def native_module(relative, **injected):
    """Keep native executable statements; bypass optional package imports only."""
    path = SOURCE / relative
    tree = ast.parse(path.read_text(encoding="utf-8"))
    tree.body = [node for node in tree.body if not (
        isinstance(node, ast.ImportFrom) and
        (node.level or (node.module or "").startswith("unimolrep")))]
    name = "fixture_native_" + relative.replace("/", "_").replace(".", "_")
    module = types.ModuleType(name)
    module.__dict__.update(injected)
    sys.modules[name] = module  # dataclasses resolves its module here
    exec(compile(tree, str(path), "exec"), module.__dict__)
    return module


def graph_dependency(name):
    # Bio.PDB is loaded by graph.py but unused by graph_from_smiles.
    if name == "Bio.PDB":
        return types.SimpleNamespace()
    return importlib.import_module(name)


class FixedAtomGroup:
    """Only the MDAnalysis AtomGroup operations reached by this fixture."""
    def __init__(self, table, indices=None):
        self.table = table
        self.indices = list(range(len(table))) if indices is None else list(indices)

    def __len__(self):
        return len(self.indices)

    def __getitem__(self, selection):
        return FixedAtomGroup(self.table, np.asarray(self.indices, dtype=int)[selection].tolist())

    @property
    def positions(self):
        return np.asarray([self.table[i]["xyz"] for i in self.indices], dtype=np.float32).reshape(-1, 3)

    @property
    def atoms(self):
        return [types.SimpleNamespace(element=self.table[i]["symbol"]) for i in self.indices]

    def union(self, other):
        return FixedAtomGroup(self.table, sorted(set(self.indices) | set(other.indices)))

    def difference(self, other):
        return FixedAtomGroup(self.table, sorted(set(self.indices) - set(other.indices)))


class FixedUniverse:
    def __init__(self, table):
        self.atoms = FixedAtomGroup(table)

    def select_atoms(self, selection):
        if selection in ("protein", "water"):
            return FixedAtomGroup(self.atoms.table, [])
        if selection == "not protein and not water":
            return self.atoms
        raise ValueError("Unexpected fixture selection: " + selection)


def generate():
    fp = native_module("rep1d/fingerprints.py")
    graph = native_module("rep2d/graph.py", require=graph_dependency)
    angles = native_module("rep2d/graph_2_5d.py", Graph2D=graph.Graph2D)
    torsions = native_module("rep3d/graph_3d.py", Graph2D=graph.Graph2D)
    cases = []
    smiles_cases = ["CCO", "CCCC", "c1ccccc1", "CC(=O)Oc1ccccc1C(=O)O",
                    "Cn1c(=O)c2c(ncn2C)n(C)c1=O", "F[C@](Cl)(Br)I", "F[C@@](Cl)(Br)I", "C"]
    for smiles in smiles_cases:
        mol = Chem.MolFromSmiles(smiles)
        g = graph.graph_from_smiles(smiles, generate_3d=False, add_hs=False)
        # Synthetic asymmetric fixed coordinates exercise geometry, not chemistry.
        # They are not generated conformers or claimed low-energy structures.
        coords = np.asarray([[0.91*i + 0.13*(i % 3), 0.43*(i*i % 7),
                              0.37*(i*i*i % 11)] for i in range(mol.GetNumAtoms())], dtype=np.float32)
        g.pos = coords
        a = angles.attach_angles(g)
        t = torsions.build_3d_graph(g)
        cases.append({
            "smiles": smiles,
            "canonicalSmiles": Chem.MolToSmiles(mol),
            "atoms": [{"z": atom.GetAtomicNum(), "symbol": atom.GetSymbol(), "xyz": coords[i].tolist()}
                      for i, atom in enumerate(mol.GetAtoms())],
            "bonds": [{"a": b.GetBeginAtomIdx(), "b": b.GetEndAtomIdx()}
                      for b in mol.GetBonds()],
            "fingerprint": "".join(str(int(v)) for v in fp.fp_morgan(smiles)),
            "edges": g.covalent_edge_index.T.tolist(),
            "nativeAtomFeatureShape": list(g.x.shape),
            "nativeBondFeatureShape": list(g.covalent_edge_attr.shape),
            "angles": [{"indices": ids, "bin": int(np.argmax(row)) + 1,
                        "degrees": angles._angle_deg(*(coords[i] for i in ids))}
                       for ids, row in zip(a.angle_index.T.tolist(), a.angle_bin)],
            "torsions": sorted([{"indices": ids, "bin": int(np.argmax(row)) + 1,
                        "degrees": torsions._dihedral_angle_deg(*(coords[i] for i in ids))}
                       for ids, row in zip(t.torsion_index.T.tolist(), t.torsion_attr)], key=lambda x: x["indices"]),
        })

    grid_cases = [
        ("asymmetric-elements", [
            {"symbol": symbol, "xyz": xyz} for symbol, xyz in [
                ("C", [-1.17, 0.24, 0.73]), ("N", [0.63, 1.42, -0.19]),
                ("O", [0.28, -0.94, 1.11]), ("Cl", [1.92, 0.17, -1.73]),
                ("H", [-1.45, 0.64, 1.71]), ("Si", [2.03, -1.16, 0.58])]]),
        ("all-channel-types", [{"symbol": s, "xyz": [i * .33, (i % 3) * .47, (i % 5) * -.29]}
                               for i, s in enumerate(["C", "N", "O", "S", "P", "F", "Cl", "Br", "I", "H", "Zn"])]),
        ("overlapping-atoms", [{"symbol": "C", "xyz": [0, 0, 0]}] * 3),
        ("cube-boundaries", [{"symbol": "C", "xyz": [x, 0, 0]}
                             for x in [-12.01, -12, -11.75, 0, 11.75, 12, 12.01]]),
        ("subvoxel-offset", [{"symbol": "O", "xyz": [-.125, .375, .25]},
                             {"symbol": "H", "xyz": [.125, -.375, -.25]}]),
    ]
    grids = []
    for label, table in grid_cases:
        def require(name):
            if name == "MDAnalysis":
                return types.SimpleNamespace(Universe=lambda path: FixedUniverse(table))
            if name == "MDAnalysis.lib.distances":
                return types.SimpleNamespace()  # use_pocket_cut=False
            raise ValueError(name)
        grid = native_module("rep3d/grid.py", require=require)
        center = np.asarray(np.asarray([a["xyz"] for a in table], dtype=np.float64).mean(axis=0), dtype=np.float32)
        result = grid.make_grid_from_structure("fixed-coordinate-adapter", center="coords",
            center_coords=tuple(center), use_pocket_cut=False, random_rotate=False,
            separate_protein_ligand=True, density="gaussian", sigma=.5, size=24, resolution=.5)
        flat = result.tensor.reshape(-1)
        nz = np.flatnonzero(flat)
        grids.append({"id": label, "atoms": table, "shape": [1] + list(result.tensor.shape),
            "center": result.center.tolist(), "origin": result.origin.tolist(),
            "nativeChannels": result.channel_names, "nonzeroCount": len(nz),
            "nonzero": [[int(i), float(flat[i])] for i in nz],
            "sha256": hashlib.sha256(flat.astype("<f4").tobytes()).hexdigest()})

    # Native numerical and exclusion behavior beyond ordinary molecular cases.
    angle_cases = [([[1, 0, 0], [0, 0, 0], [0, 1, 0]], "right-angle"),
                   ([[0, 0, 0], [0, 0, 0], [1, 0, 0]], "degenerate"),
                   ([[1e-7, 0, 0], [0, 0, 0], [0, 1e-7, 0]], "small-valid-vectors")]
    result = {"schemaVersion": 1, "rdkitVersion": rdBase.rdkitVersion, "numpyVersion": np.__version__,
        "sources": [{"path": (SOURCE / rel).relative_to(ROOT).as_posix(), "sha256": digest(SOURCE / rel)}
                    for rel in SOURCE_FILES],
        "generation": "Original native function bodies executed through AST import adapters. FixedAtomGroup replaces MDAnalysis file/atom interfaces only. No preprocessing algorithm is copied into this generator.",
        "limitations": ["Synthetic fixed coordinates are not conformer-generation tests.",
                        "All grid atoms are ligand atoms; protein parsing, selections, contacts, augmentation and trajectories are not certified.",
                        "Only browser-exposed graph topology is compared; 71/12-dimensional tensors remain native-only.",
                        "Native torsions are compared by atom indices because native central-bond iteration uses a Python set."],
        "molecules": cases, "grids": grids,
        "angleCases": [{"id": label, "points": points,
                         "degrees": angles._angle_deg(*(np.asarray(p, dtype=np.float64) for p in points))}
                        for points, label in angle_cases],
        "angleBins": [{"value": value, "bin": angles._bin_angle(value, (60, 120, 150, 180, 360))}
                      for value in [-1, 0, .001, 60, 60.001, 120, 150, 180, 360, 361]],
        "invalidSmiles": ["not-a-molecule", "C1CC", "C(C)(C)(C)(C)C"]}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"fixture": str(OUT), "molecules": len(cases), "grids": len(grids),
                      "bytes": OUT.stat().st_size, "sha256": digest(OUT)}, indent=2))


if __name__ == "__main__":
    generate()
