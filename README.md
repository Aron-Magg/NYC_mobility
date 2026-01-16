# NYC Mobility - Visitor Story

This repository contains a guided, interactive data storytelling experience about how people move around New York City. The site is built with D3.js and a set of pre-aggregated CSV and GeoJSON files so the browser only renders visuals (no heavy data crunching at runtime).

## Academic context

SUPSI 2025/2026 - Data Visualization (M-D32023)
Instructor: Giovanni Profeta

## Authors

- Emmanuel Adoh - Dataset research and theme (https://github.com/KennethSUPSI)
- Aron Maggisano - Site making and graphics (https://github.com/Aron-Magg/)
- Francesco Masolini - Graphs and site assistant and dataset research (https://github.com/FraMaso)
- Maithili Nalawade - Themes research and dataset research (https://github.com/42syzygy-sudo)

## Install tools (uv + just)

### macOS

```bash
brew install just
brew install uv
```

### Linux (Debian/Ubuntu)

```bash
sudo apt-get update
sudo apt-get install -y just
curl -LsSf https://astral.sh/uv/install.sh | sh
```

### Windows (PowerShell)

```powershell
scoop install just
powershell -ExecutionPolicy Bypass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

If you prefer a different package manager, use the equivalent installation method for your system (for example, `choco install just` on Windows).

## Quick start

```bash
just uv-sync
just serve
```

Then open http://localhost:8000 in your browser.

## Project structure

```text
.
├── data/                        # Raw data and generated aggregates
│   ├── raw_traffic_counts/      # Automated traffic volume counts
│   ├── processed/               # Local aggregates (generated)
│   ├── tripdata/                # Citi Bike raw tripdata (gitignored)
│   └── yellow_taxi/             # TLC taxi raw data (gitignored)
├── tools/                       # Python preprocessing scripts
├── transport_structure.geojson  # Extra network layer
├── web/                         # Frontend (HTML, JS, CSS, data)
│   ├── data/processed/           # Web-ready aggregates
│   ├── data/geo/                 # Borough and network GeoJSON layers
│   ├── js/charts/                # D3 charts
│   └── index.html                # Storytelling page
├── Justfile                      # Convenience commands
├── pyproject.toml                # Python dependencies for uv
└── README.md
```

## Common commands (from Justfile)

```bash
just --list
just uv-sync
just uv-shell
just citi-download
just build-tripdata
just build-tripdata-routes
just build-yellow-taxi
just build-traffic
just split-traffic
just split-large-data
just build-isochrones-approx
just build-isochrones-transit
just build-isochrones-full
just filter-layers
just serve
```

## Full preprocessing (all steps)

Processing everything in one run can take a couple of hours, depending on network speed and machine resources. Use the full pipeline script to run all steps in sequence:

```bash
bash tools/run_full_pipeline.sh
```

The script assumes the TLC taxi dataset is already downloaded and placed at:

```
data/yellow_taxi/Dataset/<YEAR>/<service>/*.parquet
```

Expected service folder names include `yellow_taxi`, `green_taxi`, `for_hire_vehicle`, and `high_volume_for_hire_vehicle`.

## Data sources and what they are used for

Core sources used directly in the charts:

- Annual ridership by mode: `data/RidershipMode_Full Data_data.csv` (Subway, Bus, Citi Bike, Taxi/FHV).
- Access points by mode: `data/map_Full Data_data.csv` (stations, stops, and service points).
- Automated traffic volume counts: https://catalog.data.gov/dataset/automated-traffic-volume-counts (Last accessed 2025-01-15 13:20).
- Citi Bike tripdata: https://s3.amazonaws.com/tripdata/ (downloaded via `tools/download_citibike_tripdata.py`).
- NYC TLC taxi data: https://www.kaggle.com/datasets/microize/nyc-taxi-dataset?resource=download (Last accessed 2025-01-14 16:40). Place the unpacked dataset under `data/yellow_taxi/Dataset` with year folders.
- GeoJSON layers: `web/data/geo/*.geojson` and `transport_structure.geojson`.
- OSM street network: pulled by `osmnx` for routing and isochrones (no API keys required).

Reference projects and additional sources (last accessed):

- https://uclab.fh-potsdam.de/cf/ - 2024-11-08 19:12
- https://senseable.mit.edu/bike-trafficking/ - 2024-11-16 20:43
- https://cityflow-project.github.io/#cta - 2024-11-23 18:27
- https://a816-dohbesp.nyc.gov/IndicatorPublic/data-explorer/walking-driving-and-cycling/?id=2415#display=summary - 2024-12-02 21:05
- https://ir-datasets.com/nyt.html - 2024-12-07 16:49
- https://catalog.data.gov/dataset/mta-subway-customer-journey-focused-metrics-beginning-2015 (2015-2019) - 2024-12-11 20:18
- https://catalog.data.gov/dataset/mta-subway-customer-journey-focused-metrics-beginning-2020 (2020-2024) - 2024-12-14 17:31
- https://data.ny.gov/Transportation/MTA-Daily-Ridership-Data-2020-2025/vxuj-8kew/about_data - 2024-12-18 19:02
- https://data.ny.gov/Transportation/MTA-Customer-Feedback-Data-2014-2019/tppa-s6t6/about_data - 2024-12-22 14:40
- https://d3blocks.github.io/d3blocks/pages/html/index.html - 2024-12-28 09:55
- https://nyc-transit-maps.preview.emergentagent.com - 2025-01-03 18:10
- https://research.google/blog/introducing-mobility-ai-advancing-urban-transportation/ - 2025-01-06 21:14
- https://c2smart.engineering.nyu.edu/c2smart-data-dashboard/ - 2025-01-09 17:38
- https://public.tableau.com/app/search/vizzes/nyc%20transportation - 2025-01-11 20:51
- https://willgeary.github.io/portfolio/projects/transitflow/ - 2025-01-12 19:27

## Data preprocessing workflow

The preprocessing pipeline generates lightweight CSVs and GeoJSON files so the browser only renders visuals. This avoids heavy computation in the web page and keeps the data small enough for GitHub.

Key scripts in `tools/`:

- `download_citibike_tripdata.py` - Downloads monthly Citi Bike tripdata ZIPs from S3, extracts CSVs, removes ZIPs, and cleans empty folders.
- `build_tripdata_csvs.py` - Reads Citi Bike CSVs in chunks and produces:
  - `top_flows.csv` and `top_routes.geojson`
  - `top_start_stations.csv`
  - `hourly_by_user.csv`, `weekday_by_user.csv`
  - `rideable_type_share.csv`, `member_share.csv`, `duration_bins.csv`
  Outputs go to `data/processed/tripdata` and `web/data/processed/tripdata`.
- `build_tripdata_routes.py` - Uses the OSM bike network to route between top station pairs and writes `web/data/processed/tripdata/top_routes.geojson` and `top_routes.csv`.
- `build_yellow_taxi_csvs.py` - Aggregates TLC taxi data (yellow, green, FHV, HVFHS) into:
  - `taxi_trip_volume_monthly.csv`
  - `taxi_pickups_by_dow_hour.csv`
  - `taxi_distance_bins.csv`, `taxi_duration_bins.csv`
  - `taxi_pickup_borough_share.csv`
  - `taxi_top_pickup_zones.csv`, `taxi_top_od_pairs.csv`
  - `taxi_provider_share.csv`
  Outputs go to `data/processed/yellow_taxi` and `web/data/processed/yellow_taxi`.
- `build_traffic_csvs.py` - Aggregates automated traffic counts into hourly, weekday/weekend, day-of-week, borough share, and top corridor CSVs.
- `build_isochrones_approx.py` - Builds approximate travel isochrones from average speeds.
- `build_isochrones_transit.py` - Builds transit isochrones using access points to constrain routes.
- `build_isochrones_full.py` - Uses OSM street networks for heavier full-network isochrones.
- `filter_fhv_geojson.py` - Filters point layers to the borough bounds.
- `split_traffic_counts.py` - Splits the raw traffic CSV into smaller files when needed.
- `split_large_data_files.py` - Splits any CSV over a size threshold into parts and writes a `.parts.json` manifest.

## Large data handling and known issues

Full preprocessing can take a couple of hours when all datasets are rebuilt, especially for Citi Bike, taxi, and isochrone generation steps.

- Raw tripdata and taxi data are massive and cannot be shipped to the browser. We pre-aggregate into chart-ready CSVs in `data/processed` and `web/data/processed`.
- Some raw CSVs exceed GitHub limits. We split them into parts with `split_large_data_files.py` and load them via `loadCsvMaybeParts` (the page merges `*_partN.csv` files using `.parts.json` manifests).
- TLC taxi timestamps arrived in mixed formats. We added unit inference in `build_yellow_taxi_csvs.py` and filtered to the requested year range to avoid outlier years (for example, 2081 or 2098).
- OSM network builds are heavy and can be slow. We offer approximate and transit-constrained isochrones to reduce memory pressure when needed.
- Access-point layers can include coordinates outside borough bounds; we filter them with `filter_fhv_geojson.py`.

## Chart-by-chart breakdown

This section documents every visualization, the dataset it reads, how it is built, and any specific challenges.

### NYC in one glance

- **NYC boroughs at a glance (map)**
  - Data: `web/data/geo/*.geojson` (borough boundaries).
  - Build: static GeoJSON rendered with D3.
  - Purpose: establish the geographic context for all other charts.
  - Why this chart: a borough map is the fastest way to ground every later comparison in space.

- **Access points across modes (map)**
  - Data: `data/map_Full Data_data.csv` (stations and access points).
  - Build: D3 point layer over borough GeoJSON, filtered to the NYC boundary using `tools/filter_fhv_geojson.py`.
  - Purpose: show the density and spread of access points by mode.
  - Why this chart: point density communicates service coverage faster than lines or routes for a first pass.

- **How far can you go from Grand Central? (isochrone map)**
  - Data: `web/data/processed/isochrones/*.geojson` (generated).
  - Build:
    - Walking and cycling use the OSM street network (pedestrian and bike graphs) with shortest-path reachability.
    - Bus and subway use access points from the datasets to constrain routes and approximate coverage.
    - Approximate isochrones rely on average speeds for quick previews.
  - Scripts: `build_isochrones_full.py`, `build_isochrones_transit.py`, `build_isochrones_approx.py`.
  - Purpose: compare reachable areas from a single hub using different modes.
  - Why this chart: an isochrone immediately answers the visitor question, “how far can I actually go from here?”

### Modal split and annual volume

- **Annual ridership by mode (bar chart)**
  - Data: `data/RidershipMode_Full Data_data.csv`.
  - Build: aggregate to yearly averages per mode (Subway, Bus, Citi Bike, Taxi/FHV).
  - Purpose: compare how each mode evolves over time.
  - Why this chart: bars make year-to-year differences legible for categories that are not continuous routes.

- **Latest year mode share (pie chart)**
  - Data: same ridership CSV.
  - Build: filter to latest year and compute share of total ridership.
  - Purpose: show the current balance between modes.
  - Why this chart: a pie is the quickest way to communicate the “slice of the whole” for a single year.

- **Total system volume (bar chart)**
  - Data: same ridership CSV.
  - Build: sum across modes by year.
  - Purpose: show the overall system size and recovery trends.
  - Why this chart: total bars show system scale without the distraction of mode splits.

### Subway: the backbone

- **Subway annual ridership (line chart)**
  - Data: `data/RidershipMode_Full Data_data.csv` filtered to Subway.
  - Build: yearly averages.
  - Purpose: show long-term demand and disruption.
  - Why this chart: lines emphasize the temporal continuity and shocks over time.

- **Subway share of total (line chart)**
  - Data: same CSV, share of Subway vs total each year.
  - Purpose: show the subway share relative to the full system.
  - Why this chart: the share line isolates dominance independently of total volume swings.

### Bus: surface coverage

- **Bus annual ridership (line chart)**
  - Data: `data/RidershipMode_Full Data_data.csv` filtered to Bus.
  - Build: yearly averages.
  - Purpose: show stability and long-term demand.
  - Why this chart: a line highlights the steadier pattern without overemphasizing single-year noise.

- **Bus share of total (line chart)**
  - Data: same CSV, share of Bus vs total each year.
  - Purpose: show the bus share relative to the full system.
  - Why this chart: share lines make surface-mode competition visible against the system total.

### Bike and micromobility

- **Most common Citi Bike flows (map)**
  - Data: `web/data/processed/tripdata/top_routes.geojson`.
  - Build: top station pairs from `top_flows.csv` are routed on the OSM bike network and rendered as flow lines.
  - Script: `build_tripdata_routes.py`.
  - Purpose: show the strongest bike corridors.
  - Why this chart: routed flow lines communicate the strongest corridors better than a raw point cloud.

- **Citi Bike annual ridership (line chart)**
  - Data: `data/RidershipMode_Full Data_data.csv` filtered to Citi Bike.
  - Build: yearly averages.
  - Purpose: show bike growth across the decade.
  - Why this chart: a line best shows the growth trajectory and inflection points.

- **Citi Bike share of total (line chart)**
  - Data: same CSV, share of Citi Bike vs total each year.
  - Purpose: show how bike usage compares to the full system.
  - Why this chart: share lines clarify the bike slice without the scale of total ridership.

- **Hourly demand: member vs casual (line chart)**
  - Data: `web/data/processed/tripdata/hourly_by_user.csv`.
  - Build: chunked aggregation in `build_tripdata_csvs.py`.
  - Purpose: compare commuter peaks against leisure peaks.
  - Why this chart: hourly curves make the daily rhythm visible for both rider types at once.

- **Top start stations (bar chart)**
  - Data: `web/data/processed/tripdata/top_start_stations.csv`.
  - Build: aggregate counts per station.
  - Purpose: highlight the busiest pickup locations.
  - Why this chart: ranked bars quickly identify the few stations that dominate demand.

- **Trip duration mix (stacked bars)**
  - Data: `web/data/processed/tripdata/duration_bins.csv`.
  - Build: bins by minutes and split by member type.
  - Purpose: show how long rides typically last.
  - Why this chart: stacked bars show both total volume and the member/casual composition.

- **Bike type share (pie chart)**
  - Data: `web/data/processed/tripdata/rideable_type_share.csv`.
  - Build: aggregate by rideable type.
  - Purpose: show how much of the fleet is electric vs classic.
  - Why this chart: a simple pie communicates the split without implying a trend.

- **Member vs casual share (pie chart)**
  - Data: `web/data/processed/tripdata/member_share.csv`.
  - Build: aggregate counts by rider category.
  - Purpose: show the balance between subscribers and visitors.
  - Why this chart: the share snapshot is the most direct way to compare member vs visitor usage.

### Taxi and FHV: door-to-door

- **Monthly trip volume by service (line chart)**
  - Data: `web/data/processed/yellow_taxi/taxi_trip_volume_monthly.csv`.
  - Build: monthly counts by service type (yellow, green, FHV, HVFHS).
  - Purpose: show long-term shifts and seasonality.
  - Why this chart: monthly lines reveal both seasonality and structural shifts across services.

- **Pickup rhythm by day and hour (heatmap)**
  - Data: `web/data/processed/yellow_taxi/taxi_pickups_by_dow_hour.csv`.
  - Build: aggregate pickups by day-of-week and hour.
  - Purpose: show daily pickup pulses.
  - Why this chart: a heatmap shows the full weekly rhythm without overloading with lines.

- **Trip distance mix (grouped bars)**
  - Data: `web/data/processed/yellow_taxi/taxi_distance_bins.csv`.
  - Build: distance bins per service, with the largest bin aggregated to 20+ miles.
  - Purpose: compare how far each service typically travels.
  - Why this chart: grouped bars make cross-service comparisons readable in each distance bin.

- **Trip duration mix (grouped bars)**
  - Data: `web/data/processed/yellow_taxi/taxi_duration_bins.csv`.
  - Build: duration bins per service, with the largest bin aggregated to 45+ minutes.
  - Purpose: compare how long each service typically runs.
  - Why this chart: duration bins mirror the distance bins, confirming the short-trip pattern.

- **HVFHS provider share (horizontal bars)**
  - Data: `web/data/processed/yellow_taxi/taxi_provider_share.csv`.
  - Build: count trips per provider (Uber, Lyft, Via, Juno).
  - Purpose: show market concentration within HVFHS.
  - Why this chart: horizontal bars fit long provider names and highlight market dominance.

- **Pickup borough share (grouped bars)**
  - Data: `web/data/processed/yellow_taxi/taxi_pickup_borough_share.csv`.
  - Build: share of pickups per borough and service.
  - Purpose: show geographic concentration by service.
  - Why this chart: grouped bars show how each service distributes across boroughs.

- **Top pickup zones (horizontal bars)**
  - Data: `web/data/processed/yellow_taxi/taxi_top_pickup_zones.csv`.
  - Build: latest-year ranking by service, with fallback to all years if the latest-year slice is too small.
  - Purpose: highlight the most active pickup zones.
  - Why this chart: ranked horizontal bars give maximum space to long zone names.

- **Top origin-destination pairs (horizontal bars)**
  - Data: `web/data/processed/yellow_taxi/taxi_top_od_pairs.csv`.
  - Build: latest-year ranking by service, with fallback to all years if needed.
  - Purpose: show the most repeated door-to-door trips.
  - Why this chart: OD pairs are best read as ranked labels, not as a map without routes.

### Surface traffic rhythm

- **Average volume by hour (multi-line)**
  - Data: `web/data/processed/traffic/hourly_by_borough.csv`.
  - Build: average volume per hour and borough.
  - Purpose: show the hourly rhythm of surface traffic.
  - Why this chart: lines make daily peaks and troughs easy to compare across boroughs.

- **Weekday vs weekend averages (grouped bars)**
  - Data: `web/data/processed/traffic/weekday_vs_weekend.csv`.
  - Build: average weekday vs weekend volume per borough.
  - Purpose: compare weekday and weekend intensity.
  - Why this chart: side-by-side bars highlight the weekend drop without hiding borough differences.

- **Traffic by day of week (bars)**
  - Data: `web/data/processed/traffic/day_of_week.csv`.
  - Build: average volume per weekday across all boroughs.
  - Purpose: show weekly peaks and troughs.
  - Why this chart: a single bar set makes the weekly cycle readable at a glance.

- **Borough traffic share (pie)**
  - Data: `web/data/processed/traffic/borough_share.csv`.
  - Build: average share per borough.
  - Purpose: show which boroughs contribute most to traffic volume.
  - Why this chart: a pie isolates contribution to the whole without implying a time trend.

- **Top corridors by total volume (horizontal bars)**
  - Data: `web/data/processed/traffic/top_corridors.csv`.
  - Build: corridor strings built from street and direction, then ranked by total volume.
  - Purpose: highlight the busiest street segments.
  - Why this chart: ranked bars allow long corridor names and direct comparison of magnitudes.

### Summary

The summary chapter consolidates the above views into one narrative: rail for speed, buses for coverage, bikes for short trips, ride-hail for flexibility, and traffic for the street-level rhythm.

## Frontend

The storytelling page is in `web/index.html`. Charts live in `web/js/charts/`, and data is read from `web/data/processed/` or from split CSV parts via `loadCsvMaybeParts`.
