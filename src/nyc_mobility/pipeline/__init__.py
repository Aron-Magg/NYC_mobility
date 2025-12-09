# ============================================
# Author: Aron Maggisano
# File: src/nyc_mobility/pipeline/__init__.py
# Description:
#   Public orchestration functions for the nyc_mobility pipeline.
#
#   Exposes:
#     - run_all_ingestions()
#     - run_all_cleaning()
# ============================================

from __future__ import annotations

from typing import Dict, Optional

from .clean_data import run_all_cleaning
from .download_citybike_data import run_citybike_ingestion


def run_all_ingestions() -> Dict[str, Optional[str]]:
    """
    Run ingestion pipelines for all transportation modes.

    Returns:
        dict:
            mapping from mode name to the raw data location produced
            by ingestion.

            For Citi Bike this is the directory that contains all the
            monthly *citibike-tripdata*.csv files under data/raw/tripdata.
    """
    results: Dict[str, Optional[str]] = {}

    # ------------------------------
    # Citi Bike ingestion
    # ------------------------------
    print("=== Running Citi Bike ingestion ===")
    citybike_dir = run_citybike_ingestion()
    results["citybike"] = citybike_dir

    # TODO: add bus / taxi / subway / walk ingestions here.

    print("All ingestion pipelines completed.")
    return results


__all__ = ["run_all_ingestions", "run_all_cleaning"]
