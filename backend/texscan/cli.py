import argparse
import json
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from sqlmodel import Session

from texscan import db
from texscan.imageio import read_image, write_image
from texscan.pipeline import PipelineConfig, PipelineResult, run_pipeline
from texscan.profiles import (
    ProfileNotFoundError,
    delete_profile,
    get_profile,
    list_profiles,
    profile_config,
    tune_and_save,
)
from texscan.tuning import TUNABLE


@contextmanager
def _session() -> Iterator[Session]:
    db.init_db()
    with Session(db.engine) as session:
        yield session


def save_result(result: PipelineResult, out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    for i, (name, image) in enumerate(result.stages.items()):
        write_image(out_dir / f"{i:02d}_{name}.png", image)
    summary = {
        "decision": result.decision,
        "defect_area_percent": result.defect_area_percent,
        "defects": [d.model_dump() for d in result.defects],
        "timings_ms": result.timings_ms,
        "peaks": result.peaks.tolist(),
    }
    (out_dir / "result.json").write_text(json.dumps(summary, indent=2))


def _config_for_inspect(args: argparse.Namespace) -> PipelineConfig:
    if args.profile:
        with _session() as session:
            return profile_config(get_profile(session, args.profile))
    config = PipelineConfig.model_validate_json(args.config.read_text()) if args.config else PipelineConfig()
    return config.model_copy(update={"method": args.method}) if args.method else config


def _inspect(args: argparse.Namespace) -> int:
    config = _config_for_inspect(args)
    reference = read_image(args.reference) if args.reference else None
    result = run_pipeline(read_image(args.image), config, reference)
    out_dir = args.out or Path("data/out") / args.image.stem
    save_result(result, out_dir)
    print(f"{result.decision}: {len(result.defects)} defect(s), {result.defect_area_percent:.3f}% area")
    for d in result.defects:
        print(f"  #{d.id} {d.defect_type} ({d.type_confidence:.2f}) bbox={d.bbox} area={d.area}")
    print(f"stages saved to {out_dir}")
    return 0


def _tune(args: argparse.Namespace) -> int:
    images = [read_image(p) for p in args.images]
    base = PipelineConfig.model_validate({"method": args.method, "max_side": args.max_side})
    with _session() as session:
        profile, report = tune_and_save(session, args.name, images, base, args.quantile)
    print(f"profile '{profile.name}' saved ({report.method}, {report.n_images} images)")
    print(f"  {report.threshold_param} = {report.threshold:.3f}   min_area = {report.min_area}px")
    print(f"  leave-one-out pass rate: {report.loo_pass_rate:.0%}")
    for warning in report.warnings:
        print(f"  warning: {warning}")
    return 0


def _profiles(args: argparse.Namespace) -> int:
    with _session() as session:
        if args.delete:
            delete_profile(session, args.delete)
            print(f"deleted '{args.delete}'")
        for p in list_profiles(session):
            print(f"{p.name}\t{p.method}\t{p.updated_at:%Y-%m-%d %H:%M}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="texscan")
    sub = parser.add_subparsers(dest="command", required=True)

    inspect = sub.add_parser("inspect", help="run the pipeline on one image")
    inspect.add_argument("image", type=Path)
    inspect.add_argument("--out", type=Path, help="output folder (default: data/out/<image name>)")
    inspect.add_argument("--config", type=Path, help="PipelineConfig as a JSON file")
    inspect.add_argument("--method", choices=["fft", "gabor", "golden_template", "local_statistics"])
    inspect.add_argument("--reference", type=Path, help="good reference image (golden_template)")
    inspect.add_argument("--profile", help="use the tuned config stored under this name")
    inspect.set_defaults(func=_inspect)

    tune = sub.add_parser("tune", help="tune a named profile from 5-20 known-good images")
    tune.add_argument("name")
    tune.add_argument("images", nargs="+", type=Path)
    tune.add_argument("--method", default="fft", choices=sorted(TUNABLE))
    tune.add_argument("--quantile", type=float, default=99.5)
    tune.add_argument("--max-side", type=int, default=1024)
    tune.set_defaults(func=_tune)

    profiles = sub.add_parser("profiles", help="list stored profiles")
    profiles.add_argument("--delete", metavar="NAME")
    profiles.set_defaults(func=_profiles)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        return args.func(args)
    except ProfileNotFoundError as exc:
        print(f"error: {exc.args[0]}")
        return 2
    except (ValueError, OSError) as exc:  # bad arguments, unreadable or missing files
        print(f"error: {exc}")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
