#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "NYC Mobility: full preprocessing pipeline"
echo "This can take a couple of hours depending on network and machine resources."

die() {
  echo "$1" >&2
  exit 1
}

command -v uv >/dev/null 2>&1 || die "uv is required. Install it first."

if [ ! -d "data/yellow_taxi/Dataset" ]; then
  die "Missing taxi dataset. Expected: data/yellow_taxi/Dataset/<YEAR>/<service>/*.parquet"
fi

uv sync

# Citi Bike data
uv run tools/download_citibike_tripdata.py
uv run tools/build_tripdata_csvs.py
uv run tools/build_tripdata_routes.py

# Traffic counts
uv run tools/split_traffic_counts.py
uv run tools/build_traffic_csvs.py

# Geo filtering and isochrones
uv run tools/filter_fhv_geojson.py
uv run tools/build_isochrones_approx.py
uv run tools/build_isochrones_transit.py
uv run tools/build_isochrones_full.py

# Taxi/FHV aggregates
uv run tools/build_yellow_taxi_csvs.py --year-from 2014 --year-to 2023

# Split large outputs for web loading
uv run tools/split_large_data_files.py

echo "All preprocessing steps completed."
