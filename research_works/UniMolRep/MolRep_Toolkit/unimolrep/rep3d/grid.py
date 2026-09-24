from __future__ import annotations
from dataclasses import dataclass
from typing import List, Optional, Tuple, Literal

import numpy as np
from .._deps import require


@dataclass
class Grid3D:
    """
    3D voxel grid container.

    tensor: (C, X, Y, Z) voxel grid
    origin: (3,) world-space coordinate of the voxel (0,0,0) cube's MIN CORNER (Å)
    spacing: scalar voxel size (Å) (a.k.a. resolution)
    channel_names: list[str] describing channels in order
    center: (3,) center used to place the cube (Å) (for reference/debug)
    meta: misc info (e.g., selection sizes)
    """
    tensor: np.ndarray
    origin: np.ndarray
    spacing: float
    channel_names: List[str]
    center: np.ndarray
    meta: dict


# ------------------------ utilities: rotations & elements ------------------------

def _rand_rotation_matrix(rng: np.random.Generator) -> np.ndarray:
    """
    Sample a random rotation in SO(3) via random quaternion (uniform on S^3).
    Returns a (3,3) rotation matrix.
    """
    u1, u2, u3 = rng.random(3)
    q1 = np.sqrt(1 - u1) * np.sin(2 * np.pi * u2)
    q2 = np.sqrt(1 - u1) * np.cos(2 * np.pi * u2)
    q3 = np.sqrt(u1) * np.sin(2 * np.pi * u3)
    q4 = np.sqrt(u1) * np.cos(2 * np.pi * u3)
    x, y, z, w = q1, q2, q3, q4
    R = np.array([
        [1 - 2*(y*y + z*z),     2*(x*y - z*w),         2*(x*z + y*w)],
        [    2*(x*y + z*w),  1 - 2*(x*x + z*z),        2*(y*z - x*w)],
        [    2*(x*z - y*w),     2*(y*z + x*w),     1 - 2*(x*x + y*y)]
    ], dtype=np.float32)
    return R


_HALOGENS = {"F", "CL", "BR", "I"}
_METALS   = {
    "LI","NA","K","RB","CS","MG","CA","SR","BA","ZN","CU","NI","CO","MN","FE","CD",
    "AL","GA","IN","HG","TI","V","CR","MO","W","PT","PD","AU","AG"
}

def _infer_element(atom) -> str:
    """
    Infer element symbol (uppercase) from MDAnalysis Atom object.
    Tries atom.element if present; otherwise guesses from atom.name (handles halogens).
    """
    el = getattr(atom, "element", None)
    if el:
        return str(el).strip().upper()
    name = str(getattr(atom, "name", "")).strip().upper()
    if len(name) >= 2 and name[:2] in {"CL", "BR"}:
        return name[:2]
    if len(name) >= 1:
        return name[0]
    return "C"


# ------------------------ channel schemes (AD4-like / pharmacophore) ------------------------

def _ad4_channel_list(separate_protein_ligand: bool) -> List[str]:
    """
    AD4-like element channels (simplified & robust to PDBs):
      base: ['C','N','O','S','P','F','Cl','Br','I','H','Met']
    If separate_protein_ligand=True, we prefix with 'prot:' / 'lig:' and concatenate.
    """
    base = ["C","N","O","S","P","F","Cl","Br","I","H","Met"]
    if separate_protein_ligand:
        return [f"prot:{x}" for x in base] + [f"lig:{x}" for x in base]
    else:
        return base[:]

def _ad4_channel_index(element_uc: str, is_protein: bool,
                       separate_protein_ligand: bool) -> int:
    """
    Map (element, is_protein) to channel index in the AD4-like list.
    """
    el = element_uc
    if el in _HALOGENS:
        # normalize halogens to proper case in channel names
        if el == "CL": el = "Cl"
        if el == "BR": el = "Br"
    elif el in _METALS:
        el = "Met"
    elif el not in {"C","N","O","S","P","F","I","H"}:
        # everything else (Si, Se, etc.) → 'Met' fallback
        el = "Met"

    order = ["C","N","O","S","P","F","Cl","Br","I","H","Met"]
    idx_in_base = order.index(el)
    if separate_protein_ligand:
        return idx_in_base if is_protein else (len(order) + idx_in_base)
    else:
        return idx_in_base


# ------------------------ pocket selection helpers ------------------------

def _select_groups(u, ligand_selection: Optional[str]):
    """
    Return (protein_atoms, ligand_atoms, other_atoms) AtomGroups from MDAnalysis Universe.
    ligand_selection: if provided, used as MDAnalysis selection string for the ligand.
                      if None, we take 'not protein and not water'.
    """
    protein = u.select_atoms("protein")
    water = u.select_atoms("water")
    if ligand_selection is None:
        lig = u.select_atoms("not protein and not water")
    else:
        lig = u.select_atoms(ligand_selection)
    # 'other' are non-protein, non-ligand, non-water; rarely used (ions/cofactors)
    other = u.atoms.difference(protein.union(lig).union(water))
    return protein, lig, other


def _center_of_mass_safe(ag) -> np.ndarray:
    if len(ag) == 0:
        return np.zeros(3, dtype=np.float32)
    try:
        return np.asarray(ag.center_of_mass(), dtype=np.float32)
    except Exception:
        # fallback: simple mean of positions (Å)
        return np.asarray(ag.positions.mean(axis=0), dtype=np.float32)


# ------------------------ main API ------------------------

def make_grid_from_structure(
    path: str,
    *,
    center: Literal["ligand","coords"] = "ligand",
    center_coords: Optional[Tuple[float,float,float]] = None,
    ligand_selection: Optional[str] = None,
    # pocket box sizing
    size: Optional[float] = 24.0,           # Å; if None, computed from r_cut + margin
    resolution: float = 0.5,                # Å per voxel
    r_cut: float = 6.0,                     # pocket cut radius around ligand (Å)
    margin: float = 4.0,                    # extra margin beyond r_cut to form box (Å)
    # channel/density
    scheme: Literal["ad4","pharmacophore"] = "ad4",
    density: Literal["gaussian","occupancy"] = "gaussian",
    sigma: float = 0.5,                     # Å, Gaussian width (std)
    separate_protein_ligand: bool = True,
    include_charge: bool = False,           # if AtomGroup has .charges
    # selection & augmentation
    use_pocket_cut: bool = True,            # keep protein atoms within r_cut to ligand
    random_rotate: bool = True,
    rng_seed: Optional[int] = 0,
) -> Grid3D:
    """
    Build a 3D voxel grid around a pocket. Default: ligand-centered box.

    - Loads the structure with MDAnalysis (PDB/MOL2/SDF...).
    - Defines center at the ligand COM (or provided coords).
    - Optional: pocket cut keeps only protein atoms within r_cut of ligand.
    - Builds a cube of 'size' Å with 'resolution' Å spacing, emits (C,X,Y,Z) tensor.

    Notes:
      * We keep hydrogens by default (grid models commonly benefit from explicit H).
      * 'pharmacophore' scheme is a placeholder for future, 'ad4' is implemented here.
    """
    # --- deps ---
    mda = require("MDAnalysis")
    distances = require("MDAnalysis.lib.distances")

    u = mda.Universe(path)

    # --- selections ---
    protein, ligand, other = _select_groups(u, ligand_selection)
    if center == "ligand":
        if len(ligand) == 0:
            # fall back: if no ligand, use all non-protein (ions/cofactors) else protein COM
            center_pt = _center_of_mass_safe(other if len(other) > 0 else protein)
        else:
            center_pt = _center_of_mass_safe(ligand)
    else:
        if center_coords is None:
            raise ValueError("center='coords' requires center_coords=(x,y,z) in Å")
        center_pt = np.asarray(center_coords, dtype=np.float32)

    # --- pocket cut (protein within r_cut to ligand) ---
    if use_pocket_cut and len(ligand) > 0 and r_cut > 0.0:
        # compute minimal distance of each protein atom to any ligand atom (no PBC)
        dmin = distances.distance_array(protein.positions, ligand.positions).min(axis=1)
        mask = (dmin <= float(r_cut))
        protein_pocket = protein[mask]
    else:
        protein_pocket = protein

    # --- determine box size ---
    if size is None:
        size = 2.0 * (float(r_cut) + float(margin))  # conservative: includes margin
    size = float(size)
    h = float(resolution)
    if h <= 0:
        raise ValueError("resolution must be > 0")

    # number of voxels per axis
    n = int(round(size / h))
    if n < 1:
        raise ValueError("size/resolution too small; got n < 1")
    size = n * h  # snap to grid
    half = 0.5 * size

    # grid coordinate system
    origin = (center_pt - half).astype(np.float32)       # min corner
    xs = origin[0] + (np.arange(n, dtype=np.float32) + 0.5) * h
    ys = origin[1] + (np.arange(n, dtype=np.float32) + 0.5) * h
    zs = origin[2] + (np.arange(n, dtype=np.float32) + 0.5) * h

    # --- optional random rotation (about center) ---
    coords_p = protein_pocket.positions.copy()
    coords_l = ligand.positions.copy()
    coords_o = other.positions.copy()
    if random_rotate:
        rng = np.random.default_rng(rng_seed)
        R = _rand_rotation_matrix(rng)
        def _rot(arr):
            if arr.size == 0:
                return arr
            tmp = arr - center_pt[None, :]
            return (tmp @ R.T) + center_pt[None, :]
        coords_p = _rot(coords_p)
        coords_l = _rot(coords_l)
        coords_o = _rot(coords_o)

    # --- assemble atom tables to rasterize ---
    # stack arrays: positions, is_protein flag, element symbol (upper), charge (if any)
    # we keep: ligand atoms always; protein_pocket (cut) atoms; optional 'other' if within cube
    def _within_cube(pos: np.ndarray) -> np.ndarray:
        return (
            (pos[:, 0] >= origin[0]) & (pos[:, 0] <= origin[0] + size) &
            (pos[:, 1] >= origin[1]) & (pos[:, 1] <= origin[1] + size) &
            (pos[:, 2] >= origin[2]) & (pos[:, 2] <= origin[2] + size)
        )

    # filter to cube (quick cull)
    mp = _within_cube(coords_p)
    ml = _within_cube(coords_l) if coords_l.size > 0 else np.array([], dtype=bool)
    mo = _within_cube(coords_o) if coords_o.size > 0 else np.array([], dtype=bool)

    prot_sel = protein_pocket[np.where(mp)[0]]
    lig_sel  = ligand[np.where(ml)[0]]
    oth_sel  = other[np.where(mo)[0]]

    # collect arrays
    def _collect(ag, is_protein_flag: bool):
        if len(ag) == 0:
            return (np.zeros((0, 3), dtype=np.float32), [], np.zeros((0,), dtype=np.float32))
        pos = ag.positions.astype(np.float32)
        els = [_infer_element(a) for a in ag.atoms]
        if include_charge and hasattr(ag, "charges") and ag.charges is not None:
            chg = np.asarray(ag.charges, dtype=np.float32)
        else:
            chg = np.zeros((len(ag),), dtype=np.float32)
        return pos, els, chg

    pos_p, els_p, chg_p = _collect(prot_sel, True)
    pos_l, els_l, chg_l = _collect(lig_sel, False)
    pos_o, els_o, chg_o = _collect(oth_sel, False)

    # --- channels ---
    if scheme == "ad4":
        channel_names = _ad4_channel_list(separate_protein_ligand)
        # optional global charge channels at the end (not split by prot/lig)
        if include_charge:
            channel_names = channel_names + ["charge_pos", "charge_neg"]
    else:
        raise NotImplementedError("Only 'ad4' scheme is implemented in this version.")

    C = len(channel_names)
    grid = np.zeros((C, n, n, n), dtype=np.float32)

    # convenience: channel dispatcher
    def _chan(el_uc: str, is_protein: bool) -> int:
        return _ad4_channel_index(el_uc, is_protein, separate_protein_ligand)

    # --- rasterization ---
    # density kernels:
    gauss = (density == "gaussian")
    occ   = (density == "occupancy")
    if not (gauss or occ):
        raise ValueError("density must be 'gaussian' or 'occupancy'")

    if gauss and sigma <= 0.0:
        raise ValueError("sigma must be > 0 for gaussian density")

    # voxel center arrays for slicing
    def _rasterize_atoms(positions: np.ndarray, elements: List[str], is_protein: bool, charges: np.ndarray):
        if positions.shape[0] == 0:
            return
        # per-axis voxel center arrays
        for idx in range(positions.shape[0]):
            px, py, pz = float(positions[idx, 0]), float(positions[idx, 1]), float(positions[idx, 2])
            el = elements[idx].upper()
            ch = float(charges[idx]) if charges.size > 0 else 0.0

            # quick skip if way outside cube (already culled, but keep safe)
            if (px < origin[0] - 1.0) or (px > origin[0] + size + 1.0):
                continue
            if (py < origin[1] - 1.0) or (py > origin[1] + size + 1.0):
                continue
            if (pz < origin[2] - 1.0) or (pz > origin[2] + size + 1.0):
                continue

            # influence radius
            if gauss:
                R = 3.0 * sigma
            else:
                # occupancy radius (flat kernel); simple default 1.5 Å (heavy) / 1.0 Å (H)
                R = 1.0 if el == "H" else 1.5

            # index ranges on each axis where |axis - p| <= R
            mx = np.abs(xs - px) <= R
            my = np.abs(ys - py) <= R
            mz = np.abs(zs - pz) <= R
            if not (mx.any() and my.any() and mz.any()):
                continue
            ix = np.where(mx)[0]; iy = np.where(my)[0]; iz = np.where(mz)[0]

            # separable kernel
            if gauss:
                gx = np.exp(-0.5 * ((xs[ix] - px) / sigma) ** 2, dtype=np.float32)
                gy = np.exp(-0.5 * ((ys[iy] - py) / sigma) ** 2, dtype=np.float32)
                gz = np.exp(-0.5 * ((zs[iz] - pz) / sigma) ** 2, dtype=np.float32)
                blob = gx[:, None, None] * gy[None, :, None] * gz[None, None, :]
            else:
                # flat occupancy kernel: inside sphere
                dx2 = (xs[ix] - px) ** 2
                dy2 = (ys[iy] - py) ** 2
                dz2 = (zs[iz] - pz) ** 2
                # (|x-px|^2 + |y-py|^2 + |z-pz|^2 <= R^2)
                blob = (dx2[:, None, None] + dy2[None, :, None] + dz2[None, None, :] <= R * R).astype(np.float32)

            # add to element channel
            c = _chan(el, is_protein)
            grid[c, ix[:, None, None], iy[None, :, None], iz[None, None, :]] += blob

            # optional: charge channels (global, last two channels)
            if include_charge and ch != 0.0:
                cpos = C - 2; cneg = C - 1
                if ch > 0:
                    grid[cpos, ix[:, None, None], iy[None, :, None], iz[None, None, :]] += blob * ch
                else:
                    grid[cneg, ix[:, None, None], iy[None, :, None], iz[None, None, :]] += blob * (-ch)

    # rasterize protein, ligand, and (optional) others
    _rasterize_atoms(pos_p, els_p, True, chg_p)
    _rasterize_atoms(pos_l, els_l, False, chg_l)
    _rasterize_atoms(pos_o, els_o, False, chg_o)

    meta = {
        "protein_atoms": int(len(protein)),
        "ligand_atoms": int(len(ligand)),
        "protein_pocket_atoms": int(len(protein_pocket)),
        "prot_in_cube": int(pos_p.shape[0]),
        "lig_in_cube": int(pos_l.shape[0]),
        "oth_in_cube": int(pos_o.shape[0]),
        "r_cut": float(r_cut),
        "box_size": float(size),
        "resolution": h,
        "density": density,
        "sigma": float(sigma),
        "separate_protein_ligand": bool(separate_protein_ligand),
        "include_charge": bool(include_charge),
        "random_rotate": bool(random_rotate),
        "center_mode": center,
    }

    return Grid3D(
        tensor=grid,
        origin=origin,
        spacing=h,
        channel_names=channel_names,
        center=center_pt.astype(np.float32),
        meta=meta,
    )
