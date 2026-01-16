from __future__ import annotations

import csv
import math
from pathlib import Path


SOURCE_FILE = Path("data/raw_traffic_counts/Automated_Traffic_Volume_Counts.csv")
OUTPUT_DIR = SOURCE_FILE.parent
PARTS = 2


def count_rows(path: Path) -> int:
    with path.open("r", newline="", encoding="utf-8") as handle:
        return sum(1 for _ in handle) - 1


def split_file(path: Path) -> list[Path]:
    total_rows = count_rows(path)
    if total_rows <= 0:
        raise SystemExit(f"No data rows found in {path}")

    rows_per_part = math.ceil(total_rows / PARTS)
    part_paths = [
        OUTPUT_DIR / f"{path.stem}_part{index + 1}{path.suffix}" for index in range(PARTS)
    ]

    with path.open("r", newline="", encoding="utf-8") as handle:
        reader = csv.reader(handle)
        header = next(reader, None)
        if not header:
            raise SystemExit(f"Missing header in {path}")

        writers = []
        files = []
        for part_path in part_paths:
            part_path.parent.mkdir(parents=True, exist_ok=True)
            f = part_path.open("w", newline="", encoding="utf-8")
            writer = csv.writer(f)
            writer.writerow(header)
            writers.append(writer)
            files.append(f)

        try:
            for index, row in enumerate(reader, start=1):
                part_index = min((index - 1) // rows_per_part, PARTS - 1)
                writers[part_index].writerow(row)
        finally:
            for f in files:
                f.close()

    return part_paths


def main() -> None:
    if not SOURCE_FILE.exists():
        raise SystemExit(f"Missing source file: {SOURCE_FILE}")

    part_paths = split_file(SOURCE_FILE)
    print("Split complete:")
    for part_path in part_paths:
        print(f"- {part_path}")


if __name__ == "__main__":
    main()
