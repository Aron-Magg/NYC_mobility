# ============================================
# Author: Aron Maggisano
# File: src/nyc_mobility/pipeline/download_all_data.py
# Description:
#   Orchestrate all data ingestion pipelines (Citi Bike, bus, taxi, etc.)
# ============================================

from __future__ import annotations

from typing import Dict, Optional

from nyc_mobility.pipeline.download_bus_data import run_bus_ingestion
from nyc_mobility.pipeline.download_citybike_data import run_citybike_ingestion
from nyc_mobility.pipeline.download_subway_data import run_subway_ingestion
from nyc_mobility.pipeline.download_taxi_data import run_taxi_ingestion
from nyc_mobility.pipeline.download_walk_data import run_walk_ingestion


def run_all_ingestions() -> Dict[str, Optional[str]]:
    """
    Run all ingestion pipelines and return a mapping from mode -> final dataset path.
    """
    results: Dict[str, Optional[str]] = {}

    print("=== Running Citi Bike ingestion ===")
    results["citybike"] = run_citybike_ingestion()

    print("\n=== Running bus ingestion ===")
    results["bus"] = run_bus_ingestion()

    print("\n=== Running taxi ingestion ===")
    results["taxi"] = run_taxi_ingestion()

    print("\n=== Running subway ingestion ===")
    results["subway"] = run_subway_ingestion()

    print("\n=== Running walk ingestion ===")
    results["walk"] = run_walk_ingestion()

    print("\nAll ingestion pipelines completed.")
    return results
