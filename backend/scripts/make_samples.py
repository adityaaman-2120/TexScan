"""Generate the synthetic sample images used by the Inspect page gallery (frontend/public/samples/).

These are SYNTHETIC textures with planted defects, not photographs. Run from backend/:
    python scripts/make_samples.py
"""

import sys
from pathlib import Path

import cv2
import numpy as np
from scipy.ndimage import gaussian_filter

from texscan.imageio import write_image

SIZE = 512
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 and __name__ == "__main__" else Path(__file__).resolve().parents[2] / "frontend" / "public" / "samples"


def weave(seed: int, kind: str = "sinusoid", noise: float = 2.5) -> np.ndarray:
    y, x = np.mgrid[0:SIZE, 0:SIZE] / SIZE
    if kind == "sinusoid":
        wave = np.sin(2 * np.pi * 32 * x)
    else:  # plaid
        wave = (np.sin(2 * np.pi * 32 * x) + np.sin(2 * np.pi * 32 * y)) / 2
    return 128 + 50 * wave + np.random.default_rng(seed).normal(0, noise, (SIZE, SIZE))


def uneven_cloth(seed: int) -> np.ndarray:
    """Noisy weave with a lighting gradient: closer to what a cheap camera sees."""
    y, x = np.mgrid[0:SIZE, 0:SIZE] / SIZE
    base = 128 + 40 * np.sin(2 * np.pi * 32 * x) + 18 * (x - 0.5) + 10 * np.sin(2 * np.pi * 2 * y)
    return base + np.random.default_rng(seed).normal(0, 6, (SIZE, SIZE))


def leather(seed: int) -> np.ndarray:
    """Stochastic, non-periodic grain."""
    grain = gaussian_filter(np.random.default_rng(seed).normal(0, 1, (SIZE, SIZE)), 3)
    return 128 + 28 * grain / grain.std() * 0.6 + np.random.default_rng(seed + 1).normal(0, 2, (SIZE, SIZE))


def disc(img: np.ndarray, center: tuple[int, int], radius: int, value: float) -> np.ndarray:
    yy, xx = np.ogrid[:SIZE, :SIZE]
    out = img.copy()
    out[(yy - center[0]) ** 2 + (xx - center[1]) ** 2 <= radius**2] = value
    return out


def blotch(img: np.ndarray, center: tuple[int, int], radius: int, delta: float, seed: int) -> np.ndarray:
    """Irregular stain: a smoothed-noise-warped disc that lightens the surface."""
    yy, xx = np.mgrid[:SIZE, :SIZE]
    wobble = gaussian_filter(np.random.default_rng(seed).normal(0, 1, (SIZE, SIZE)), 9) * radius * 3.2
    inside = np.hypot(yy - center[0], xx - center[1]) + wobble < radius
    out = img.copy()
    out[inside] += delta
    return out


def scratch(img: np.ndarray, p0: tuple[int, int], p1: tuple[int, int], width: int, value: int) -> np.ndarray:
    canvas = np.clip(img, 0, 255).astype(np.uint8).copy()
    cv2.line(canvas, p0, p1, int(value), width, cv2.LINE_AA)
    return canvas


def save_mask(name: str, mask: np.ndarray) -> None:
    """Ground truth for the Method Arena: white where the planted defect is."""
    OUT.mkdir(parents=True, exist_ok=True)
    write_image(OUT / f"{name}.mask.png", cv2.cvtColor((mask * 255).astype(np.uint8), cv2.COLOR_GRAY2BGR))


def disc_mask(center: tuple[int, int], radius: int) -> np.ndarray:
    yy, xx = np.ogrid[:SIZE, :SIZE]
    return (yy - center[0]) ** 2 + (xx - center[1]) ** 2 <= radius**2


def line_mask(p0: tuple[int, int], p1: tuple[int, int], width: int) -> np.ndarray:
    canvas = np.zeros((SIZE, SIZE), np.uint8)
    cv2.line(canvas, p0, p1, 1, width, cv2.LINE_8)
    return canvas > 0


def blotch_mask(center: tuple[int, int], radius: int, seed: int) -> np.ndarray:
    yy, xx = np.mgrid[:SIZE, :SIZE]
    wobble = gaussian_filter(np.random.default_rng(seed).normal(0, 1, (SIZE, SIZE)), 9) * radius * 3.2
    return np.hypot(yy - center[0], xx - center[1]) + wobble < radius


def save(name: str, image: np.ndarray) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    gray = np.clip(image, 0, 255).astype(np.uint8)
    write_image(OUT / f"{name}.png", cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR))
    print("wrote", OUT / f"{name}.png")


if __name__ == "__main__":
    empty = np.zeros((SIZE, SIZE), bool)
    save("weave-clean", weave(1))
    save_mask("weave-clean", empty)
    save("weave-hole", disc(weave(2), (330, 170), 18, 40))
    save_mask("weave-hole", disc_mask((330, 170), 18))
    save("weave-scratch", scratch(weave(3), (120, 260), (400, 300), 4, 232))
    save_mask("weave-scratch", line_mask((120, 260), (400, 300), 4))
    save("plaid-clean", weave(4, "plaid"))
    save_mask("plaid-clean", empty)
    save("plaid-stain", blotch(weave(5, "plaid"), (250, 340), 38, 48, seed=11))
    save_mask("plaid-stain", blotch_mask((250, 340), 38, seed=11))
    save("cloth-tear", scratch(uneven_cloth(6), (150, 130), (330, 380), 9, 25))
    save_mask("cloth-tear", line_mask((150, 130), (330, 380), 9))
    save("leather-hole", disc(leather(7), (260, 300), 22, 45))
    save_mask("leather-hole", disc_mask((260, 300), 22))
    # known-good references (same material, fresh noise) for the golden-template method
    save("ref-weave", weave(90))
    save("ref-plaid", weave(91, "plaid"))
    save("ref-cloth", uneven_cloth(92))
    save("ref-leather", leather(93))
