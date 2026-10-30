from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel

from texscan.pipeline import PipelineConfig
from texscan.pipeline.types import Defect
from texscan.tuning import TuneReport

Decision = Literal["PASS", "FAIL"]


class InspectionMetrics(BaseModel):
    defect_count: int
    defect_area_percent: float
    largest_defect_area: int
    total_ms: float
    image_width: int  # normalized (working) resolution
    image_height: int


class InspectionOut(BaseModel):
    id: int
    created_at: datetime
    filename: str
    method: str
    profile_id: int | None
    batch_id: str | None
    decision: Decision
    defects: list[Defect]
    metrics: InspectionMetrics
    timings_ms: dict[str, float]
    stage_urls: dict[str, str]  # stage name -> /files/<id>/<name>.png (includes "upload", the original file)
    histograms: dict[str, list[int]]
    config: PipelineConfig


class BitPlane(BaseModel):
    bit: int  # 0 = least significant .. 7 = most significant
    label: str
    ones_percent: float  # share of pixels where this bit is set
    image: str  # PNG data URI, 0 / 255


class BitPlanesOut(BaseModel):
    inspection_id: int
    width: int
    height: int
    planes: list[BitPlane]  # most significant first


class InspectionSummary(BaseModel):
    id: int
    created_at: datetime
    filename: str
    method: str
    profile_id: int | None
    batch_id: str | None = None
    decision: Decision
    defect_count: int
    defect_area_percent: float
    thumbnail_url: str | None


class InspectionPage(BaseModel):
    items: list[InspectionSummary]
    total: int
    limit: int
    offset: int


class RejectedFile(BaseModel):
    filename: str
    reason: str


class BatchAccepted(BaseModel):
    batch_id: str
    total: int
    rejected: list[RejectedFile]
    ws_url: str


class BatchStatus(BaseModel):
    batch_id: str
    status: Literal["running", "complete"]
    total: int
    done: int
    inspection_ids: list[int]
    errors: list[RejectedFile]


class ProfileOut(BaseModel):
    id: int
    name: str
    method: str
    config: PipelineConfig
    report: TuneReport
    created_at: datetime
    updated_at: datetime


class Peak(BaseModel):
    row: int
    col: int
    x: int  # = col
    y: int  # = row


class SpectrumOut(BaseModel):
    width: int
    height: int
    spectrum: str  # PNG data URI, log-magnitude 0-255, DC at the center
    spectrum_peaks: str  # same with the detected peaks circled
    peaks: list[Peak]


class SpectrumApplyOut(BaseModel):
    decision: Decision
    defects: list[Defect]
    defect_area_percent: float
    residual: str  # PNG data URI
    mask: str  # PNG data URI, final binary defect mask
    overlay: str  # JPEG data URI


class ArenaMethodResult(BaseModel):
    method: str
    status: Literal["ok", "skipped", "error"]
    message: str | None = None
    decision: Decision | None = None
    defects: list[Defect] = []
    defect_area_percent: float | None = None
    total_ms: float | None = None
    overlay: str | None = None  # JPEG data URI
    mask: str | None = None  # PNG data URI
    iou: float | None = None  # only with a ground-truth mask
    dice: float | None = None
    precision: float | None = None  # pixel level; None when nothing was predicted
    recall: float | None = None  # pixel level; None when the ground truth is empty
    f1: float | None = None  # pixel F1, which is identical to Dice
    correct: bool | None = None  # image-level verdict matches "ground truth has any defect pixels"


class ArenaOut(BaseModel):
    ground_truth_provided: bool
    ground_truth_defective: bool | None
    results: list[ArenaMethodResult]


class RobustnessPoint(BaseModel):
    level: float
    decision: Decision
    defect_count: int
    defect_area_percent: float
    psnr: float | None = None  # dB against the undegraded image (capped at 100)
    ssim: float | None = None  # luminance SSIM against the undegraded image
    file_bytes: int | None = None  # JPEG size at this quality (jpeg_quality sweeps only)
    thumbnail: str | None = None  # small JPEG data URI of the degraded image


class RobustnessOut(BaseModel):
    method: str
    raw_bytes: int  # uncompressed size of the working image (height x width x channels)
    original_thumbnail: str  # small JPEG data URI of the undegraded image
    series: dict[str, list[RobustnessPoint]]  # degradation -> points
    parameters: dict[str, str]  # degradation -> what `level` means


class DayCount(BaseModel):
    date: date
    total: int
    passed: int
    failed: int


class ProfileStat(BaseModel):
    profile_id: int | None  # None = inspections run with the default settings
    name: str
    total: int
    passed: int
    pass_rate: float


class StatsOut(BaseModel):
    total: int
    passed: int
    failed: int
    pass_rate: float | None
    defects_by_type: dict[str, int]
    inspections_per_day: list[DayCount]
    avg_processing_ms: float | None = None  # mean total pipeline time per inspection
    by_profile: list[ProfileStat] = []


# --- datasets / benchmark --------------------------------------------------------------------------------
class MvtecCategory(BaseModel):
    name: str
    test_images: int
    defect_types: dict[str, int]  # test sub-folder -> image count ("good" included)
    has_masks: bool


class MvtecStatus(BaseModel):
    available: bool
    message: str | None = None
    categories: list[MvtecCategory] = []


class MvtecSample(BaseModel):
    category: str
    defect_type: str
    name: str  # file name inside test/<defect_type>/
    has_mask: bool


class CategoryMetrics(BaseModel):
    """Metrics of one method on one category, as written by `python -m texscan.eval`."""

    accuracy: float
    precision: float
    recall: float
    f1: float
    tp: int
    fp: int
    tn: int
    fn: int
    pixel_iou: float | None = None
    pixel_dice: float | None = None
    n_images: int
    n_defective: int
    errors: list[str] = []
    seconds_per_image: float


class BenchmarkMeta(BaseModel):
    dataset: str | None = None
    max_side: int | None = None
    limit: int | None = None
    synthetic: bool | None = None


class BenchmarkOut(BaseModel):
    source: Literal["mvtec", "synthetic"]
    available: bool
    message: str | None = None
    generated_at: datetime | None = None  # modification time of the metrics file
    meta: BenchmarkMeta | None = None
    results: dict[str, dict[str, CategoryMetrics]] = {}  # method -> category -> metrics
