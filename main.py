# main.py

from __future__ import annotations

import sys
from pathlib import Path

# Ensure that the src/ directory is on sys.path when running
# `uv run main.py` from the project root.
ROOT_DIR = Path(__file__).resolve().parent
SRC_DIR = ROOT_DIR / "src"

if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from nyc_mobility.pipeline import (  # type: ignore[import]
    run_all_cleaning,
    run_all_ingestions,
)


def main() -> None:
    """
    Orchestrate the full project pipeline:
    - download all raw data sources
    - clean and build aggregated datasets
    - (later) start the local web server
    """
    ingestion_results = run_all_ingestions()
    cleaning_results = run_all_cleaning(ingestion_results)

    print("Ingestion results:")
    for mode, path in ingestion_results.items():
        print(f"  {mode}: {path or 'not implemented / no output'}")

    print("\nCleaning results:")
    for mode, artifacts in cleaning_results.items():
        print(f"  {mode}:")
        for name, out_path in artifacts.items():
            print(f"    {name}: {out_path}")


if __name__ == "__main__":
    main()
