# Lab syllabus mapping

Where each Image Processing lab syllabus item is implemented in TexScan: the exact file and function, where the
result can be seen in the app, and which test covers it. The app itself does not mention the syllabus; this file is
the only place that maps it.

All pipeline code is in [`backend/texscan/pipeline/`](../backend/texscan/pipeline). Every function there is pure
(NumPy in, NumPy out) and has a docstring with the math. Classical image processing only; no deep learning.

Pages marked *(Engineering)* appear after turning on **Engineering mode** in Settings.

| # | Syllabus item | File and function | See it in the app | Test |
|---|---|---|---|---|
| 1 | Reading an image | [`texscan/imageio.py`](../backend/texscan/imageio.py) `read_image` (files), [`texscan/api/common.py`](../backend/texscan/api/common.py) `decode_bytes` (uploads); [`pipeline/load.py`](../backend/texscan/pipeline/load.py) `to_gray`, `resize_longest`, `load_and_normalize` | Inspect: add a photo | `tests/test_pipeline_steps.py`, `tests/test_api.py` |
| 2 | Noise | [`texscan/robustness.py`](../backend/texscan/robustness.py) `add_gaussian_noise`; removal in [`pipeline/denoise.py`](../backend/texscan/pipeline/denoise.py) `denoise` | Robustness Lab *(Engineering)*: noise sweep | `tests/test_notch_ui_and_robustness.py`, `tests/test_pipeline_steps.py` |
| 3 | Histogram | [`pipeline/enhance.py`](../backend/texscan/pipeline/enhance.py) `histogram` | Inspect *(Engineering)*: Histogram card | `tests/test_pipeline_steps.py`, `tests/test_api_pages.py` |
| 4 | Edge detection | [`pipeline/overlay.py`](../backend/texscan/pipeline/overlay.py) `edges_overlay` (Canny of the defect mask) | Inspect *(Engineering)*: overlay type Edges | `tests/test_pipeline_steps.py` |
| 5 | Rotation and translation (registration) | [`pipeline/template.py`](../backend/texscan/pipeline/template.py) `align_template` (ORB keypoints, RANSAC homography), `abs_difference`; used by `detect_template` in [`pipeline/detectors.py`](../backend/texscan/pipeline/detectors.py) | Method Arena *(Engineering)* with a reference image; Pipeline X-Ray *(Engineering)*, "Aligned reference" stage | `tests/test_methods.py` |
| 6 | Bit planes | [`pipeline/bitplanes.py`](../backend/texscan/pipeline/bitplanes.py) `bit_planes`; endpoint `GET /inspections/{id}/bit-planes` in [`texscan/api/routers/inspections.py`](../backend/texscan/api/routers/inspections.py) | Bit-Plane viewer *(Engineering)* | `tests/test_pipeline_steps.py`, `tests/test_api.py` |
| 7 | Image enhancement | [`pipeline/enhance.py`](../backend/texscan/pipeline/enhance.py) `enhance` (histogram equalization, CLAHE) | Pipeline X-Ray *(Engineering)*, "Contrast enhanced" stage | `tests/test_pipeline_steps.py`, `tests/test_pipeline_e2e.py` |
| 8 | Fourier transform | [`pipeline/spectrum.py`](../backend/texscan/pipeline/spectrum.py) `fft_spectrum`, `magnitude_spectrum`, `detect_periodic_peaks`, `mark_peaks`; detector `detect_fft` in [`pipeline/detectors.py`](../backend/texscan/pipeline/detectors.py) | Spectrum Studio *(Engineering)* | `tests/test_pipeline_steps.py`, `tests/test_api.py` |
| 9 | Spatial smoothing and sharpening | Smoothing: [`pipeline/denoise.py`](../backend/texscan/pipeline/denoise.py) `denoise` (Gaussian and median); local window statistics: [`pipeline/local_stats.py`](../backend/texscan/pipeline/local_stats.py) `local_mean_var`, `local_stats_score`. **No spatial sharpening filter** (unsharp mask, Laplacian); sharpening is done in the frequency domain, row 10 | Inspect *(Engineering)*: Advanced panel, "Denoise kernel" | `tests/test_pipeline_steps.py`, `tests/test_methods.py` |
| 10 | Frequency-domain smoothing and sharpening | [`pipeline/notch.py`](../backend/texscan/pipeline/notch.py) `radial_filter` (ideal, Butterworth and Gaussian low-pass, high-pass and sharpen), `apply_frequency_mask`; browser preview in [`frontend/src/features/spectrum/filters.ts`](../frontend/src/features/spectrum/filters.ts) `radialGain` | Spectrum Studio *(Engineering)*: low-pass and high-pass presets | `tests/test_radial_filter.py`, `frontend/src/features/spectrum/filters.test.ts` |
| 11 | Image compression | [`texscan/robustness.py`](../backend/texscan/robustness.py) `jpeg_compress`, `jpeg_bytes`, `psnr`, `ssim_luma`, `sweep` | Robustness Lab *(Engineering)*: JPEG quality sweep | `tests/test_notch_ui_and_robustness.py`, `tests/test_research_pages.py` |
| 12 | Morphology | [`pipeline/segment.py`](../backend/texscan/pipeline/segment.py) `morphology_cleanup` (opening, closing, elliptical element), `remove_small_components` (8-connected components), `residual_to_mask` (Otsu / adaptive threshold) | Pipeline X-Ray *(Engineering)*, "Raw defect mask" and "Cleaned mask" stages | `tests/test_pipeline_steps.py` |
| 13 | Image restoration | [`pipeline/notch.py`](../backend/texscan/pipeline/notch.py) `notch_mask`, `notch_filter`, `symmetrize_mask`, `mask_to_filter`. Removes a known periodic pattern; **no deblurring or inverse filtering** | Spectrum Studio *(Engineering)*: draw a notch and see the residual | `tests/test_pipeline_steps.py`, `tests/test_notch_ui_and_robustness.py` |
| 14 | Colour image processing | [`pipeline/colour.py`](../backend/texscan/pipeline/colour.py) `colour_deviation` (BGR to Lab, distance from the local cloth colour with a lightness weight), `colour_mask`, `colour_cutoff` | Inspect *(Engineering)*: the "Colour mask" stage and the "Colour threshold" slider | `tests/test_colour.py`, `tests/test_tuning.py` |

## Not on the syllabus list, but part of the same pipeline

| Topic | File and function |
|---|---|
| Texture analysis with oriented filters | [`pipeline/gabor.py`](../backend/texscan/pipeline/gabor.py) `gabor_bank`, `gabor_energy_maps`, `gabor_score` |
| Robust outlier scoring | [`pipeline/stats.py`](../backend/texscan/pipeline/stats.py) `robust_zscore`, `flag_outliers` |
| Region properties and defect types | [`pipeline/defects.py`](../backend/texscan/pipeline/defects.py) `extract_defects`; [`pipeline/classify.py`](../backend/texscan/pipeline/classify.py) `classify_defect` |
| PASS / FAIL rule | [`pipeline/runner.py`](../backend/texscan/pipeline/runner.py) `decide`; whole pipeline: `run_pipeline` |
| Real-world size from a marker or ruler | [`pipeline/measure.py`](../backend/texscan/pipeline/measure.py) `detect_markers` (ArUco), `scale_from_marker`, `scale_from_points`, `min_area_rect_size`, `mm_per_working_pixel`, `with_physical_size`; printable marker in [`report/marker.py`](../backend/texscan/report/marker.py) `marker_pdf` |
| Four-point roll grading (points, per-yard cap, points per 100 sq yd) | [`texscan/grading.py`](../backend/texscan/grading.py) `defect_points`, `yard_tallies`, `points_per_100_sq_yd`, `grade_roll`; rules in [`docs/GRADING.md`](GRADING.md) |
| Trimming black bars, centre crop | [`pipeline/borders.py`](../backend/texscan/pipeline/borders.py) `content_box`, `trim_borders`, `center_crop` |
| Profiles from good samples | [`texscan/tuning.py`](../backend/texscan/tuning.py) `auto_tune` |

## How the pieces connect

`run_pipeline` in [`pipeline/runner.py`](../backend/texscan/pipeline/runner.py) runs: load and normalize, denoise,
enhance, one of four detectors (`detect_fft`, `detect_gabor`, `detect_template`, `detect_local_stats` in
[`pipeline/detectors.py`](../backend/texscan/pipeline/detectors.py)), threshold, morphology, connected components,
classification, PASS / FAIL, then the Canny overlay. Each stage image is stored, which is what Pipeline X-Ray
*(Engineering)* shows.
