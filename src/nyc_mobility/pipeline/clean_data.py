from __future__ import annotations

from pathlib import Path
from typing import Dict, Mapping, Optional

from .clean_citybike_data import run_citybike_cleaning


def run_all_cleaning(
    ingestion_results: Optional[Mapping[str, Optional[str]]] = None,
) -> Dict[str, Dict[str, Path]]:
    """
    Run cleaning pipelines for all transportation modes.
    """
    results: Dict[str, Dict[str, Path]] = {}

    # ------------------------------
    # Citi Bike cleaning
    # ------------------------------
    citybike_raw_dir: Optional[str] = None
    if ingestion_results is not None:
        # nel nuovo ingestion, 'citybike' dovrebbe essere la cartella raw
        citybike_raw_dir = ingestion_results.get("citybike")

    print("=== Running Citi Bike cleaning ===")
    citybike_outputs = run_citybike_cleaning(input_dir=citybike_raw_dir)
    results["citybike"] = citybike_outputs

    # TODO: altri cleaning (bus, taxi, ...)

    print("All cleaning pipelines completed.")
    return results


if __name__ == "__main__":
    run_all_cleaning()
