import numpy as np
import pytest

from texscan.pipeline.types import Image

SIZE = 256


def make_texture(kind: str = "sinusoid", size: int = SIZE, seed: int = 0, cycles: int = 16) -> Image:
    """Periodic texture with integer cycle counts (no spectral leakage) plus mild noise."""
    y, x = np.mgrid[0:size, 0:size] / size
    if kind == "sinusoid":
        wave = np.sin(2 * np.pi * cycles * x)
    else:  # plaid / grid: two orthogonal sinusoids
        wave = (np.sin(2 * np.pi * cycles * x) + np.sin(2 * np.pi * cycles * y)) / 2
    noise = np.random.default_rng(seed).normal(0, 2, (size, size))
    return np.clip(128 + 50 * wave + noise, 0, 255).astype(np.uint8)


def add_scratch(
    image: Image, row: int = 128, x0: int = 60, x1: int = 190, value: int = 230, width: int = 2
) -> Image:
    out = image.copy()
    out[row : row + width, x0:x1] = value
    return out


def add_blob(image: Image, center: tuple[int, int] = (60, 200), radius: int = 10, value: int = 40) -> Image:
    out = image.copy()
    yy, xx = np.ogrid[: out.shape[0], : out.shape[1]]
    out[(yy - center[0]) ** 2 + (xx - center[1]) ** 2 <= radius**2] = value
    return out


@pytest.fixture(params=["sinusoid", "grid"])
def clean_texture(request: pytest.FixtureRequest) -> Image:
    return make_texture(request.param)


@pytest.fixture(params=["sinusoid", "grid"])
def texture_and_reference(request: pytest.FixtureRequest) -> tuple[Image, Image]:
    """A clean texture and a different good sample (new noise) of the same texture."""
    return make_texture(request.param), make_texture(request.param, seed=9)


def make_noisy_material(seed: int, size: int = 256, noise: float = 7.0) -> Image:
    """Periodic cloth with sensor noise and an uneven lighting gradient: defaults raise false alarms on it."""
    y, x = np.mgrid[0:size, 0:size] / size
    base = 128 + 40 * np.sin(2 * np.pi * 16 * x) + 18 * (x - 0.5) + 10 * np.sin(2 * np.pi * 2 * y)
    return np.clip(base + np.random.default_rng(seed).normal(0, noise, (size, size)), 0, 255).astype(np.uint8)
