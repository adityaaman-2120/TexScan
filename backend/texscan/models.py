from datetime import datetime, timezone

from sqlmodel import Field, SQLModel


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Profile(SQLModel, table=True):
    """A named, tuned pipeline configuration for one material (e.g. 'Denim', 'Ceramic tile')."""

    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(index=True, unique=True)
    method: str
    config_json: str  # a PipelineConfig serialized as JSON
    report_json: str  # the TuneReport that produced it
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)


class Inspection(SQLModel, table=True):
    """One pipeline run. Stage images live on disk under data/inspections/<id>/."""

    id: int | None = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=_now, index=True)
    filename: str
    method: str
    profile_id: int | None = Field(default=None, index=True)  # no FK: deleting a profile keeps its history
    decision: str = Field(index=True)
    defect_count: int
    defect_area_percent: float
    width: int  # size of the normalized image
    height: int
    config_json: str
    defects_json: str
    timings_json: str
    histograms_json: str
    type_counts_json: str  # {"hole": 2, ...} so /stats never has to parse defects
    stages_json: str = "[]"  # names of the PNG files saved on disk
    batch_id: str | None = Field(default=None, index=True)
