# unimolrep/rep2d/graph.py
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Sequence, Tuple
import os
import numpy as np

from .._deps import require

Chem = require("rdkit.Chem")
AllChem = require("rdkit.Chem.AllChem")
PDB = require("Bio.PDB")  # biopython


# -----------------------
# Atom feature definition
# -----------------------

_ATOM_TYPES: List[str] = [
    "H", "He", "Li", "Be", "B", "C", "N", "O", "F", "Ne",
    "Na", "Mg", "Al", "Si", "P", "S", "Cl", "Ar", "K", "Ca",
    "Sc", "Ti", "V", "Cr", "Mn", "Fe", "Co", "Ni", "Cu", "Zn",
    "Ga", "Ge", "As", "Se", "Br", "Kr", "Rb", "Sr", "Y", "Zr"
]
_ATOM_TYPE_INDEX = {s: i for i, s in enumerate(_ATOM_TYPES)}
_ATOM_TYPE_DIM = len(_ATOM_TYPES)  # 40

REP2D_ATOM_FEAT_DIM = 71  # fixed by your spec

# -----------------------
# Edge feature definition
# -----------------------
# Route B (clean):
# Covalent edge_attr (ONLY covalent chemistry, no "kind", no distance bins):
#   bond_type one-hot: [single,double,triple,aromatic] -> 4
#   conjugated -> 1
#   in_ring -> 1
#   stereo one-hot: [NONE,ANY,E,Z,CIS,TRANS] -> 6
REP2D_COV_EDGE_DIM = 4 + 1 + 1 + 6  # = 12

# Contact edge_attr (ONLY distance bins, NO continuous distance):
#   dist_bin one-hot: n_bins (default 4)
REP2D_CONTACT_EDGE_DIM_DEFAULT = 4

# Backward-compatible exports expected by unimolrep.rep2d.__init__
ATOM_FEAT_DIM = REP2D_ATOM_FEAT_DIM

# In Route-B we have two edge types (covalent/contact). For old API, EDGE_DIM maps to covalent.
EDGE_DIM = REP2D_COV_EDGE_DIM

# Optional: explicit dims (recommended)
COV_EDGE_DIM = REP2D_COV_EDGE_DIM
CONTACT_EDGE_DIM = REP2D_CONTACT_EDGE_DIM_DEFAULT


DEFAULT_DISTANCE_EDGES: Tuple[float, float, float, float] = (1.7, 3.5, 4.5, 5.5)

# -----------------------
# Data container
# -----------------------

@dataclass
class Graph2D:
    """

    x: (N, F) atom feature matrix
    pos: (N, 3) optional coordinates (needed for contact edges)

    covalent_edge_index: (2, E_cov) directed COO
    covalent_edge_attr:  (E_cov, D_cov) = (E_cov, 12)

    contact_edge_index: (2, E_con) directed COO (distance-binned nonbonded contacts)
    contact_edge_attr:  (E_con, D_con) = (E_con, n_bins), default n_bins=4

    meta: dictionary storing small info (smiles/path/bins, etc.)
    """
    x: np.ndarray
    covalent_edge_index: np.ndarray
    covalent_edge_attr: np.ndarray
    contact_edge_index: np.ndarray
    contact_edge_attr: np.ndarray
    pos: Optional[np.ndarray] = None
    meta: Dict[str, Any] = field(default_factory=dict)

    # Backward-friendly aliases (DO NOT merge; these are covalent-only views)
    @property
    def edge_index(self) -> np.ndarray:
        return self.covalent_edge_index

    @property
    def edge_attr(self) -> np.ndarray:
        return self.covalent_edge_attr


# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------

def _one_hot(index: int, length: int) -> np.ndarray:
    v = np.zeros(length, dtype=np.float32)
    if 0 <= index < length:
        v[index] = 1.0
    return v


def _empty_edge_index() -> np.ndarray:
    return np.zeros((2, 0), dtype=np.int64)


def _empty_edge_attr(dim: int) -> np.ndarray:
    return np.zeros((0, dim), dtype=np.float32)


def _get_atom_features_rdkit(a: "Chem.Atom") -> np.ndarray:
    """
    Your fixed 71-dim atom feature spec (RDKit atoms).
    """
    # atom type one-hot (40)
    sym = a.GetSymbol()
    type_bits = np.zeros(_ATOM_TYPE_DIM, dtype=np.float32)
    idx = _ATOM_TYPE_INDEX.get(sym)
    if idx is not None:
        type_bits[idx] = 1.0

    # degree one-hot (0..10 -> 11)
    degree = a.GetDegree()
    deg_bits = np.zeros(11, dtype=np.float32)
    if 0 <= degree <= 10:
        deg_bits[degree] = 1.0

    # implicit valence one-hot (0..6 -> 7)
    ival = a.GetImplicitValence()
    ival_bits = np.zeros(7, dtype=np.float32)
    if 0 <= ival <= 6:
        ival_bits[ival] = 1.0

    # formal charge & radical electrons
    formal_charge = float(a.GetFormalCharge())
    n_rad = float(a.GetNumRadicalElectrons())

    # hybridization one-hot: SP, SP2, SP3, SP3D, SP3D2 -> 5
    hyb = a.GetHybridization().name
    hyb_bits = np.zeros(5, dtype=np.float32)
    hyb_map = {"SP": 0, "SP2": 1, "SP3": 2, "SP3D": 3, "SP3D2": 4}
    if hyb in hyb_map:
        hyb_bits[hyb_map[hyb]] = 1.0

    # aromatic
    is_aromatic = np.array([1.0 if a.GetIsAromatic() else 0.0], dtype=np.float32)

    # hydrogen neighbor count one-hot (0..4 -> 5)
    n_h = a.GetTotalNumHs()
    h_bits = np.zeros(5, dtype=np.float32)
    if 0 <= n_h <= 4:
        h_bits[n_h] = 1.0

    feat = np.concatenate([
        type_bits, deg_bits, ival_bits,
        np.array([formal_charge, n_rad], dtype=np.float32),
        hyb_bits, is_aromatic, h_bits
    ]).astype(np.float32)

    # Defensive check
    if feat.shape[0] != REP2D_ATOM_FEAT_DIM:
        raise RuntimeError(f"Atom feature dim mismatch: got {feat.shape[0]} expected {REP2D_ATOM_FEAT_DIM}")
    return feat


def _get_atom_features_generic(element: str) -> np.ndarray:
    """
    Fallback 71-dim features for PDB atoms (Bio.PDB) where RDKit chemistry is unavailable.
    We only fill the element one-hot; other parts are zeros.
    This keeps a consistent node feature dimension.
    """
    type_bits = np.zeros(_ATOM_TYPE_DIM, dtype=np.float32)
    e = (element or "").strip().capitalize()
    idx = _ATOM_TYPE_INDEX.get(e)
    if idx is not None:
        type_bits[idx] = 1.0

    # The rest are unknown for plain PDB atoms -> zeros
    deg_bits = np.zeros(11, dtype=np.float32)
    ival_bits = np.zeros(7, dtype=np.float32)
    formal_charge_rad = np.zeros(2, dtype=np.float32)
    hyb_bits = np.zeros(5, dtype=np.float32)
    is_aromatic = np.zeros(1, dtype=np.float32)
    h_bits = np.zeros(5, dtype=np.float32)

    feat = np.concatenate([
        type_bits, deg_bits, ival_bits,
        formal_charge_rad, hyb_bits, is_aromatic, h_bits
    ]).astype(np.float32)

    if feat.shape[0] != REP2D_ATOM_FEAT_DIM:
        raise RuntimeError(f"Generic atom feature dim mismatch: got {feat.shape[0]} expected {REP2D_ATOM_FEAT_DIM}")
    return feat


def _edge_attr_covalent(bond: Optional["Chem.Bond"]) -> np.ndarray:
    """
    Covalent-only edge features (12 dims):
      bond_type(4) + conjugated(1) + in_ring(1) + stereo(6)
    If bond is None (e.g., PDB heuristic covalent), we return all zeros.
    """
    if bond is None:
        return np.zeros((REP2D_COV_EDGE_DIM,), dtype=np.float32)

    # bond type
    bt = bond.GetBondType()
    bond_map = {
        Chem.BondType.SINGLE: 0,
        Chem.BondType.DOUBLE: 1,
        Chem.BondType.TRIPLE: 2,
        Chem.BondType.AROMATIC: 3,
    }
    bond_type = np.zeros(4, dtype=np.float32)
    if bt in bond_map:
        bond_type[bond_map[bt]] = 1.0

    conjugated = np.array([1.0 if bond.GetIsConjugated() else 0.0], dtype=np.float32)
    in_ring = np.array([1.0 if bond.IsInRing() else 0.0], dtype=np.float32)

    # stereo
    st = bond.GetStereo()
    stereo_map = {
        Chem.BondStereo.STEREONONE: 0,
        Chem.BondStereo.STEREOANY: 1,
        Chem.BondStereo.STEREOE: 2,
        Chem.BondStereo.STEREOZ: 3,
        Chem.BondStereo.STEREOCIS: 4,
        Chem.BondStereo.STEREOTRANS: 5,
    }
    stereo = np.zeros(6, dtype=np.float32)
    if st in stereo_map:
        stereo[stereo_map[st]] = 1.0

    out = np.concatenate([bond_type, conjugated, in_ring, stereo]).astype(np.float32)
    if out.shape[0] != REP2D_COV_EDGE_DIM:
        raise RuntimeError(f"Covalent edge dim mismatch: got {out.shape[0]} expected {REP2D_COV_EDGE_DIM}")
    return out


def _bin_distance(d: float, edges: Sequence[float]) -> int:
    """
    Return bin id in [1..n_bins] for d within (0, edges[k]].
    Return 0 if d > edges[-1] or d <= 0.
    """
    if d <= 0:
        return 0
    for i, thr in enumerate(edges):
        if d <= thr:
            return i + 1
    return 0


def _edge_attr_contact(bin_id: int, n_bins: int) -> np.ndarray:
    """
    Contact-only edge features: distance bin one-hot (n_bins dims).
    NO continuous distance.
    """
    if bin_id <= 0:
        return np.zeros((n_bins,), dtype=np.float32)
    v = np.zeros((n_bins,), dtype=np.float32)
    j = bin_id - 1
    if 0 <= j < n_bins:
        v[j] = 1.0
    return v


def _pairwise_contacts(pos: np.ndarray, cutoff: float) -> List[Tuple[int, int, float]]:
    """
    Enumerate (i, j, distance) for i<j with distance <= cutoff.
    Naive O(N^2); for typical small molecules it's fine.
    """
    n = pos.shape[0]
    out: List[Tuple[int, int, float]] = []
    cutoff2 = float(cutoff) * float(cutoff)
    for i in range(n):
        pi = pos[i]
        for j in range(i + 1, n):
            pj = pos[j]
            d2 = float(np.sum((pi - pj) ** 2))
            if d2 <= cutoff2:
                out.append((i, j, float(np.sqrt(d2))))
    return out


# -----------------------------------------------------------------------------
# Public APIs
# -----------------------------------------------------------------------------

def graph_from_smiles(
    smiles: str,
    *,
    generate_3d: bool = False,
    add_hs: bool = False,
    distance_edges: Sequence[float] = DEFAULT_DISTANCE_EDGES,
    include_contact: bool = False,
) -> Graph2D:
    """
    Build Route-B graph from a SMILES.

    Covalent graph:
      - nodes: atoms
      - edges: RDKit bonds (directed)
      - covalent_edge_attr: 12-dim (bond_type + conjugation + ring + stereo)

    Contact graph (optional):
      - requires coordinates (generate_3d=True)
      - edges: nonbonded pairs within cutoff=distance_edges[-1], binned by distance
      - contact_edge_attr: n_bins one-hot (NO continuous distance)
    """
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        raise ValueError(f"Cannot parse SMILES: {smiles}")

    if add_hs:
        mol = Chem.AddHs(mol)

    pos = None
    if generate_3d or include_contact:
        # If user requests contact edges, we must have 3D coordinates
        mol3d = mol if add_hs else Chem.AddHs(mol)
        params = AllChem.ETKDGv3()
        params.randomSeed = 0xC0FFEE
        ok = AllChem.EmbedMolecule(mol3d, params)
        if ok != 0:
            raise ValueError("RDKit EmbedMolecule failed (ETKDG).")
        AllChem.UFFOptimizeMolecule(mol3d, maxIters=200)

        conf = mol3d.GetConformer()
        pos_all = np.array(
            [[conf.GetAtomPosition(i).x, conf.GetAtomPosition(i).y, conf.GetAtomPosition(i).z]
             for i in range(mol3d.GetNumAtoms())],
            dtype=np.float32
        )

        if not add_hs:
            idx_map = [i for i, a in enumerate(mol3d.GetAtoms()) if a.GetSymbol() != "H"]
            pos = pos_all[idx_map, :]
        else:
            pos = pos_all

    if include_contact and pos is None:
        raise ValueError("include_contact=True requires coordinates. Use generate_3d=True.")

    # Node features
    N = mol.GetNumAtoms()
    x = np.stack([_get_atom_features_rdkit(mol.GetAtomWithIdx(i)) for i in range(N)], axis=0).astype(np.float32)

    # Covalent edges from RDKit bonds
    cov_src: List[int] = []
    cov_dst: List[int] = []
    cov_attr: List[np.ndarray] = []
    bonded_pairs = set()

    for b in mol.GetBonds():
        u, v = b.GetBeginAtomIdx(), b.GetEndAtomIdx()
        bonded_pairs.add((min(u, v), max(u, v)))
        ea = _edge_attr_covalent(b)
        cov_src += [u, v]
        cov_dst += [v, u]
        cov_attr += [ea, ea]

    covalent_edge_index = (
        np.vstack([np.array(cov_src, dtype=np.int64), np.array(cov_dst, dtype=np.int64)])
        if len(cov_src) > 0 else _empty_edge_index()
    )
    covalent_edge_attr = (
        np.stack(cov_attr, axis=0).astype(np.float32)
        if len(cov_attr) > 0 else _empty_edge_attr(REP2D_COV_EDGE_DIM)
    )

    # Contact edges (optional)
    n_bins = len(distance_edges)
    con_src: List[int] = []
    con_dst: List[int] = []
    con_attr: List[np.ndarray] = []

    if include_contact:
        cutoff = float(distance_edges[-1])
        for i, j, d in _pairwise_contacts(pos, cutoff=cutoff):
            if (min(i, j), max(i, j)) in bonded_pairs:
                continue
            k = _bin_distance(d, distance_edges)  # 1..n_bins or 0
            if k == 0:
                continue
            ea = _edge_attr_contact(k, n_bins=n_bins)
            con_src += [i, j]
            con_dst += [j, i]
            con_attr += [ea, ea]

    contact_edge_index = (
        np.vstack([np.array(con_src, dtype=np.int64), np.array(con_dst, dtype=np.int64)])
        if len(con_src) > 0 else _empty_edge_index()
    )
    contact_edge_attr = (
        np.stack(con_attr, axis=0).astype(np.float32)
        if len(con_attr) > 0 else _empty_edge_attr(n_bins)
    )

    return Graph2D(
        x=x,
        covalent_edge_index=covalent_edge_index,
        covalent_edge_attr=covalent_edge_attr,
        contact_edge_index=contact_edge_index,
        contact_edge_attr=contact_edge_attr,
        pos=pos,
        meta={
            "kind": "smiles",
            "smiles": Chem.MolToSmiles(mol),
            "include_contact": bool(include_contact),
            "distance_edges": tuple(float(t) for t in distance_edges),
        }
    )


# Covalent radii (Å) used for PDB heuristic covalent detection
_COV_RADII = {
    "H": 0.31, "C": 0.76, "N": 0.71, "O": 0.66, "F": 0.57,
    "P": 1.07, "S": 1.05, "Cl": 1.02, "Br": 1.20, "I": 1.39,
    "Se": 1.20, "Si": 1.11,
}


def _heuristic_is_covalent(ei: str, ej: str, d: float, cov_scale: float) -> bool:
    ri = _COV_RADII.get(ei, 0.77)
    rj = _COV_RADII.get(ej, 0.77)
    return d <= cov_scale * (ri + rj)


def graph_from_structure(
    path: str,
    *,
    distance_edges: Sequence[float] = DEFAULT_DISTANCE_EDGES,
    include_contact: bool = True,
    detect_covalent: bool = True,
    cov_scale: float = 1.20,
    include_h: bool = False,
) -> Graph2D:
    """
    Build Route-B graph from structure file:
      - PDB: parse coordinates with Bio.PDB; covalent edges optionally detected by covalent radii heuristic.
      - SDF/MOL2: read with RDKit (uses provided bond topology + coordinates if present).

    Contact edges (optional):
      - requires coordinates
      - contact_edge_attr is ONLY distance-bin one-hot (no continuous distance)
    """
    ext = os.path.splitext(path)[1].lower()
    if ext == ".pdb":
        return _graph_from_pdb(
            path,
            distance_edges=distance_edges,
            include_contact=include_contact,
            detect_covalent=detect_covalent,
            cov_scale=cov_scale,
            include_h=include_h,
        )
    elif ext in (".sdf", ".mol2", ".mol"):
        return _graph_from_rdkit_file(
            path,
            distance_edges=distance_edges,
            include_contact=include_contact,
            include_h=include_h,
        )
    else:
        raise ValueError(f"Unsupported structure format: {ext} (expected .pdb/.sdf/.mol2/.mol)")


def _graph_from_rdkit_file(
    path: str,
    *,
    distance_edges: Sequence[float],
    include_contact: bool,
    include_h: bool,
) -> Graph2D:
    # RDKit file reading
    ext = os.path.splitext(path)[1].lower()
    if ext == ".sdf":
        mol = Chem.MolFromMolFile(path, removeHs=(not include_h), sanitize=True)
    elif ext == ".mol2":
        mol = Chem.MolFromMol2File(path, removeHs=(not include_h), sanitize=True)
    else:  # ".mol"
        mol = Chem.MolFromMolFile(path, removeHs=(not include_h), sanitize=True)

    if mol is None:
        raise ValueError(f"RDKit failed to read structure file: {path}")

    # Coordinates (if available)
    pos = None
    if mol.GetNumConformers() > 0:
        conf = mol.GetConformer()
        pos = np.array(
            [[conf.GetAtomPosition(i).x, conf.GetAtomPosition(i).y, conf.GetAtomPosition(i).z]
             for i in range(mol.GetNumAtoms())],
            dtype=np.float32
        )

    if include_contact and pos is None:
        raise ValueError("include_contact=True requires coordinates in the input file.")

    # Node features
    N = mol.GetNumAtoms()
    x = np.stack([_get_atom_features_rdkit(mol.GetAtomWithIdx(i)) for i in range(N)], axis=0).astype(np.float32)

    # Covalent edges from RDKit bonds
    cov_src: List[int] = []
    cov_dst: List[int] = []
    cov_attr: List[np.ndarray] = []
    bonded_pairs = set()

    for b in mol.GetBonds():
        u, v = b.GetBeginAtomIdx(), b.GetEndAtomIdx()
        bonded_pairs.add((min(u, v), max(u, v)))
        ea = _edge_attr_covalent(b)
        cov_src += [u, v]
        cov_dst += [v, u]
        cov_attr += [ea, ea]

    covalent_edge_index = (
        np.vstack([np.array(cov_src, dtype=np.int64), np.array(cov_dst, dtype=np.int64)])
        if len(cov_src) > 0 else _empty_edge_index()
    )
    covalent_edge_attr = (
        np.stack(cov_attr, axis=0).astype(np.float32)
        if len(cov_attr) > 0 else _empty_edge_attr(REP2D_COV_EDGE_DIM)
    )

    # Contact edges (optional)
    n_bins = len(distance_edges)
    con_src: List[int] = []
    con_dst: List[int] = []
    con_attr: List[np.ndarray] = []

    if include_contact:
        cutoff = float(distance_edges[-1])
        for i, j, d in _pairwise_contacts(pos, cutoff=cutoff):
            if (min(i, j), max(i, j)) in bonded_pairs:
                continue
            k = _bin_distance(d, distance_edges)
            if k == 0:
                continue
            ea = _edge_attr_contact(k, n_bins=n_bins)
            con_src += [i, j]
            con_dst += [j, i]
            con_attr += [ea, ea]

    contact_edge_index = (
        np.vstack([np.array(con_src, dtype=np.int64), np.array(con_dst, dtype=np.int64)])
        if len(con_src) > 0 else _empty_edge_index()
    )
    contact_edge_attr = (
        np.stack(con_attr, axis=0).astype(np.float32)
        if len(con_attr) > 0 else _empty_edge_attr(n_bins)
    )

    return Graph2D(
        x=x,
        covalent_edge_index=covalent_edge_index,
        covalent_edge_attr=covalent_edge_attr,
        contact_edge_index=contact_edge_index,
        contact_edge_attr=contact_edge_attr,
        pos=pos,
        meta={
            "kind": "rdkit_file",
            "path": path,
            "include_contact": bool(include_contact),
            "distance_edges": tuple(float(t) for t in distance_edges),
        }
    )


def _graph_from_pdb(
    path: str,
    *,
    distance_edges: Sequence[float],
    include_contact: bool,
    detect_covalent: bool,
    cov_scale: float,
    include_h: bool,
) -> Graph2D:
    parser = PDB.PDBParser(QUIET=True)
    structure = parser.get_structure("X", path)

    atoms: List[Any] = []
    coords: List[List[float]] = []
    elements: List[str] = []

    for model in structure:
        for chain in model:
            for residue in chain:
                for atom in residue:
                    elem = (atom.element or "").strip().capitalize()
                    if (not include_h) and elem == "H":
                        continue
                    atoms.append(atom)
                    coords.append(list(atom.coord))
                    elements.append(elem)

    if len(atoms) == 0:
        raise ValueError(f"No atoms parsed from PDB: {path}")

    pos = np.asarray(coords, dtype=np.float32)
    N = pos.shape[0]

    # Node features (generic)
    x = np.stack([_get_atom_features_generic(e) for e in elements], axis=0).astype(np.float32)

    # Covalent edges: heuristic (optional)
    cov_src: List[int] = []
    cov_dst: List[int] = []
    cov_attr: List[np.ndarray] = []
    covalent_pairs = set()

    if detect_covalent:
        # naive O(N^2): ok for moderate pocket/complex sizes
        for i in range(N):
            ei = elements[i]
            for j in range(i + 1, N):
                ej = elements[j]
                d = float(np.linalg.norm(pos[i] - pos[j]))
                if _heuristic_is_covalent(ei, ej, d, cov_scale=cov_scale):
                    covalent_pairs.add((i, j))
                    ea = _edge_attr_covalent(None)  # unknown bond chemistry in plain PDB
                    cov_src += [i, j]
                    cov_dst += [j, i]
                    cov_attr += [ea, ea]

    covalent_edge_index = (
        np.vstack([np.array(cov_src, dtype=np.int64), np.array(cov_dst, dtype=np.int64)])
        if len(cov_src) > 0 else _empty_edge_index()
    )
    covalent_edge_attr = (
        np.stack(cov_attr, axis=0).astype(np.float32)
        if len(cov_attr) > 0 else _empty_edge_attr(REP2D_COV_EDGE_DIM)
    )

    # Contact edges: distance-binned, excluding heuristic covalent pairs
    n_bins = len(distance_edges)
    con_src: List[int] = []
    con_dst: List[int] = []
    con_attr: List[np.ndarray] = []

    if include_contact:
        cutoff = float(distance_edges[-1])
        for i, j, d in _pairwise_contacts(pos, cutoff=cutoff):
            if (i, j) in covalent_pairs:
                continue
            k = _bin_distance(d, distance_edges)
            if k == 0:
                continue
            ea = _edge_attr_contact(k, n_bins=n_bins)
            con_src += [i, j]
            con_dst += [j, i]
            con_attr += [ea, ea]

    contact_edge_index = (
        np.vstack([np.array(con_src, dtype=np.int64), np.array(con_dst, dtype=np.int64)])
        if len(con_src) > 0 else _empty_edge_index()
    )
    contact_edge_attr = (
        np.stack(con_attr, axis=0).astype(np.float32)
        if len(con_attr) > 0 else _empty_edge_attr(n_bins)
    )

    return Graph2D(
        x=x,
        covalent_edge_index=covalent_edge_index,
        covalent_edge_attr=covalent_edge_attr,
        contact_edge_index=contact_edge_index,
        contact_edge_attr=contact_edge_attr,
        pos=pos,
        meta={
            "kind": "pdb",
            "path": path,
            "include_contact": bool(include_contact),
            "distance_edges": tuple(float(t) for t in distance_edges),
            "detect_covalent": bool(detect_covalent),
            "cov_scale": float(cov_scale),
            "include_h": bool(include_h),
        }
    )
