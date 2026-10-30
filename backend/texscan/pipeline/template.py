import cv2
import numpy as np

from texscan.pipeline.types import FloatImage, Image

_DEGENERATE_SCALE = (0.5, 2.0)


def _match_points(
    test: Image, reference: Image, max_features: int
) -> tuple[np.ndarray, np.ndarray]:
    orb = cv2.ORB_create(nfeatures=max_features)
    kp_t, des_t = orb.detectAndCompute(test, None)
    kp_r, des_r = orb.detectAndCompute(reference, None)
    if des_t is None or des_r is None:
        return np.empty((0, 2), np.float32), np.empty((0, 2), np.float32)
    matches = sorted(cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True).match(des_r, des_t), key=lambda m: m.distance)
    ref_pts = np.float32([kp_r[m.queryIdx].pt for m in matches]).reshape(-1, 2)
    test_pts = np.float32([kp_t[m.trainIdx].pt for m in matches]).reshape(-1, 2)
    return ref_pts, test_pts


def _plausible(homography: np.ndarray) -> bool:
    det = abs(float(np.linalg.det(homography[:2, :2])))
    return _DEGENERATE_SCALE[0] ** 2 < det < _DEGENERATE_SCALE[1] ** 2


def align_template(
    test: Image,
    reference: Image,
    max_features: int = 2000,
    ransac_threshold: float = 3.0,
    min_inliers: int = 15,
) -> tuple[Image, np.ndarray, int]:
    """ORB keypoints are matched by Hamming distance; RANSAC fits H with p_test ~ H p_ref.

    The reference is warped by H into the test frame (so masks stay in test coordinates). If fewer than
    min_inliers survive, falls back to the identity. Returns (aligned reference, H, inlier count).
    """
    identity = np.eye(3)
    h, w = test.shape[:2]
    ref_pts, test_pts = _match_points(test, reference, max_features)
    if len(ref_pts) >= 4:
        homography, inlier_mask = cv2.findHomography(ref_pts, test_pts, cv2.RANSAC, ransac_threshold)
        inliers = int(inlier_mask.sum()) if inlier_mask is not None else 0
        if homography is not None and inliers >= min_inliers and _plausible(homography):
            aligned = cv2.warpPerspective(reference, homography, (w, h), borderMode=cv2.BORDER_REPLICATE)
            return aligned, homography, inliers
    return cv2.resize(reference, (w, h)), identity, 0


def abs_difference(test: Image, aligned_reference: Image) -> FloatImage:
    """D = |(T - mean T) - (R - mean R)|: pixel-wise absolute difference after matching mean brightness."""
    t = test.astype(np.float32)
    r = aligned_reference.astype(np.float32)
    return np.abs((t - t.mean()) - (r - r.mean()))
