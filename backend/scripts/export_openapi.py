"""Write the FastAPI OpenAPI schema to a JSON file (default: frontend/openapi.json) for client generation."""

import json
import sys
from pathlib import Path

from texscan.main import app

target = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[2] / "frontend" / "openapi.json"
target.write_text(json.dumps(app.openapi(), indent=2), encoding="utf-8")
print(f"wrote {target}")
