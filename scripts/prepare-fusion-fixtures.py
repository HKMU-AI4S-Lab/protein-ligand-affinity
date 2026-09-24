"""Execute unchanged Fusion preprocessing on fixed fake-pybel atom records.

No OpenBabel conformers or model weights are used. Requires numpy only.
"""
import ast
import hashlib
import json
from pathlib import Path
from types import SimpleNamespace
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "artifacts/research-source/fusion-aofb/DataSetsFunction.py"
OUT = ROOT / "tests/fixtures/fusion-native.json"


def load_native():
    tree = ast.parse(SOURCE.read_text(encoding="utf-8"))
    names = {"Feature_extractor", "get_grid", "label_smiles"}
    tree.body = [node for node in tree.body if
                 (isinstance(node, (ast.FunctionDef, ast.ClassDef)) and node.name in names)
                 or (isinstance(node, ast.Assign) and any(
                     isinstance(target, ast.Name) and target.id == "CHARISOSMISET"
                     for target in node.targets))]
    namespace = {"np": np}
    exec(compile(tree, str(SOURCE), "exec"), namespace)
    return namespace


def atom(z, xyz, hyb=0):
    return {"z": z, "hyb": hyb, "xyz": list(xyz)}


def pybel_atoms(atoms):
    return [SimpleNamespace(atomicnum=a["z"], hyb=a["hyb"], coords=a["xyz"])
            for a in atoms]


def main():
    native = load_native()
    feature = native["Feature_extractor"]()
    cases = []
    types = [(1, 0), (6, 1), (6, 2), (6, 3), (7, 1), (7, 2), (7, 3),
             (8, 0), (15, 0), (16, 2), (16, 3), (34, 0), (17, 0), (30, 0)]
    cases.append(("all-14-ligand-channels", [atom(z, (i - 6.5, i % 3 - 1, 0), h)
                                             for i, (z, h) in enumerate(types)]))
    cases.append(("all-20-positions-in-24", [atom(8, (i - 9.5,) * 3) for i in range(20)]))
    cases.append(("integer-ties-first-and-overlap", [atom(8, (i,) * 3)
                  for i in [-2, -1, 0, 0, 0, 1, 2]]))
    for name, distance in [
        ("cube-edge", 10.0),
        ("float32-one-ulp-past-edge", float(np.nextafter(np.float32(10), np.float32(np.inf)))),
        ("float32-two-ulps-past-edge", float(np.nextafter(np.nextafter(np.float32(10), np.float32(np.inf)), np.float32(np.inf)))),
        ("outside-cube", 10.1),
    ]:
        cases.append((name, [atom(8, (sign * distance if axis == i else 0 for axis in range(3)))
                            for i in range(3) for sign in [-1, 1]] + [atom(1, (0, 0, 0))]))
    cases.append(("float32-before-bbox-centering", [
        atom(6, (1234.123456789, -4321.87654321, .123456789), 3),
        atom(7, (1247.9999876, -4310.111119, 5.98765432), 2),
        atom(8, (1240.3333333, -4318.2222222, 1.999999999)),
    ]))
    grids = []
    for name, atoms in cases:
        molecule = pybel_atoms(atoms)
        coords, features = feature.get_features(molecule, 0)
        center = (np.max(coords, axis=0) + np.min(coords, axis=0)) / 2
        grid = native["get_grid"](molecule)
        flat = grid.reshape(-1)
        indices = np.flatnonzero(flat)
        grids.append({"name": name, "atoms": atoms, "center": center.tolist(),
                      "centeredCoordinates": (coords - center).tolist(),
                      "shape": [1, *grid.shape], "included": int(grid.sum()),
                      "nonzero": [[int(i), float(flat[i])] for i in indices]})
    typing = []
    for key in feature.atom_codes:
        z, h = key if isinstance(key, tuple) else (key, 0)
        _, encoded = feature.get_features(pybel_atoms([atom(z, (0, 0, 0), h)]), 0)
        typing.append({"z": z, "hyb": h, "channel": int(encoded[0].argmax()) - 14})
    unsupported = []
    for z, h in [(2, 0), (10, 0), (18, 0), (36, 0), (54, 0), (84, 0),
                 (6, 0), (6, 4), (6, 1.5), (7, 0), (16, 1), (16, 4)]:
        for outside in [False, True]:
            atoms = [atom(8, (-20, 0, 0)), atom(8, (20, 0, 0)),
                     atom(z, (20 if outside else 0, 0, 0), h)]
            try:
                native["get_grid"](pybel_atoms(atoms))
            except KeyError as error:
                unsupported.append({"atoms": atoms, "outside": outside,
                                    "nativeError": type(error).__name__})
            else:
                raise AssertionError("Expected unsupported atom typing")
    token_map = native["CHARISOSMISET"]
    sequences = ["CCO", "F[C@](Cl)(Br)I", "C/C=C\\C", "[NH4+]", "C" * 100,
                 "".join(token_map)]
    token_cases = [{"input": s, "expected": native["label_smiles"](s, token_map).tolist()}
                   for s in sequences]
    restrictions = [{"input": s, "native": native["label_smiles"](s, token_map).tolist(),
                     "browser": "reject"} for s in ["", "C" * 101, "C?C"]]
    output = {"schemaVersion": 1, "numpyVersion": np.__version__,
              "source": {"path": SOURCE.relative_to(ROOT).as_posix(),
                         "sha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest()},
              "method": "Unchanged AST-selected Feature_extractor/get_grid/label_smiles/CHARISOSMISET; fake pybel atom attributes only",
              "grids": grids, "atomTypes": typing, "unsupported": unsupported,
              "tokenMap": token_map, "tokens": token_cases, "intentionalRestrictions": restrictions}
    OUT.write_text(json.dumps(output, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUT.relative_to(ROOT)}: {len(grids)} grids, {len(typing)} atom types, {len(unsupported)} rejection cases")


if __name__ == "__main__":
    main()
