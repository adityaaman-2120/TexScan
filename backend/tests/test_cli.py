import json
from pathlib import Path

import cv2

from tests.conftest import add_blob, make_texture
from texscan.cli import main


def test_cli_inspect_saves_stages_and_summary(tmp_path: Path, capsys) -> None:  # type: ignore[no-untyped-def]
    src = tmp_path / "fabric.png"
    cv2.imwrite(str(src), add_blob(make_texture()))
    out = tmp_path / "out"

    assert main(["inspect", str(src), "--out", str(out)]) == 0

    assert "FAIL" in capsys.readouterr().out
    pngs = sorted(p.name for p in out.glob("*.png"))
    assert len(pngs) == 13 and pngs[0] == "00_original.png" and pngs[-1] == "12_overlay.png"
    summary = json.loads((out / "result.json").read_text())
    assert summary["decision"] == "FAIL" and summary["defects"]
