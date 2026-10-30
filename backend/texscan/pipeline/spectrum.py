import cv2
import numpy as np
from scipy import fft as sfft
from scipy.ndimage import maximum_filter

from texscan.pipeline.types import ComplexImage, FloatImage, Image, Peaks
from texscan.pipeline.utils import to_uint8


def magnitude_spectrum(freq: ComplexImage) -> FloatImage:
    """Log-magnitude L(u, v) = log(1 + |F(u, v)|); the log tames the huge dynamic range."""
    return np.log1p(np.abs(freq)).astype(np.float32)


def fft_spectrum(gray: Image, window: bool = True) -> tuple[Image, ComplexImage]:
    """F = fftshift(FFT2((f - mean) * hann)) puts zero frequency at the center.

    The Hann window suppresses edge-leakage streaks. Returns (log spectrum 0-255, F).
    """
    f = gray.astype(np.float32) - float(gray.mean())
    if window:
        f *= np.outer(np.hanning(f.shape[0]), np.hanning(f.shape[1])).astype(np.float32)
    freq = sfft.fftshift(sfft.fft2(f)).astype(np.complex64)
    return to_uint8(magnitude_spectrum(freq)), freq


def _dc_region(shape: tuple[int, int], radius: float) -> np.ndarray:
    yy, xx = np.ogrid[: shape[0], : shape[1]]
    return (yy - shape[0] // 2) ** 2 + (xx - shape[1] // 2) ** 2 <= radius**2


def detect_periodic_peaks(
    spectrum: np.ndarray,
    dc_radius: float = 10,
    threshold_sigma: float = 5.0,
    neighborhood: int = 9,
    max_peaks: int = 32,
) -> Peaks:
    """A peak is a local maximum of the spectrum above mean + k * std (outside the DC disk).

    Strong narrow peaks are the signature of a periodic texture. Returns (row, col), strongest first.
    """
    spec = spectrum.astype(np.float32)
    valid = ~_dc_region(spec.shape, dc_radius)
    threshold = spec[valid].mean() + threshold_sigma * spec[valid].std()
    candidates = (spec == maximum_filter(spec, size=neighborhood)) & valid & (spec > threshold)
    coords = np.argwhere(candidates)
    order = np.argsort(-spec[candidates])[:max_peaks]
    return coords[order].astype(np.int64)


def mark_peaks(spectrum: Image, peaks: Peaks, radius: int = 6) -> Image:
    """Draw a red circle at each (row, col) peak on the spectrum (BGR output, for display)."""
    out = cv2.cvtColor(spectrum, cv2.COLOR_GRAY2BGR)
    for row, col in peaks:
        cv2.circle(out, (int(col), int(row)), radius, (0, 0, 255), 1)
    return out
