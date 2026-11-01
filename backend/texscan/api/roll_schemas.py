"""Request and response models of the roll endpoints."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from texscan.api.schemas import RejectedFile
from texscan.grading import DEFAULT_LIMIT, Along, HoleRule

RollStatus = Literal["open", "complete"]


class RollIn(BaseModel):
    code: str = Field(min_length=1, max_length=60, description="Roll ID as printed on the roll")
    supplier: str = Field("", max_length=120)
    fabric: str = Field("", max_length=120, description="Fabric type")
    profile_id: int = Field(description="A size-calibrated profile for this fabric")
    width_mm: float = Field(gt=0, le=10_000, description="Cuttable width between selvages")
    length_m: float = Field(gt=0, le=100_000)
    limit: float = Field(DEFAULT_LIMIT, gt=0, le=1000, description="Accept when points per 100 sq yd are at or below this")
    hole_rule: HoleRule = "tiered"
    along: Along = "vertical"
    inspector: str = Field("", max_length=120)
    notes: str = Field("", max_length=2000)


class RollPatch(BaseModel):
    supplier: str | None = Field(None, max_length=120)
    fabric: str | None = Field(None, max_length=120)
    width_mm: float | None = Field(None, gt=0, le=10_000)
    length_m: float | None = Field(None, gt=0, le=100_000)
    limit: float | None = Field(None, gt=0, le=1000)
    hole_rule: HoleRule | None = None
    along: Along | None = None
    inspector: str | None = Field(None, max_length=120)
    notes: str | None = Field(None, max_length=2000)
    status: RollStatus | None = None


class RollCaptureOut(BaseModel):
    id: int
    inspection_id: int
    filename: str
    decision: Literal["PASS", "FAIL"]
    defect_count: int
    position_m: float
    start_m: float
    covered_m: float
    thumbnail_url: str | None
    overlay_url: str | None
    created_at: datetime


class RollDefectOut(BaseModel):
    capture_id: int
    inspection_id: int
    defect_id: int
    defect_type: str
    position_m: float
    position_yd: float
    start_m: float
    end_m: float
    length_mm: float
    length_in: float
    width_mm: float
    width_in: float
    area_mm2: float
    points: int
    is_hole: bool
    continuous: bool


class YardPoints(BaseModel):
    yard: int
    from_m: float
    to_m: float
    raw: int
    points: int  # after the 4 per yard cap


class RollSummary(BaseModel):
    total_points: int
    raw_points: int
    points_per_100_sq_yd: float
    limit: float
    accepted: bool
    grade: str
    provisional: bool  # the roll is still open
    length_inspected_m: float
    length_inspected_yd: float
    coverage_percent: float
    defect_count: int
    capture_count: int
    ungraded_defects: int
    yards: list[YardPoints]
    warnings: list[str]


class RollOut(BaseModel):
    id: int
    code: str
    supplier: str
    fabric: str
    profile_id: int | None
    profile_name: str | None
    width_mm: float
    width_in: float
    length_m: float
    length_yd: float
    limit: float
    hole_rule: HoleRule
    along: Along
    status: RollStatus
    inspector: str
    notes: str
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None
    summary: RollSummary
    captures: list[RollCaptureOut]
    defects: list[RollDefectOut]


class RollListItem(BaseModel):
    id: int
    code: str
    supplier: str
    fabric: str
    profile_name: str | None
    width_mm: float
    length_m: float
    status: RollStatus
    created_at: datetime
    completed_at: datetime | None
    capture_count: int
    defect_count: int
    total_points: int
    points_per_100_sq_yd: float
    limit: float
    accepted: bool
    grade: str
    provisional: bool


class CaptureResult(BaseModel):
    roll: RollOut
    added: int
    rejected: list[RejectedFile]


class TypeCount(BaseModel):
    defect_type: str
    count: int


class SupplierStat(BaseModel):
    supplier: str
    rolls: int
    accepted: int
    avg_points_per_100_sq_yd: float
    defects: int
    top_defect_types: list[TypeCount]


class RollStats(BaseModel):
    rolls_inspected: int  # completed rolls
    rolls_open: int
    accepted: int
    rejected: int
    acceptance_rate: float | None
    avg_points_per_100_sq_yd: float | None
    suppliers: list[SupplierStat]
