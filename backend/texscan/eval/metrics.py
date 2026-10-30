import numpy as np
from numpy.typing import NDArray

BoolMask = NDArray[np.bool_]


def _ratio(num: float, den: float) -> float:
    return num / den if den else 0.0


def classification_metrics(y_true: list[int], y_pred: list[int]) -> dict[str, float]:
    """Image-level metrics with 1 = defective as the positive class.

    accuracy = (TP+TN)/N, precision = TP/(TP+FP), recall = TP/(TP+FN), F1 = 2PR/(P+R); 0/0 is reported as 0.
    """
    t, p = np.asarray(y_true, dtype=bool), np.asarray(y_pred, dtype=bool)
    tp, fp = int((t & p).sum()), int((~t & p).sum())
    tn, fn = int((~t & ~p).sum()), int((t & ~p).sum())
    precision, recall = _ratio(tp, tp + fp), _ratio(tp, tp + fn)
    return {
        "accuracy": _ratio(tp + tn, len(t)),
        "precision": precision,
        "recall": recall,
        "f1": _ratio(2 * precision * recall, precision + recall),
        "tp": tp, "fp": fp, "tn": tn, "fn": fn,
    }  # fmt: skip


def iou(pred: BoolMask, gt: BoolMask) -> float:
    """IoU = |P and G| / |P or G|; two empty masks count as a perfect 1.0."""
    union = int((pred | gt).sum())
    return 1.0 if union == 0 else int((pred & gt).sum()) / union


def dice(pred: BoolMask, gt: BoolMask) -> float:
    """Dice = 2 |P and G| / (|P| + |G|); two empty masks count as a perfect 1.0."""
    total = int(pred.sum()) + int(gt.sum())
    return 1.0 if total == 0 else 2 * int((pred & gt).sum()) / total


def pixel_prf(pred: BoolMask, gt: BoolMask) -> tuple[float | None, float | None, float]:
    """precision = TP/(TP+FP), recall = TP/(TP+FN), F1 = 2PR/(P+R) = 2TP/(2TP+FP+FN) = Dice.

    Precision is None when nothing was predicted and recall is None when the truth is empty (0/0);
    F1 is defined like Dice, so two empty masks score a perfect 1.0.
    """
    tp = int((pred & gt).sum())
    fp = int((pred & ~gt).sum())
    fn = int((~pred & gt).sum())
    precision = tp / (tp + fp) if tp + fp else None
    recall = tp / (tp + fn) if tp + fn else None
    denom = 2 * tp + fp + fn
    return precision, recall, 1.0 if denom == 0 else 2 * tp / denom
