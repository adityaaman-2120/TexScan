"""A profile's minimum defect size keeps its share of the picture when it is run at another working size."""

import json
from typing import Any

import pytest
from fastapi.testclient import TestClient

from tests.test_api import autotune, client, inspect  # noqa: F401  (client is a fixture)
from tests.conftest import make_noisy_material


def profile(client: TestClient) -> dict[str, Any]:
    res = autotune(client, "Scaled")
    assert res.status_code == 201, res.text
    return res.json()  # type: ignore[no-any-return]


def used_config(client: TestClient, pid: int, config: dict[str, Any]) -> dict[str, Any]:
    res = inspect(client, make_noisy_material(3), profile_id=str(pid), config=json.dumps(config))
    assert res.status_code == 201, res.text
    return res.json()["config"]  # type: ignore[no-any-return]


def test_min_area_scales_with_the_square_of_the_working_size(client: TestClient) -> None:
    p = profile(client)
    area, side = p["config"]["morphology"]["min_area"], p["config"]["max_side"]
    assert used_config(client, p["id"], {})["morphology"]["min_area"] == area  # same size: untouched
    assert used_config(client, p["id"], {"max_side": side * 2})["morphology"]["min_area"] == area * 4
    smaller = used_config(client, p["id"], {"max_side": side // 2})["morphology"]["min_area"]
    assert smaller == max(1, round(area / 4))


def test_an_explicit_min_area_is_respected(client: TestClient) -> None:
    p = profile(client)
    cfg = used_config(client, p["id"], {"max_side": p["config"]["max_side"] * 2, "morphology": {"min_area": 77}})
    assert cfg["morphology"]["min_area"] == 77


def test_without_a_profile_nothing_is_scaled(client: TestClient) -> None:
    res = inspect(client, make_noisy_material(3), config=json.dumps({"max_side": 128}))
    assert res.status_code == 201
    assert res.json()["config"]["morphology"]["min_area"] == 50  # the default, whatever the size


@pytest.mark.parametrize("bad", ['{"max_side": "big"}', '{"max_side": true}'])
def test_a_junk_size_is_rejected_by_validation_not_by_the_scaling(client: TestClient, bad: str) -> None:
    p = profile(client)
    res = inspect(client, make_noisy_material(3), profile_id=str(p["id"]), config=bad)
    assert res.status_code == 422
