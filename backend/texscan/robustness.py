"""Synthetic image degradations for robustness sweeps (image in, image out)."""

from collections.abc import Callable
from typing import Any

import cv2
import numpy as np
from skimage.metrics import structural_similarity

from texscan.pipeline import PipelineConfig, run_pipeline
from texscan.pipeline.load import resize_longest
from texscan.pipeline.types import Image


def add_gaussian_noise(image: Image, sigma: float, seed: int = 0) -> Image:
    """I' = clip(I + N(0, sigma^2)): sensor noise with standard deviation sigma gray levels."""
    noise = np.random.default_rng(seed).normal(0, sigma, image.shape)
    return np.clip(image.astype(np.float32) + noise, 0, 255).astype(np.uint8)


def blur(image: Image, sigma: float) -> Image:
    """I' = G_sigma * I: defocus / motion softening; sigma 0 returns the image unchanged."""
    return image.copy() if sigma <= 0 else cv2.GaussianBlur(image, (0, 0), sigma)


def shift_brightness(image: Image, delta: float) -> Image:
    """I' = clip(I + delta): uniform exposure change of delta gray levels."""
    return np.clip(image.astype(np.float32) + delta, 0, 255).astype(np.uint8)


def jpeg_compress(image: Image, quality: float) -> Image:
    """Round-trip through JPEG at the given quality (1-100): blocking and ringing artifacts."""
    ok, buf = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, int(quality)])
    if not ok:
        raise ValueError("JPEG encoding failed")
    return cv2.imdecode(buf, cv2.IMREAD_UNCHANGED)


# name -> (function, parameter name, default levels)
DEGRADATIONS: dict[str, tuple[Callable[[Image, float], Image], str, list[float]]] = {
    "gaussian_noise": (add_gaussian_noise, "sigma", [0, 5, 10, 20, 40]),
    "blur": (blur, "sigma", [0, 1, 2, 3, 5]),
    "brightness": (shift_brightness, "delta", [-60, -30, 0, 30, 60]),
    "jpeg_quality": (jpeg_compress, "quality", [100, 80, 60, 40, 20, 10]),
}


PSNR_CAP = 100.0  # identical images have infinite PSNR; cap so it stays a finite JSON number


def psnr(reference: Image, test: Image) -> float:
    """PSNR = 10 log10(255^2 / MSE) in dB: higher is closer to the reference (capped at 100 dB)."""
    mse = float(np.mean((reference.astype(np.float64) - test.astype(np.float64)) ** 2))
    return PSNR_CAP if mse == 0 else min(PSNR_CAP, 10 * float(np.log10(255.0**2 / mse)))


def ssim_luma(reference: Image, test: Image) -> float:
    """Structural similarity of the luminance channels, in [-1, 1]; 1 means identical structure."""
    a = reference if reference.ndim == 2 else cv2.cvtColor(reference, cv2.COLOR_BGR2GRAY)
    b = test if test.ndim == 2 else cv2.cvtColor(test, cv2.COLOR_BGR2GRAY)
    return float(structural_similarity(a, b, data_range=255))


def jpeg_bytes(image: Image, quality: float) -> int:
    """Size in bytes of the image JPEG-encoded at the given quality."""
    ok, buf = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, int(quality)])
    if not ok:
        raise ValueError("JPEG encoding failed")
    return int(buf.size)


def sweep(
    image: Image, config: PipelineConfig, kind: str, levels: list[float], reference: Image | None = None
) -> list[dict[str, Any]]:
    """Degrade the (normalized-size) image at each level; record the verdict, defect area and image-quality loss.

    Every point also carries the degraded image (key "image") and its PSNR / SSIM against the undegraded one;
    JPEG points add the encoded file size.
    """
    function = DEGRADATIONS[kind][0]
    base = resize_longest(image, config.max_side)
    points = []
    for level in levels:
        degraded = function(base, level)
        result = run_pipeline(degraded, config, reference)
        points.append(
            {
                "level": level,
                "decision": result.decision,
                "defect_count": len(result.defects),
                "defect_area_percent": result.defect_area_percent,
                "psnr": psnr(base, degraded),
                "ssim": ssim_luma(base, degraded),
                "file_bytes": jpeg_bytes(base, level) if kind == "jpeg_quality" else None,
                "image": degraded,
            }
        )
    return points
