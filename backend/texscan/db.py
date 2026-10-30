import os
from collections.abc import Iterator
from pathlib import Path

from sqlalchemy.engine import Engine
from sqlmodel import Session, SQLModel, create_engine

REPO_ROOT = Path(__file__).resolve().parents[2]


def default_url() -> str:
    """SQLite file at data/texscan.db (override with TEXSCAN_DB), independent of the working directory."""
    path = Path(os.environ.get("TEXSCAN_DB") or REPO_ROOT / "data" / "texscan.db")
    path.parent.mkdir(parents=True, exist_ok=True)
    return f"sqlite:///{path}"


def make_engine(url: str) -> Engine:
    return create_engine(url, connect_args={"check_same_thread": False})


engine = make_engine(default_url())


def init_db(target: Engine | None = None) -> None:
    from texscan import models  # noqa: F401  (registers the tables)

    SQLModel.metadata.create_all(target or engine)


def get_session() -> Iterator[Session]:
    with Session(engine) as session:
        yield session
