# unimolrep/rep2d/graph_2_5d.py
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, Sequence, Tuple

import numpy as np

from .graph import Graph2D


@dataclass
class Angle2p5D:
    """
    2.5D Bond-Angle representation aligning with legacy manuscript definitions.

    Attributes:
      x: (E, D_e) Node feature matrix containing original 2D covalent bond features.
      angle_index: (3, T) Edge list defined as atomic triplets (i, s, j), where s is the center.
      angle_bin: (T, C) Edge features of the 2.5D graph (one-hot binned angles).
      meta: Dictionary storing structural metadata.
    """
    x: np.ndarray
    angle_index: np.ndarray
    angle_bin: np.ndarray
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


def attach_angles(
        g: Graph2D,
        *,
        bins_deg: Sequence[float] = (60.0, 120.0, 150.0, 180.0, 360.0),
        require_pos: bool = True,
) -> Angle2p5D:
    """
    Extracts 2.5D angles mapped to original bond features.
    """
    if require_pos and g.pos is None:
        raise ValueError("Graph2D.pos is required for angle calculation.")

    cov_ei = g.covalent_edge_index
    cov_ea = g.covalent_edge_attr
    E = cov_ei.shape[1] if cov_ei is not None else 0
    n_bins = len(bins_deg)

    if E == 0:
        return Angle2p5D(
            x=np.zeros((0, cov_ea.shape[1] if cov_ea is not None else 1), dtype=np.float32),
            angle_index=np.zeros((3, 0), dtype=np.int64),
            angle_bin=np.zeros((0, n_bins), dtype=np.float32),
            meta={"bins_deg": tuple(float(x) for x in bins_deg)}
        )

    # Output 1: Node feature matrix x (bond features)
    x = cov_ea.copy()

    N = int(g.x.shape[0])
    adj_out = {u: [] for u in range(N)}

    src = cov_ei[0]
    dst = cov_ei[1]

    for e_idx in range(E):
        u, v = int(src[e_idx]), int(dst[e_idx])
        adj_out[u].append(v)

    pos = g.pos
    triplets = []
    attr_rows = []

    for e1 in range(E):
        i, s = int(src[e1]), int(dst[e1])  # 's' is the center atom in user's definition

        for j in adj_out[s]:
            if j == i:
                continue

            theta = _angle_deg(pos[i], pos[s], pos[j]) if pos is not None else 0.0
            bin_id = _bin_angle(theta, bins_deg)

            if bin_id > 0:
                triplets.append((i, s, j))
                attr_rows.append(_one_hot_bin(bin_id, n_bins))

    if len(triplets) == 0:
        angle_index = np.zeros((3, 0), dtype=np.int64)
        angle_bin = np.zeros((0, n_bins), dtype=np.float32)
    else:
        # Output 2: Edge list angle_index (i-s-j triplets)
        angle_index = np.array(triplets, dtype=np.int64).T
        # Output 3: Edge features angle_bin
        angle_bin = np.stack(attr_rows, axis=0).astype(np.float32)

    return Angle2p5D(
        x=x,
        angle_index=angle_index,
        angle_bin=angle_bin,
        meta={"source": "AngleTriplets", "bins_deg": tuple(float(x) for x in bins_deg)}
    )