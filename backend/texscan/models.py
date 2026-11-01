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


class Roll(SQLModel, table=True):
    """A roll of fabric inspected as a sequence of captures and graded with the four-point system."""

    id: int | None = Field(default=None, primary_key=True)
    code: str = Field(index=True, unique=True)  # the roll ID printed on the roll
    supplier: str = Field(default="", index=True)
    fabric: str = ""  # fabric type, e.g. "Cotton twill 3/1"
    profile_id: int | None = Field(default=None, index=True)  # must be size-calibrated; no FK so deleting a profile keeps the roll
    width_mm: float  # cuttable width between selvages
    length_m: float
    limit: float = 40.0  # accepted when points per 100 sq yd <= limit
    hole_rule: str = "tiered"  # tiered | any_four
    along: str = "vertical"  # which picture axis runs along the roll
    status: str = Field(default="open", index=True)  # open | complete
    inspector: str = ""
    notes: str = ""
    created_at: datetime = Field(default_factory=_now, index=True)
    updated_at: datetime = Field(default_factory=_now)
    completed_at: datetime | None = None


class RollCapture(SQLModel, table=True):
    """One picture of a roll: an inspection plus where on the roll it was taken."""

    id: int | None = Field(default=None, primary_key=True)
    roll_id: int = Field(index=True)
    inspection_id: int = Field(index=True)
    position_m: float  # the metre mark entered for the picture (its top edge)
    start_m: float  # where the inspected region starts (differs from position_m when the picture was cropped)
    covered_m: float  # length of roll the inspected region covers
    created_at: datetime = Field(default_factory=_now)
