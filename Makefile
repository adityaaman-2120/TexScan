# Requires GNU make. On Windows run from Git Bash / WSL (or `choco install make`).
ifeq ($(OS),Windows_NT)
  VENV_BIN := backend/.venv/Scripts
else
  VENV_BIN := backend/.venv/bin
endif
PY := $(VENV_BIN)/python

.PHONY: setup dev dev-lan backend frontend test eval eval-demo api-types

setup:
	python3.11 -m venv backend/.venv || py -3.11 -m venv backend/.venv
	$(PY) -m pip install -e "backend[dev]"
	cd frontend && npm install

backend:
	cd backend && ../$(PY) -m uvicorn texscan.main:app --reload --port 8000

frontend:
	cd frontend && npm run dev

dev:
	$(MAKE) -j2 backend frontend

# same, but the frontend is served over HTTPS on the local network so a phone camera works (see README)
dev-lan:
	$(MAKE) -j2 backend frontend-lan

frontend-lan:
	cd frontend && npm run dev:lan

test:
	cd backend && ../$(PY) -m pytest

eval:
	cd backend && ../$(PY) -m texscan.eval

# smoke test of the harness on a generated toy dataset (NOT a benchmark)
eval-demo:
	cd backend && ../$(PY) -m texscan.eval --synthetic

# regenerate the typed frontend API client from the FastAPI OpenAPI schema
api-types:
	cd backend && ../$(PY) scripts/export_openapi.py
	cd frontend && npm run gen:api
