# Project helpers

# Download Citi Bike tripdata (yearly zips) and extract
citi-download:
    uv run tools/download_citibike_tripdata.py

# Build traffic aggregates used by charts
build-traffic:
    uv run tools/build_traffic_csvs.py

# Build Citi Bike tripdata aggregates used by charts
build-tripdata:
    uv run tools/build_tripdata_csvs.py

# Build normalized unreadable plate CSVs (if needed)
build-plates:
    uv run tools/build_reports_csv.py

# Build approximate isochrones (no API)
build-isochrones:
    uv run tools/build_isochrones_approx.py

# Build full street-network isochrones (no API, heavier)
build-isochrones-full:
    uv run tools/build_isochrones_full.py

# Start a simple static server for the web app
serve:
    uv run python -m http.server --directory web 8000
