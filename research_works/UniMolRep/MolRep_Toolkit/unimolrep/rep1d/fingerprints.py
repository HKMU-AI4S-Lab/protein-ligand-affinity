# unimolrep/fingerprints.py
from __future__ import annotations
from typing import Tuple
import numpy as np

from rdkit import Chem, DataStructs
from rdkit.Chem import MACCSkeys, RDKFingerprint
from rdkit.Chem.rdFingerprintGenerator import (
    GetMorganGenerator,
    GetAtomPairGenerator,
    GetTopologicalTorsionGenerator,
)

__all__ = [
    "fp_maccs",
    "fp_morgan",
    "fp_morgan_counts",
    "fp_rdkit_path",
    "fp_atom_pairs",
    "fp_topological_torsions",
]

# ---------- helpers ----------
def _smiles_to_mol(smiles: str) -> Chem.Mol:
    """Parse SMILES to an RDKit Mol with basic sanitization."""
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        raise ValueError(f"Invalid SMILES: {smiles}")
    Chem.SanitizeMol(mol)
    return mol

def _bv_to_np(bv) -> np.ndarray:
    """Convert RDKit ExplicitBitVect -> numpy int8 array of shape (n_bits,)."""
    arr = np.zeros((bv.GetNumBits(),), dtype=np.int8)
    DataStructs.ConvertToNumpyArray(bv, arr)
    return arr

# =========================
# 1) Dictionary-based
# =========================
def fp_maccs(smiles: str) -> np.ndarray:
    """
    MACCS 166-bit dictionary fingerprint.

    RDKit returns 167 bits with bit-0 unused; we drop index 0 to get (166,).
    """
    mol = _smiles_to_mol(smiles)
    bv = MACCSkeys.GenMACCSKeys(mol)  # 167 bits, bit 0 is unused
    return _bv_to_np(bv)[1:]          # -> (166,)

# =========================
# 2) Circular (ECFP/Morgan)
# =========================
def fp_morgan(smiles: str, radius: int = 2, n_bits: int = 2048, use_chirality: bool = True) -> np.ndarray:
    """
    Morgan/ECFP bit fingerprint (binary).
    radius=2 is the common ECFP4 setting. Returns shape (n_bits,).
    """
    mol = _smiles_to_mol(smiles)
    gen = GetMorganGenerator(radius=radius, fpSize=n_bits, includeChirality=use_chirality)
    bv = gen.GetFingerprint(mol)
    return _bv_to_np(bv)

def fp_morgan_counts(smiles: str, radius: int = 2, n_bits: int = 2048, use_chirality: bool = True) -> np.ndarray:
    """
    Morgan hashed *count* fingerprint (non-binary).
    Returns int32 array of shape (n_bits,).
    """
    mol = _smiles_to_mol(smiles)
    gen = GetMorganGenerator(radius=radius, fpSize=n_bits, includeChirality=use_chirality)
    sv = gen.GetCountFingerprint(mol)  # UIntSparseIntVect
    arr = np.zeros((n_bits,), dtype=np.int32)
    for idx, val in sv.GetNonzeroElements().items():
        if 0 <= idx < n_bits:
            arr[idx] = int(val)
    return arr

# =========================
# 3) Path-based
# =========================
def fp_rdkit_path(smiles: str, n_bits: int = 2048, min_path: int = 1, max_path: int = 7) -> np.ndarray:
    """
    RDKit classic subpath fingerprint.
    Returns binary array of shape (n_bits,).
    """
    mol = _smiles_to_mol(smiles)
    bv = RDKFingerprint(
        mol,
        fpSize=n_bits,
        minPath=min_path,
        maxPath=max_path,
        nBitsPerHash=2,
        useHs=True,
        tgtDensity=0.0,
        minSize=128,
    )
    return _bv_to_np(bv)

def fp_atom_pairs(smiles: str, n_bits: int = 2048) -> np.ndarray:
    """
    Atom Pairs fingerprint (generator API).
    Returns binary array of shape (n_bits,).
    """
    mol = _smiles_to_mol(smiles)
    gen = GetAtomPairGenerator(fpSize=n_bits)
    bv = gen.GetFingerprint(mol)
    return _bv_to_np(bv)

def fp_topological_torsions(smiles: str, n_bits: int = 2048) -> np.ndarray:
    """
    Topological Torsions fingerprint (generator API).
    Returns binary array of shape (n_bits,).
    Note: very small molecules may yield all zeros (no 4-atom torsions).
    """
    mol = _smiles_to_mol(smiles)
    gen = GetTopologicalTorsionGenerator(fpSize=n_bits)
    bv = gen.GetFingerprint(mol)
    return _bv_to_np(bv)
