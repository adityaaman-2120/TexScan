import argparse
import os
import sys
from pathlib import Path

from texscan.eval.evaluate import evaluate_all
from texscan.eval.mvtec import TEXTURE_CATEGORIES, DatasetNotFoundError, mvtec_root
from texscan.eval.report import write_results
from texscan.eval.synthetic import CATEGORIES as SYNTHETIC_CATEGORIES
from texscan.eval.synthetic import make_synthetic_mvtec
from texscan.pipeline.detectors import DETECTORS

REPO_ROOT = Path(__file__).resolve().parents[3]


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="texscan.eval", description="Evaluate every method on MVTec AD textures.")
    p.add_argument("--methods", nargs="+", default=list(DETECTORS), choices=list(DETECTORS))
    p.add_argument("--categories", nargs="+", help=f"default: {' '.join(TEXTURE_CATEGORIES)}")
    p.add_argument("--limit", type=int, help="max images per category (round-robin over defect types)")
    p.add_argument("--max-side", type=int, help="pipeline resolution (default 1024; 512 with --synthetic)")
    p.add_argument("--workers", type=int, default=min(4, os.cpu_count() or 1))
    p.add_argument("--out", type=Path, help="default: data/results (data/results/synthetic with --synthetic)")
    p.add_argument("--synthetic", action="store_true", help="smoke-test on a generated toy dataset (not a benchmark)")
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        if args.synthetic:
            root = make_synthetic_mvtec(REPO_ROOT / "data" / "synthetic_mvtec")
            categories, max_side = args.categories or list(SYNTHETIC_CATEGORIES), args.max_side or 512
            out, title = args.out or REPO_ROOT / "data" / "results" / "synthetic", "SYNTHETIC smoke test (not MVTec AD)"
        else:
            root = mvtec_root()
            categories, max_side = args.categories or list(TEXTURE_CATEGORIES), args.max_side or 1024
            out, title = args.out or REPO_ROOT / "data" / "results", "TexScan evaluation on MVTec AD textures"
        results = evaluate_all(root, args.methods, categories, max_side, args.limit, args.workers, progress=print)
    except DatasetNotFoundError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    meta = {"dataset": str(root), "max_side": max_side, "limit": args.limit, "synthetic": args.synthetic}
    write_results(results, out, meta, title)
    print((out / "metrics.md").read_text(encoding="utf-8"))
    print(f"wrote {out / 'metrics.json'} and {out / 'metrics.md'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
