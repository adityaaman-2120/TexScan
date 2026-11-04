import numpy as np

from texscan.pipeline.defects import extract_defects
from texscan.pipeline.segment import group_labels, morphology_cleanup, remove_small_components


def two_pieces(gap: int) -> np.ndarray:
    """Two 12 x 12 squares, `gap` pixels apart, on a 100 x 100 mask."""
    m = np.zeros((100, 100), np.uint8)
    m[40:52, 20:32] = 255
    m[40:52, 32 + gap : 44 + gap] = 255
    return m


def test_group_labels_joins_pieces_within_the_distance_only() -> None:
    near, far = two_pieces(6), two_pieces(30)
    assert len(np.unique(group_labels(near, 10))) - 1 == 1
    assert len(np.unique(group_labels(far, 10))) - 1 == 2
    assert len(np.unique(group_labels(near, 0))) - 1 == 2  # no distance: plain connected components
    assert not group_labels(near, 10)[near == 0].any()  # background stays 0


def test_pieces_that_are_each_too_small_pass_the_size_filter_together() -> None:
    near = two_pieces(6)  # each piece is 144 px
    assert not remove_small_components(near, 200).any()
    kept = remove_small_components(near, 200, merge_distance=10)
    assert np.array_equal(kept, near)  # the mask itself is unchanged, nothing is drawn between the pieces


def test_far_pieces_are_still_judged_alone() -> None:
    assert not remove_small_components(two_pieces(30), 200, merge_distance=10).any()


def test_cleanup_merges_by_a_share_of_the_longest_side() -> None:
    near = two_pieces(6)
    assert morphology_cleanup(near, 1, 200, merge_fraction=0.1).any()  # 0.1 * 100 = 10 px
    assert not morphology_cleanup(near, 1, 200, merge_fraction=0.0).any()


def test_one_defect_entry_for_a_group_with_the_union_box_and_summed_area() -> None:
    near = two_pieces(6)
    separate = extract_defects(near)
    grouped = extract_defects(near, None, 7, 10)
    assert len(separate) == 2 and len(grouped) == 1
    assert grouped[0].bbox == (20, 40, 30, 12)  # x, y, w, h of both squares together
    assert grouped[0].area == 288
