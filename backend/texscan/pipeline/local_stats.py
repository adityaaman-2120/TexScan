import cv2
import numpy as np

from texscan.pipeline.stats import robust_zscore
from texscan.pipeline.types import FloatImage, Image


def local_mean_var(gray: Image, window: int = 31) -> tuple[FloatImage, FloatImage]:
    """mu = box_w(I) and var = box_w(I^2) - mu^2 over a w x w sliding window (two box filters)."""
    img = gray.astype(np.float32)
    mean = cv2.boxFilter(img, -1, (window, window), borderType=cv2.BORDER_REFLECT)
    mean_sq = cv2.boxFilter(img * img, -1, (window, window), borderType=cv2.BORDER_REFLECT)
    return mean, np.maximum(mean_sq - mean * mean, 0).astype(np.float32)


def local_stats_score(mean: FloatImage, var: FloatImage, rel_floor: float = 0.05) -> FloatImage:
    """score = max(|robust z of mean|, |robust z of log(1 + var)|): how far a window sits from the global distribution."""
    return np.maximum(
        np.abs(robust_zscore(mean, rel_floor)), np.abs(robust_zscore(np.log1p(var), rel_floor))
    ).astype(np.float32)
