import numpy as np

from texscan.pipeline.types import FloatImage, Image


def robust_zscore(values: np.ndarray, rel_floor: float = 0.05) -> FloatImage:
    """z = (x - median) / (1.4826 * MAD), the outlier-resistant analogue of (x - mean) / std.

    The scale is floored at rel_floor * |median| so near-uniform maps do not amplify noise.
    """
    median = float(np.median(values))
    mad = float(np.median(np.abs(values - median)))
    scale = max(1.4826 * mad, rel_floor * abs(median), 1e-6)
    return ((values - median) / scale).astype(np.float32)


def flag_outliers(score: FloatImage, k: float = 4.0, border: int = 0) -> Image:
    """mask = score > k (score is |robust z|, so this is median + k * MAD); border pixels cleared."""
    mask = np.where(score > k, 255, 0).astype(np.uint8)
    if border > 0:
        mask[:border], mask[-border:] = 0, 0
        mask[:, :border], mask[:, -border:] = 0, 0
    return mask
