import cv2
import numpy as np
from scipy.ndimage import gaussian_filter

from texscan.pipeline.stats import robust_zscore
from texscan.pipeline.types import FloatImage, Image

KernelPair = tuple[np.ndarray, np.ndarray]


def _gabor_pair(wavelength: float, theta: float) -> KernelPair:
    sigma = 0.56 * wavelength
    ksize = max(9, int(6 * sigma) | 1)
    even = cv2.getGaborKernel((ksize, ksize), sigma, theta, wavelength, 0.5, 0)
    odd = cv2.getGaborKernel((ksize, ksize), sigma, theta, wavelength, 0.5, np.pi / 2)
    return (even - even.mean()).astype(np.float32), odd.astype(np.float32)


def gabor_bank(orientations: int = 4, wavelengths: tuple[float, ...] = (4, 8, 16)) -> list[KernelPair]:
    """g(x, y) = exp(-(x'^2 + 0.25 y'^2) / 2 sigma^2) * cos(2 pi x' / lambda + psi), x' rotated by theta.

    One (even, odd) quadrature pair per orientation (k * pi / n) and wavelength; the even kernel is zero-mean.
    """
    thetas = [np.pi * k / orientations for k in range(orientations)]
    return [_gabor_pair(lam, theta) for lam in wavelengths for theta in thetas]


def gabor_energy_maps(
    gray: Image,
    orientations: int = 4,
    wavelengths: tuple[float, ...] = (4, 8, 16),
    smooth_sigma: float = 4.0,
) -> FloatImage:
    """Local energy E = G_s * sqrt((I * even)^2 + (I * odd)^2) per filter; returns (n_filters, H, W).

    Quadrature pairs make E independent of phase, so it tracks texture strength at that scale/direction.
    """
    img = gray.astype(np.float32) - float(gray.mean())
    maps = [
        _energy_at_scale(img, wavelength, orientations, smooth_sigma) for wavelength in wavelengths
    ]
    return np.concatenate(maps).astype(np.float32)


def _energy_at_scale(img: np.ndarray, wavelength: float, orientations: int, smooth_sigma: float) -> np.ndarray:
    """Long wavelengths are filtered on a downscaled copy (factor = wavelength // 8) for speed, then upsampled."""
    factor = max(1, int(wavelength // 8))
    h, w = img.shape
    small = img if factor == 1 else cv2.resize(img, (w // factor, h // factor), interpolation=cv2.INTER_AREA)
    maps = []
    for even, odd in gabor_bank(orientations, (wavelength / factor,)):
        re = cv2.filter2D(small, cv2.CV_32F, even, borderType=cv2.BORDER_REFLECT)
        im = cv2.filter2D(small, cv2.CV_32F, odd, borderType=cv2.BORDER_REFLECT)
        energy = gaussian_filter(np.sqrt(re * re + im * im), smooth_sigma / factor)
        maps.append(energy if factor == 1 else cv2.resize(energy, (w, h), interpolation=cv2.INTER_LINEAR))
    return np.stack(maps)


def gabor_score(energy_maps: FloatImage, rel_floor: float = 0.05) -> FloatImage:
    """score = max over filters of |robust z of E_f|: large where any channel's energy leaves median +- k MAD."""
    return np.max([np.abs(robust_zscore(m, rel_floor)) for m in energy_maps], axis=0).astype(np.float32)
