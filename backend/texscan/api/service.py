"""Run the pipeline and persist / serialize inspections."""

import json
from collections import Counter

from sqlmodel import Session

from texscan.api import storage
from texscan.api.schemas import InspectionMetrics, InspectionOut, InspectionSummary
from texscan.models import Inspection
from texscan.pipeline import PipelineConfig, PipelineResult, run_pipeline
from texscan.pipeline.types import Defect, Image


def store_inspection(
    session: Session,
    image: Image,
    filename: str,
    config: PipelineConfig,
    profile_id: int | None = None,
    reference: Image | None = None,
    batch_id: str | None = None,
) -> Inspection:
    """Run the pipeline, write all images to disk, insert the row. Files and row are both rolled back on failure."""
    result = run_pipeline(image, config, reference)
    return store_result(session, image, filename, config, profile_id, result, batch_id)


def store_result(
    session: Session,
    image: Image,
    filename: str,
    config: PipelineConfig,
    profile_id: int | None,
    result: PipelineResult,
    batch_id: str | None = None,
) -> Inspection:
    """Persist an already computed pipeline result (for callers that also need the result itself)."""
    height, width = result.stages["gray"].shape
    row = Inspection(
        filename=filename,
        method=config.method,
        profile_id=profile_id,
        decision=result.decision,
        defect_count=len(result.defects),
        defect_area_percent=result.defect_area_percent,
        width=width,
        height=height,
        config_json=config.model_dump_json(),
        defects_json=json.dumps([d.model_dump() for d in result.defects]),
        timings_json=json.dumps(result.timings_ms),
        histograms_json=json.dumps({k: v.tolist() for k, v in result.histograms.items()}),
        type_counts_json=json.dumps(Counter(d.defect_type or "unknown" for d in result.defects)),
        batch_id=batch_id,
    )
    session.add(row)
    session.flush()  # assigns the id used as the folder name
    assert row.id is not None
    try:
        row.stages_json = json.dumps(storage.save_images(row.id, image, result.stages))
        session.commit()
    except Exception:
        session.rollback()
        if row.id is not None:
            storage.delete_images(row.id)
        raise
    session.refresh(row)
    return row


def inspection_out(row: Inspection) -> InspectionOut:
    assert row.id is not None
    defects = [Defect.model_validate(d) for d in json.loads(row.defects_json)]
    timings = json.loads(row.timings_json)
    return InspectionOut(
        id=row.id,
        created_at=row.created_at,
        filename=row.filename,
        method=row.method,
        profile_id=row.profile_id,
        batch_id=row.batch_id,
        decision=row.decision,  # type: ignore[arg-type]
        defects=defects,
        metrics=InspectionMetrics(
            defect_count=row.defect_count,
            defect_area_percent=row.defect_area_percent,
            largest_defect_area=max((d.area for d in defects), default=0),
            total_ms=sum(timings.values()),
            image_width=row.width,
            image_height=row.height,
        ),
        timings_ms=timings,
        stage_urls={name: storage.file_url(row.id, name) for name in json.loads(row.stages_json)},
        histograms=json.loads(row.histograms_json),
        config=PipelineConfig.model_validate_json(row.config_json),
    )


def inspection_summary(row: Inspection) -> InspectionSummary:
    assert row.id is not None
    has_overlay = "overlay" in json.loads(row.stages_json)
    return InspectionSummary(
        id=row.id,
        created_at=row.created_at,
        filename=row.filename,
        method=row.method,
        profile_id=row.profile_id,
        batch_id=row.batch_id,
        decision=row.decision,  # type: ignore[arg-type]
        defect_count=row.defect_count,
        defect_area_percent=row.defect_area_percent,
        thumbnail_url=storage.file_url(row.id, "overlay") if has_overlay else None,
    )
