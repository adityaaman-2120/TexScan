from typing import Literal

from pydantic import BaseModel, Field

from texscan.pipeline.denoise import DenoiseMethod
from texscan.pipeline.enhance import EnhanceMethod
from texscan.pipeline.segment import ThresholdMethod


Method = Literal["fft", "gabor", "golden_template", "local_statistics"]


class DenoiseConfig(BaseModel):
    method: DenoiseMethod = "median"
    ksize: int = Field(5, ge=1)


class EnhanceConfig(BaseModel):
    method: EnhanceMethod = "clahe"
    clip_limit: float = Field(2.0, gt=0)
    tile_grid: int = Field(8, ge=1)


class PeakConfig(BaseModel):
    dc_radius: float = Field(10, ge=0)
    threshold_sigma: float = Field(5.0, gt=0)
    neighborhood: int = Field(9, ge=1)
    max_peaks: int = Field(32, ge=1)


class NotchConfig(BaseModel):
    sigma: float = Field(3.0, gt=0)


class ThresholdConfig(BaseModel):
    method: ThresholdMethod = "otsu"
    sigma: float = Field(2.0, ge=0)
    min_threshold: float = Field(12.0, ge=0)
    block_size: int = Field(51, ge=3)
    offset: float = 8.0
    border: int = Field(8, ge=0)


class MorphConfig(BaseModel):
    kernel_size: int = Field(3, ge=1)
    min_area: int = Field(50, ge=1)


class GaborConfig(BaseModel):
    orientations: int = Field(4, ge=1)
    wavelengths: tuple[float, ...] = (4.0, 8.0, 16.0)
    smooth_sigma: float = Field(4.0, ge=0)
    k: float = Field(10.0, gt=0)  # flag energy beyond median + k * MAD (high: heavy-tailed noise channels)
    rel_floor: float = Field(0.05, ge=0)


class TemplateConfig(BaseModel):
    max_features: int = Field(2000, ge=10)
    ransac_threshold: float = Field(3.0, gt=0)
    min_inliers: int = Field(15, ge=4)


class LocalStatsConfig(BaseModel):
    window: int = Field(31, ge=3)
    k: float = Field(4.0, gt=0)
    rel_floor: float = Field(0.05, ge=0)


class PipelineConfig(BaseModel):
    """FAIL when defect count > max_defects or defect area % > max_area_percent.

    method picks the detector: fft | gabor | golden_template | local_statistics.
    """

    method: Method = "fft"
    max_side: int = Field(1024, ge=16)
    gabor: GaborConfig = GaborConfig()
    template: TemplateConfig = TemplateConfig()
    local_stats: LocalStatsConfig = LocalStatsConfig()
    denoise: DenoiseConfig = DenoiseConfig()
    enhance: EnhanceConfig = EnhanceConfig()
    peaks: PeakConfig = PeakConfig()
    notch: NotchConfig = NotchConfig()
    threshold: ThresholdConfig = ThresholdConfig()
    morphology: MorphConfig = MorphConfig()
    max_defects: int = Field(0, ge=0)
    max_area_percent: float = Field(0.0, ge=0)
