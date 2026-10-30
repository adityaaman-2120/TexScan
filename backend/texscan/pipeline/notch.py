from typing import Literal

import cv2
import numpy as np
from scipy import fft as sfft

from texscan.pipeline.types import FloatImage, Image, Peaks


def _with_symmetric(peaks: Peaks, shape: tuple[int, int]) -> list[tuple[int, int]]:
    cy, cx = shape[0] // 2, shape[1] // 2
    pairs = [(int(r), int(c)) for r, c in peaks]
    return pairs + [(2 * cy - r, 2 * cx - c) for r, c in pairs]


def notch_mask(shape: tuple[int, int], peaks: Peaks, sigma: float = 3.0) -> FloatImage:
    """H(u, v) = prod_k (1 - exp(-d_k^2 / (2 sigma^2))) over each peak and its mirror (-u, -v).

    Real images have conjugate-symmetric spectra, so rejecting both keeps the output real.
    """
    h, w = shape
    mask = np.ones(shape, dtype=np.float32)
    reach = int(np.ceil(4 * sigma))
    for py, px in _with_symmetric(peaks, shape):
        y0, y1 = max(py - reach, 0), min(py + reach + 1, h)
        x0, x1 = max(px - reach, 0), min(px + reach + 1, w)
        if y0 >= y1 or x0 >= x1:
            continue
        yy, xx = np.mgrid[y0:y1, x0:x1]
        gauss = np.exp(-((yy - py) ** 2 + (xx - px) ** 2) / (2 * sigma**2))
        mask[y0:y1, x0:x1] *= (1 - gauss).astype(np.float32)
    return mask


def apply_frequency_mask(gray: Image, mask: FloatImage) -> FloatImage:
    """g = IFFT2(ifftshift(fftshift(FFT2(f)) * H)) for any real, centrally symmetric filter H in [0, 1]."""
    freq = sfft.fftshift(sfft.fft2(gray.astype(np.float32)))
    return sfft.ifft2(sfft.ifftshift(freq * mask)).real.astype(np.float32)


def notch_filter(gray: Image, peaks: Peaks, sigma: float = 3.0) -> tuple[FloatImage, FloatImage]:
    """g = IFFT2(ifftshift(F * H)): periodic components removed, non-periodic defects remain.

    Returns (filtered image as float, notch mask H in [0, 1]).
    """
    mask = notch_mask(gray.shape, peaks, sigma)
    return apply_frequency_mask(gray, mask), mask


def symmetrize_mask(mask: FloatImage) -> FloatImage:
    """Union of a spectrum mask and its point reflection (u, v) -> (-u, -v) about the DC bin.

    A real image has a conjugate-symmetric spectrum, so a filter must be symmetric to keep the output real.
    """
    h, w = mask.shape
    rows = (2 * (h // 2) - np.arange(h)) % h
    cols = (2 * (w // 2) - np.arange(w)) % w
    return np.maximum(mask, mask[np.ix_(rows, cols)])


def mask_to_filter(drawn: Image, feather: float = 2.0, symmetric: bool = True) -> FloatImage:
    """H = 1 - max(R, G_feather * R) with R = symmetrize(drawn > 127): a user-drawn reject region, softened outward.

    Taking the max with the blur keeps the drawn area fully rejected while the edge fades (less ringing).
    With symmetric=False only the drawn side is rejected; the real part of the output then sees half the effect.
    """
    reject = (drawn > 127).astype(np.float32)
    if symmetric:
        reject = symmetrize_mask(reject)
    if feather > 0:
        reject = np.maximum(reject, cv2.GaussianBlur(reject, (0, 0), feather))
    return (1.0 - reject).astype(np.float32)


FilterKind = Literal["lowpass", "highpass", "sharpen"]
FilterResponse = Literal["ideal", "butterworth", "gaussian"]


def _lowpass_gain(distance: np.ndarray, response: FilterResponse, cutoff: float, order: int) -> np.ndarray:
    if response == "ideal":
        return (distance <= cutoff).astype(np.float32)
    if response == "butterworth":
        return (1.0 / (1.0 + (distance / cutoff) ** (2 * order))).astype(np.float32)
    return np.exp(-(distance**2) / (2 * cutoff**2)).astype(np.float32)


def radial_filter(
    shape: tuple[int, int],
    kind: FilterKind,
    response: FilterResponse,
    cutoff: float,
    order: int = 2,
    boost: float = 1.5,
) -> FloatImage:
    """With D the distance from the DC bin: low-pass H = 1[D <= D0] (ideal), 1/(1+(D/D0)^2n) (Butterworth) or exp(-D^2/2D0^2) (Gaussian).

    High-pass is 1 - H_lowpass (keeps edges, drops the average); sharpen is 1 + boost * H_highpass (edges added back).
    Returns the centred gain map (same layout as the shifted spectrum), ready for apply_frequency_mask.
    """
    if cutoff <= 0:
        raise ValueError("cutoff must be positive")
    h, w = shape
    yy, xx = np.ogrid[:h, :w]
    distance = np.hypot(yy - h // 2, xx - w // 2)
    low = _lowpass_gain(distance, response, cutoff, order)
    if kind == "lowpass":
        return low
    high = 1.0 - low
    return high if kind == "highpass" else (1.0 + boost * high).astype(np.float32)
