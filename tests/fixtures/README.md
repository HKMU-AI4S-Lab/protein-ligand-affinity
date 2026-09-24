# Native preprocessing reference fixtures

## Fusion

```powershell
.venv\Scripts\python.exe scripts/prepare-fusion-fixtures.py
node --test tests/fusion-parity.test.mjs
```

`fusion-native.json` binds the recovered `DataSetsFunction.py` by SHA-256 and executes its unchanged `Feature_extractor`, `get_grid`, `label_smiles` and `CHARISOSMISET` definitions selected by AST. The only molecular adapter supplies pybel-style `atomicnum`, `hyb` and `coords` attributes. No toolkit chemistry assignment, conformer generation or model inference is replaced or tested by this adapter.

Eight grid fixtures cover all 14 ligand channels, all 20 populated positions inside the 24-position allocation, first-index ties, overlapping occupancy, FP32 bounding-box centring, exact cube edges, adjacent representable floats and outside atoms. Tests compare every voxel exactly, including zero protein channels and the unused four positions per axis. Source inclusion uses FP32 distances to the -9.5 and +9.5 endpoints; a coordinate one FP32 ULP above 10 still passes its 19.5 threshold. A simple absolute-coordinate cutoff would disagree. All 79 native atom-type keys and 24 unsupported-type cases are checked, including unsupported atoms outside the cube; typing must precede spatial culling.

Six token fixtures compare exact int64 IDs and padding, including all 64 supported characters and the 100-character limit. The all-character string is a tokenizer fixture, not a chemically valid molecule. The browser intentionally rejects empty strings, overlength strings and unknown tokens; the native training helper instead accepts empty input, truncates after 100 characters and silently writes zero for unknown characters. These stricter browser restrictions implement the requested input policy and are recorded explicitly in the fixture.

These checks establish fixed-input preprocessing parity only. They do **not** validate OpenBabel hybridization/stereochemistry/conformers or full Fusion predictions. Complete-checkpoint browser and native comparisons are performed separately by `scripts/browser-grant.cjs` and `scripts/validate-ui-fusion.py`.

## UniMolRep

Regenerate `unimolrep-native.json` from the repository root with:

```powershell
.venv\Scripts\python.exe scripts/prepare-representation-fixtures.py
node --test tests/representation-parity.test.mjs
```

The generator executes the original UniMolRep fingerprint, graph, angle, torsion and grid function bodies. Source files are SHA-256-bound in the fixture. Package-relative import statements are removed through AST loading; original functions and constants are unchanged. The unused Bio.PDB dependency is replaced with an empty adapter. A minimal fixed-atom MDAnalysis adapter provides atom-group positions, element identities, ligand selections, set operations and indexing. The original `make_grid_from_structure` channel mapping, coordinate arrays, culling and Gaussian rasterisation then execute unchanged with explicit coordinates, all atoms marked as ligand, no pocket cut and no rotation.

Eight SMILES cover aliphatic, aromatic, branched, singleton and enantiomer cases. Native Morgan radius-2/2048-bit/chirality fingerprints, atom order and directed edges are compared with the actual installed RDKit WASM package. Angle and torsion fixtures use deliberately asymmetric, synthetic coordinates; these are algorithm fixtures rather than physical conformers. Five full grids are represented sparsely in JSON. Tests check every voxel, including zeros, and cover all channels, unknown-element fallback, overlap, cube edges and subvoxel offsets.

Acceptance here is exact fingerprint/topology/bin equality, angle error <=1e-4 degrees for native FP32 coordinate arithmetic, and Gaussian voxel absolute error <=5e-7. Tiny valid vectors have a separate degeneracy regression check. Native torsion rows are aligned by atom indices because native traversal uses a Python set. Native channel labels `prot:`/`lig:` map explicitly to display labels `protein:`/`ligand:` without changing channel order.

These fixtures do **not** certify OpenBabel/RDKit conformer equivalence, arbitrary chemical-domain compatibility, native protein parsing or selections, contacts, trajectories, random augmentation or the currently unexposed full 71/12-dimensional graph feature tensors. The generated fixture records native RDKit and numpy versions; the test executes the installed browser RDKit WASM build under Node. Browser integration and conformer stereochemistry need separate checks.
