# unimolrep/rep3d/graph_3d.py
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, Sequence

import numpy as np

from unimolrep.rep2d.graph import Graph2D


@dataclass
class Graph3D:
    """
    3D Torsion representation aligning strictly with manuscript definitions.

    Attributes:
      x: (A, C_angle) Node feature matrix containing bond-angle features (from 2.5D logic).
      torsion_index: (4, T) Edge list defined as atomic quadruples (i, s, j, t) for dihedrals.
      torsion_attr: (T, C_torsion) Edge features of the 3D graph (one-hot binned dihedrals).
      meta: Dictionary storing structural metadata.
    """
    x: np.ndarray
    torsion_index: np.ndarray
    torsion_attr: np.ndarray
    meta: Dict[str, Any] = field(default_factory=dict)


def _one_hot_bin(bin_id: int, n_bins: int) -> np.ndarray:
    v = np.zeros((n_bins,), dtype=np.float32)
    if 1 <= bin_id <= n_bins:
        v[bin_id - 1] = 1.0
    return v


def _bin_angle(theta_deg: float, bins_deg: Sequence[float]) -> int:
    if theta_deg <= 0.0 or theta_deg > float(bins_deg[-1]):
        return 0
    for i, edge in enumerate(bins_deg):
        if theta_deg <= float(edge):
            return i + 1
    return 0


def _angle_deg(p_i: np.ndarray, p_j: np.ndarray, p_k: np.ndarray) -> float:
    v1 = p_i - p_j
    v2 = p_k - p_j
    n1 = float(np.linalg.norm(v1))
    n2 = float(np.linalg.norm(v2))
    if n1 < 1e-12 or n2 < 1e-12:
        return 0.0
    cosang = float(np.dot(v1, v2) / (n1 * n2))
    cosang = max(-1.0, min(1.0, cosang))
    return float(np.degrees(np.arccos(cosang)))


def _dihedral_angle_deg(p0: np.ndarray, p1: np.ndarray, p2: np.ndarray, p3: np.ndarray) -> float:
    b0 = p1 - p0
    b1 = p2 - p1
    b2 = p3 - p2
    b1_norm = np.linalg.norm(b1)
    if b1_norm < 1e-12:
        return 0.0
    b1u = b1 / b1_norm

    v = b0 - np.dot(b0, b1u) * b1u
    w = b2 - np.dot(b2, b1u) * b1u
    v_norm = np.linalg.norm(v)
    w_norm = np.linalg.norm(w)
    if v_norm < 1e-12 or w_norm < 1e-12:
        return 0.0

    v /= v_norm
    w /= w_norm
    x = np.dot(v, w)
    y = np.dot(np.cross(b1u, v), w)
    return float(np.degrees(np.arctan2(y, x)))


def build_3d_graph(
        g: Graph2D,
        *,
        angle_bins_deg: Sequence[float] = (60.0, 120.0, 150.0, 180.0, 360.0),
        torsion_bins_deg: Sequence[float] = (60.0, 120.0, 150.0, 180.0),
        require_pos: bool = True,
) -> Graph3D:
    """
    Constructs the 3D Graph (x = angles, edges = torsions) based on the manuscript API.
    """
    if require_pos and g.pos is None:
        raise ValueError("Graph2D.pos is required for 3D torsion calculation.")

    pos = g.pos
    cov_ei = g.covalent_edge_index
    E = cov_ei.shape[1] if cov_ei is not None else 0

    n_angle_bins = len(angle_bins_deg)
    n_torsion_bins = len(torsion_bins_deg)

    if E == 0:
        return Graph3D(
            x=np.zeros((0, n_angle_bins), dtype=np.float32),
            torsion_index=np.zeros((4, 0), dtype=np.int64),
            torsion_attr=np.zeros((0, n_torsion_bins), dtype=np.float32),
            meta={"note": "empty covalent edges"}
        )

    # 1. Build adjacency list for fast O(N) neighbor lookup
    N = int(g.x.shape[0])
    adj_out = {u: [] for u in range(N)}
    src, dst = cov_ei[0], cov_ei[1]

    # Store undirected edges to avoid duplicate torsion processing over the same central bond
    undirected_bonds = set()
    for e_idx in range(E):
        u, v = int(src[e_idx]), int(dst[e_idx])
        adj_out[u].append(v)
        undirected_bonds.add((min(u, v), max(u, v)))

    # 2. Extract Bond-Angle Features (Output 'x')
    angle_features = []
    for e1 in range(E):
        i, s = int(src[e1]), int(dst[e1])
        for j in adj_out[s]:
            if j != i:
                theta = _angle_deg(pos[i], pos[s], pos[j])
                bin_id = _bin_angle(theta, angle_bins_deg)
                if bin_id > 0:
                    angle_features.append(_one_hot_bin(bin_id, n_angle_bins))

    if not angle_features:
        x_matrix = np.zeros((0, n_angle_bins), dtype=np.float32)
    else:
        x_matrix = np.stack(angle_features, axis=0).astype(np.float32)

    # 3. Extract Torsions (Output 'torsion_index' and 'torsion_attr')
    quads = []
    torsion_attrs = []

    # Iterate over unique central bonds (s-j)
    for s, j in undirected_bonds:
        neighbors_s = [i for i in adj_out[s] if i != j]
        neighbors_j = [t for t in adj_out[j] if t != s]

        for i in neighbors_s:
            for t in neighbors_j:
                if i == t:  # Degenerate ring case
                    continue

                phi = _dihedral_angle_deg(pos[i], pos[s], pos[j], pos[t])
                bin_id = _bin_angle(abs(phi), torsion_bins_deg)

                if bin_id > 0:
                    quads.append((i, s, j, t))
                    torsion_attrs.append(_one_hot_bin(bin_id, n_torsion_bins))

    if not quads:
        t_index = np.zeros((4, 0), dtype=np.int64)
        t_attr = np.zeros((0, n_torsion_bins), dtype=np.float32)
    else:
        t_index = np.array(quads, dtype=np.int64).T
        t_attr = np.stack(torsion_attrs, axis=0).astype(np.float32)

    return Graph3D(
        x=x_matrix,
        torsion_index=t_index,
        torsion_attr=t_attr,
        meta={"angle_bins": tuple(float(b) for b in angle_bins_deg),
              "torsion_bins": tuple(float(b) for b in torsion_bins_deg)}
    )