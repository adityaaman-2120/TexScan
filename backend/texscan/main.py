from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from texscan.api import register
from texscan.db import init_db


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    init_db()
    yield


app = FastAPI(title="TexScan", lifespan=lifespan)
register(app)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
