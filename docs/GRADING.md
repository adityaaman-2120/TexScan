# Fabric roll grading: the four-point system

Roll Inspection scores a roll with the **four-point system** (ASTM D5430). This page lists every rule and formula the code
uses, so you can check them against your copy of the standard or against a buyer's specification.
The code is [`backend/texscan/grading.py`](../backend/texscan/grading.py); its header comment repeats these rules.

> **How these rules were obtained.** ASTM D5430 is paywalled and I could not read its text. The rules below are
> reconstructed from published descriptions of the four-point system (links at the end). They agree on the length tiers,
> the per-yard cap and the points formula. They **disagree on holes**, and the 40-point limit is a trade convention, not
> part of the standard. Those two are settings, not hard-coded. Please check the table in section 6 against the standard.

## 1. Points for one defect

The size of a defect is its **longest dimension**, measured in whichever direction it runs (along the roll or across it).
In TexScan that is the longest side of the defect's minimum-area rotated rectangle, converted to inches with the
profile's size calibration (so a roll can only be graded with a calibrated profile).

| Longest dimension of the defect | Points |
|---|---|
| 3 inches or less | 1 |
| over 3 inches, up to 6 inches | 2 |
| over 6 inches, up to 9 inches | 3 |
| over 9 inches | 4 |

The boundaries belong to the smaller class: exactly 3.0 in is 1 point, exactly 6.0 in is 2, exactly 9.0 in is 3.

### Holes and openings

A hole is scored by its largest dimension, with a rule chosen per roll (setting `hole_rule`):

| `hole_rule` | Rule | Default |
|---|---|---|
| `tiered` | 1 inch or less: **2** points; over 1 inch: **4** points | yes |
| `any_four` | any hole or opening: **4** points | |

Sources differ here (section 6), so both are offered. A defect counts as a hole when TexScan's rule-based classifier
labels it `hole` (a dark, compact, solid region). The classifier is a heuristic and can mislabel; the label is shown in
the defect list so it can be checked.

## 2. At most 4 points per linear yard

No linear yard of fabric is charged more than **4 points**, however many defects it contains (ten 1-point defects in one
yard still score 4).

* Yards are counted from the start of the roll: yard 0 is 0 to 1 yd (0 to 0.9144 m), yard 1 is 1 to 2 yd, and so on.
* A defect belongs to the yard that contains its **centre** along the roll.
* **Continuous defects.** A defect that runs along the roll for **more than one yard** (a streak, a running line) is
  charged **4 points in every yard it runs through**. This is my reading of the usual wording "continuous defects score
  4 points per linear yard"; the standard's exact wording should be checked.

`total points = sum over yards of min(4, points of the defects in that yard)`

## 3. Points per 100 square yards

```
points per 100 sq yd  =  total points x 36 x 100 / (length inspected in yards x width in inches)
                      =  total points x 3600   / (length inspected in yards x width in inches)
```

* **Width** is the **cuttable width** between selvages, in inches. A wrong width shifts every score.
* **Length inspected** is the roll length once the roll is marked complete; while it is open, it is the furthest point
  covered by the captures so far.
* Worked example: a roll 120 yd long and 46 in wide with 24 total points scores 24 x 3600 / (120 x 46) = **15.65**
  points per 100 sq yd.

## 4. Acceptance

* The roll is **accepted** when `points per 100 sq yd <= limit`, and **rejected** above it.
* The limit is set per roll. The default is **40**, the usual benchmark for fabric. Buyers set their own (for example
  25 to 30 for premium work), so it is a setting.
* **Boundary.** Sources are split on exactly 40 ("up to 40 is acceptable" against "40 or above is rejected"). TexScan
  accepts exactly the limit.
* **Grade.** The standard defines no letter grades. TexScan's grade is the verdict against the limit:
  **First quality** (accepted) or **Off quality** (rejected).

## 5. Conventions used by the app

| Topic | Convention |
|---|---|
| Units | 1 yd = 0.9144 m exactly. 1 in = 25.4 mm exactly. Roll length is entered in metres or yards, width in cm, mm or inches. |
| Position of a capture | The metre mark at the **top edge** of the picture, counted from the start of the roll. |
| Position of a defect | Capture position + the distance from the top edge to the defect's centre, using the profile's mm-per-pixel. This assumes the roll runs along the picture's vertical axis; a roll can be set to run along the horizontal axis instead. |
| Overlap | Captures should not overlap. The app warns when they do (a defect seen twice would be scored twice) and when there are gaps. |
| Uncalibrated defects | Cannot be scored. A capture is refused when the roll's profile has no size calibration. |
| Accuracy | Sizes come from the calibrated measurement (see the README, "Real-world sizes"). Defects near a tier boundary can fall either side by the measurement error. |

## 6. What to verify against the standard

| # | Rule as implemented | Confidence |
|---|---|---|
| 1 | Tiers 3 / 6 / 9 inches give 1 / 2 / 3 / 4 points | High: every source agrees |
| 2 | Longest dimension in either direction | High |
| 3 | Maximum 4 points per linear yard | High: several sources |
| 4 | Continuous defect: 4 points in each yard it runs through | Medium: wording varies |
| 5 | Holes: 1 in or less = 2, over 1 in = 4 (default) | **Disputed**: some sources say 4 for any hole |
| 6 | Formula total x 3600 / (yards x width in inches), cuttable width | High |
| 7 | Limit 40 per 100 sq yd, accept at exactly the limit | Medium: a convention, boundary varies |

## Sources

* V-Trust, [ASTM D5430 4-Point System](https://www.v-trust.com/en/our-services/inspection-standards/other-reference-standards) and
  [Understanding the 4 point system](https://blog.v-trust.com/understanding-the-4-point-system-for-fabric-inspections):
  length tiers, formula, worked example.
* Silorga Denim, [4 Point System for Fabric Inspection](https://www.silorga.com/news-4-point-system-for-fabric-inspection.html):
  holes and openings 1 in or less = 2, over 1 in = 4.
* iFactory, [Fabric 4-Point Inspection: Grading Standards](https://ifactoryapp.com/industries/textile-manufacturing/fabric-inspection-4-point-system-grading-standards):
  holes any size = 4; buyers modify the tables.
* Online Clothing Study, [4 Point Inspection System: Acceptable level](https://www.onlineclothingstudy.com/2014/11/4-point-inspection-system-acceptable.html):
  the 40 points per 100 sq yd benchmark.
* Cotton Incorporated, [Visual Inspection and Grading of Fabrics](https://www.cottoninc.com/wp-content/uploads/2017/11/defect-classifications.pdf):
  the classic source of the system; listed by the search, not read.
