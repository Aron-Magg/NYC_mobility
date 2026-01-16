# NYC Mobility project helpers

set shell := ["bash", "-cu"]

@default:
    @just --list

# -------------------------
# Setup / metadata
# -------------------------
show-env:
    uv --version
    git --version

# Sync the uv environment into .venv
uv-sync:
    uv sync

# Open an interactive shell inside the uv virtual environment
uv-shell:
    uv sync && bash -lc 'source .venv/bin/activate && exec $SHELL'

# -------------------------
# Data downloads
# -------------------------
# Citi Bike tripdata (monthly zip download + extract)
citi-download:
    uv run tools/download_citibike_tripdata.py

# -------------------------
# Preprocessing pipelines
# -------------------------
# Build traffic aggregates used by charts
build-traffic:
    uv run tools/build_traffic_csvs.py

# Split the raw traffic CSV into two smaller parts
split-traffic:
    uv run tools/split_traffic_counts.py

# Split any data/*.csv above 100MB and emit manifests
split-large-data:
    uv run tools/split_large_data_files.py

# Build Citi Bike tripdata aggregates used by charts
build-tripdata:
    uv run tools/build_tripdata_csvs.py

# Build TLC taxi aggregates for charts (defaults to latest year)
build-yellow-taxi:
    uv run tools/build_yellow_taxi_csvs.py

# Build routed Citi Bike paths for top routes map
build-tripdata-routes:
    uv run tools/build_tripdata_routes.py

# Build unreadable plates aggregates (if needed)
build-plates:
    uv run tools/build_reports_csv.py

# Approx isochrones (no API)
build-isochrones-approx:
    uv run tools/build_isochrones_approx.py

# Transit-style isochrones using access-point networks
build-isochrones-transit:
    uv run tools/build_isochrones_transit.py

# Full street-network isochrones (no API, heavier)
build-isochrones-full:
    uv run tools/build_isochrones_full.py

# Filter point layers to borough bounds (subway/bus/bike/taxi)
filter-layers:
    uv run tools/filter_fhv_geojson.py

# -------------------------
# Local development
# -------------------------
serve:
    uv run python -m http.server --directory web 8000

# -------------------------
# Git helpers
# -------------------------
status:
    git status -sb

log:
    git --no-pager log --oneline -n 10
