from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

try:
    from tqdm import tqdm
except ImportError:  # pragma: no cover - fallback when tqdm is unavailable
    def tqdm(iterable=None, **kwargs):
        return iterable if iterable is not None else []


DEFAULT_ROOT = Path("data")
DEFAULT_MAX_MB = 100
TARGET_EXTENSIONS = {".csv"}

PART_RE = re.compile(r"^(?P<stem>.+)_part(?P<index>\d+)(?P<suffix>\.[^.]+)$", re.IGNORECASE)
NESTED_PART_RE = re.compile(
    r"^(?P<base>.+)_part(?P<outer>\d+)_part(?P<inner>\d+)(?P<suffix>\.[^.]+)$",
    re.IGNORECASE,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Split large data files into smaller CSV parts and emit manifests.",
    )
    parser.add_argument(
        "--root",
        type=Path,
        default=DEFAULT_ROOT,
        help="Root directory to scan (default: data).",
    )
    parser.add_argument(
        "--max-mb",
        type=int,
        default=DEFAULT_MAX_MB,
        help="Max size (MB) before splitting (default: 100).",
    )
    parser.add_argument(
        "--remove-original",
        action="store_true",
        help="Remove the original file after splitting.",
    )
    return parser.parse_args()


def bytes_limit(max_mb: int) -> int:
    return max_mb * 1024 * 1024


def discover_existing_parts(file_list: list[Path]) -> dict[Path, list[Path]]:
    parts: dict[Path, list[Path]] = {}
    for path in file_list:
        match = PART_RE.match(path.name)
        if not match:
            continue
        base_name = f"{match.group('stem')}{match.group('suffix')}"
        base_path = path.with_name(base_name)
        if PART_RE.match(base_path.name):
            continue
        parts.setdefault(base_path, []).append(path)
    return parts


def sort_parts(paths: list[Path]) -> list[Path]:
    def part_index(path: Path) -> int:
        match = PART_RE.match(path.name)
        return int(match.group("index")) if match else 0

    return sorted(paths, key=part_index)

def sort_nested_parts(paths: list[Path]) -> list[Path]:
    def inner_index(path: Path) -> int:
        match = NESTED_PART_RE.match(path.name)
        return int(match.group("inner")) if match else 0

    return sorted(paths, key=inner_index)

def remove_part_manifest(base_part_path: Path) -> None:
    manifest_path = base_part_path.with_suffix(".parts.json")
    if manifest_path.exists():
        manifest_path.unlink(missing_ok=True)


def write_manifest(base_path: Path, part_paths: list[Path]) -> Path:
    manifest_path = base_path.with_suffix(".parts.json")
    manifest = {
        "base": base_path.name,
        "parts": [part.name for part in sort_parts(part_paths)],
    }
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return manifest_path


def split_csv(path: Path, max_bytes: int) -> list[Path]:
    part_paths: list[Path] = []
    part_index = 1
    current_bytes = 0
    part_handle = None
    total_bytes = path.stat().st_size

    def open_part(index: int) -> tuple[Path, object]:
        part_path = path.with_name(f"{path.stem}_part{index}{path.suffix}")
        handle = part_path.open("w", encoding="utf-8", newline="")
        return part_path, handle

    with path.open("r", encoding="utf-8", newline="") as source:
        with tqdm(total=total_bytes, unit="B", unit_scale=True, desc=f"Splitting {path.name}") as bar:
            header = source.readline()
            if not header:
                return []

            header_bytes = len(header.encode("utf-8"))
            bar.update(header_bytes)

            part_path, part_handle = open_part(part_index)
            part_handle.write(header)
            part_paths.append(part_path)
            current_bytes = header_bytes

            for line in source:
                line_bytes = len(line.encode("utf-8"))
                if current_bytes + line_bytes > max_bytes and current_bytes > 0:
                    part_handle.close()
                    part_index += 1
                    part_path, part_handle = open_part(part_index)
                    part_handle.write(header)
                    part_paths.append(part_path)
                    current_bytes = header_bytes

                part_handle.write(line)
                current_bytes += line_bytes
                bar.update(line_bytes)

    if part_handle:
        part_handle.close()

    return part_paths


def should_split(path: Path, max_bytes: int) -> bool:
    if path.suffix.lower() not in TARGET_EXTENSIONS:
        return False
    if PART_RE.match(path.name):
        return False
    return path.stat().st_size > max_bytes

def normalize_nested_parts(file_list: list[Path]) -> None:
    nested_groups: dict[Path, list[Path]] = {}
    for path in file_list:
        match = NESTED_PART_RE.match(path.name)
        if not match:
            continue
        base_part_name = f"{match.group('base')}_part{match.group('outer')}{match.group('suffix')}"
        base_part_path = path.with_name(base_part_name)
        nested_groups.setdefault(base_part_path, []).append(path)

    for base_part_path, nested_paths in nested_groups.items():
        if base_part_path.exists():
            for nested_path in nested_paths:
                nested_path.unlink(missing_ok=True)
            remove_part_manifest(base_part_path)
            continue

        nested_paths = sort_nested_parts(nested_paths)
        if not nested_paths:
            continue

        base_part_path.parent.mkdir(parents=True, exist_ok=True)
        with base_part_path.open("w", encoding="utf-8", newline="") as out_handle:
            for index, nested_path in enumerate(nested_paths):
                with nested_path.open("r", encoding="utf-8", newline="") as in_handle:
                    header = in_handle.readline()
                    if index == 0:
                        out_handle.write(header)
                    for line in in_handle:
                        out_handle.write(line)

        for nested_path in nested_paths:
            nested_path.unlink(missing_ok=True)
        remove_part_manifest(base_part_path)


def cleanup_part_manifests(file_list: list[Path]) -> None:
    for path in file_list:
        if path.suffix != ".json":
            continue
        if not path.name.endswith(".parts.json"):
            continue
        base_name = path.name.replace(".parts.json", ".csv")
        if PART_RE.match(base_name):
            path.unlink(missing_ok=True)


def main() -> None:
    args = parse_args()
    root = args.root
    max_bytes = bytes_limit(args.max_mb)

    if not root.exists():
        raise SystemExit(f"Missing directory: {root}")

    all_paths = list(root.rglob("*"))
    file_list = [path for path in all_paths if path.is_file()]
    normalize_nested_parts(file_list)
    cleanup_part_manifests(file_list)

    all_paths = list(root.rglob("*"))
    file_list = [path for path in all_paths if path.is_file()]

    existing_parts = discover_existing_parts(file_list)
    processed_bases = set()

    for base_path, part_paths in existing_parts.items():
        write_manifest(base_path, part_paths)
        processed_bases.add(base_path)

    for path in tqdm(sorted(file_list), desc="Scanning files"):
        if not should_split(path, max_bytes):
            continue
        if path in processed_bases:
            continue
        if any(PART_RE.match(p.name) for p in existing_parts.get(path, [])):
            continue

        part_paths = split_csv(path, max_bytes)
        if not part_paths:
            continue
        write_manifest(path, part_paths)
        processed_bases.add(path)

        if args.remove_original:
            path.unlink(missing_ok=True)

    print("Split check complete.")


if __name__ == "__main__":
    main()
