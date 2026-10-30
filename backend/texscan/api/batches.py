"""In-memory batch jobs. Results are persisted as normal inspections; only the progress state is volatile."""

import threading
import uuid
from dataclasses import dataclass, field
from typing import Any

from sqlmodel import Session

from texscan import db
from texscan.api.service import store_inspection
from texscan.pipeline import PipelineConfig
from texscan.pipeline.types import Image

MAX_KEPT = 100
_batches: dict[str, "Batch"] = {}
_registry_lock = threading.Lock()


@dataclass
class Batch:
    id: str
    total: int
    events: list[dict[str, Any]] = field(default_factory=list)
    inspection_ids: list[int] = field(default_factory=list)
    errors: list[dict[str, str]] = field(default_factory=list)
    done: int = 0
    complete: bool = False
    lock: threading.Lock = field(default_factory=threading.Lock)

    def emit(self, event: dict[str, Any]) -> None:
        with self.lock:
            self.events.append(event)

    def events_since(self, index: int) -> list[dict[str, Any]]:
        with self.lock:
            return self.events[index:]


def get_batch(batch_id: str) -> Batch | None:
    return _batches.get(batch_id)


def _process(batch: Batch, items: list[tuple[str, Image]], config: PipelineConfig, profile_id: int | None, reference: Image | None) -> None:
    passed = 0
    for name, image in items:
        event: dict[str, Any] = {"type": "progress", "filename": name, "total": batch.total}
        try:
            with Session(db.engine) as session:
                row = store_inspection(session, image, name, config, profile_id, reference, batch.id)
            batch.inspection_ids.append(row.id)  # type: ignore[arg-type]
            passed += row.decision == "PASS"
            event.update(inspection_id=row.id, decision=row.decision, defect_count=row.defect_count)
        except Exception as exc:  # noqa: BLE001 - reported to the client, never kills the batch
            batch.errors.append({"filename": name, "reason": f"{type(exc).__name__}: {exc}"})
            event.update(error=str(exc))
        batch.done += 1
        event["done"] = batch.done
        batch.emit(event)
    batch.complete = True
    batch.emit({
        "type": "complete", "total": batch.total, "done": batch.done, "passed": passed,
        "failed": len(batch.inspection_ids) - passed, "errors": len(batch.errors),
    })  # fmt: skip


def start_batch(
    items: list[tuple[str, Image]], config: PipelineConfig, profile_id: int | None, reference: Image | None
) -> Batch:
    batch = Batch(id=uuid.uuid4().hex, total=len(items))
    with _registry_lock:
        _batches[batch.id] = batch
        for old in list(_batches)[:-MAX_KEPT]:
            del _batches[old]
    threading.Thread(target=_process, args=(batch, items, config, profile_id, reference), daemon=True).start()
    return batch
