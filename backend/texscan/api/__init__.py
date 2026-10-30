"""REST + WebSocket API. `register(app)` wires routers and CORS onto a FastAPI app."""

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from texscan.api.routers import analysis, benchmark, datasets, files, inspect, inspections, live, profiles, reports, stats

DEFAULT_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173"  # Vite dev server


def register(app: FastAPI) -> None:
    origins = os.environ.get("TEXSCAN_CORS_ORIGINS", DEFAULT_ORIGINS).split(",")
    app.add_middleware(CORSMiddleware, allow_origins=[o.strip() for o in origins], allow_methods=["*"], allow_headers=["*"])
    for module in (inspect, inspections, profiles, analysis, stats, files, live, datasets, benchmark, reports):
        app.include_router(module.router)
