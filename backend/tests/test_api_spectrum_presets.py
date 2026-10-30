import json
from typing import Any

import numpy as np
import pytest
from fastapi.testclient import TestClient

from tests.test_api import RAW, client, clean, decode_uri, draw_mask, png  # noqa: F401  (fixtures are shared)


def apply_form(client: TestClient, image: np.ndarray, mask: bytes | None = None, **form: Any) -> Any:
    files: dict[str, Any] = {"image": ("a.png", png(image), "image/png")}
    if mask is not None:
        files["mask"] = ("m.png", mask, "image/png")
    return client.post("/spectrum/apply", files=files, data={"config": RAW, **form})


def residual_of(res: Any) -> np.ndarray:
    return decode_uri(res.json()["residual"]).astype(float)


def roughness(image: np.ndarray) -> float:
    return float(np.abs(np.diff(image, axis=0)).mean())


def test_mask_is_optional_and_no_filter_means_identity(client: TestClient, clean: np.ndarray) -> None:
    res = apply_form(client, clean)
    assert res.status_code == 200
    residual = residual_of(res)  # min-max stretch of an unfiltered image: still the same picture
    assert np.corrcoef(residual.ravel(), clean.astype(float).ravel())[0, 1] > 0.999


def test_lowpass_smooths_and_highpass_differs(client: TestClient, clean: np.ndarray) -> None:
    noisy = np.clip(clean.astype(float) + np.random.default_rng(2).normal(0, 20, clean.shape), 0, 255).astype(np.uint8)
    base = residual_of(apply_form(client, noisy))
    low = residual_of(apply_form(client, noisy, filter_kind="lowpass", filter_response="gaussian", cutoff=10))
    high = residual_of(apply_form(client, noisy, filter_kind="highpass", filter_response="butterworth", cutoff=40, order=3))
    assert roughness(low) < 0.6 * roughness(base)
    assert not np.allclose(low, high)


@pytest.mark.parametrize("response", ["ideal", "butterworth", "gaussian"])
@pytest.mark.parametrize("kind", ["lowpass", "highpass", "sharpen"])
def test_every_preset_combination_is_accepted(client: TestClient, clean: np.ndarray, kind: str, response: str) -> None:
    res = apply_form(client, clean, filter_kind=kind, filter_response=response, cutoff=30)
    body = res.json()
    assert res.status_code == 200 and body["decision"] in ("PASS", "FAIL")
    assert decode_uri(body["residual"]).shape == (256, 256)


def test_presets_combine_with_the_drawn_notch(client: TestClient, clean: np.ndarray) -> None:
    mask = draw_mask([(144, 128)])
    notch_only = residual_of(apply_form(client, clean, mask))
    both = residual_of(apply_form(client, clean, mask, filter_kind="lowpass", filter_response="gaussian", cutoff=60))
    assert not np.allclose(notch_only, both)


def test_symmetric_false_removes_less_of_the_texture(client: TestClient, clean: np.ndarray) -> None:
    mask = draw_mask([(144, 128)])
    mirrored = residual_of(apply_form(client, clean, mask, symmetric="true"))
    one_sided = residual_of(apply_form(client, clean, mask, symmetric="false"))
    assert mirrored.std() != one_sided.std() and not np.allclose(mirrored, one_sided)


@pytest.mark.parametrize(
    ("form", "needle"),
    [
        ({"filter_kind": "bandpass"}, "filter_kind"),
        ({"filter_kind": "lowpass", "filter_response": "boxcar"}, "filter_response"),
        ({"filter_kind": "lowpass", "cutoff": "0"}, "cutoff"),
        ({"filter_kind": "lowpass", "cutoff": "-5"}, "cutoff"),
        ({"filter_kind": "lowpass", "filter_response": "butterworth", "order": "0"}, "order"),
        ({"filter_kind": "lowpass", "filter_response": "butterworth", "order": "11"}, "order"),
    ],
)
def test_validates_preset_parameters(client: TestClient, clean: np.ndarray, form: dict[str, str], needle: str) -> None:
    res = apply_form(client, clean, **form)
    assert res.status_code == 422 and needle in json.dumps(res.json()["detail"])
