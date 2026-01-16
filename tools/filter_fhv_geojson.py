from __future__ import annotations

import json
from pathlib import Path

from shapely.geometry import Point, shape
from shapely.ops import unary_union
from shapely.prepared import prep


BOROUGHS_FILE = Path("web/data/geo/nyc_boroughs.geojson")
OUT_DIR = Path("web/data/processed/geo")

SOURCES = {
    "subway-stations": "web/data/geo/subway-stations.geojson",
    "bus-stops": "web/data/geo/bus-stops.geojson",
    "bike-shelters": "web/data/geo/bike-shelters.geojson",
    "for-hire-vehicles": "web/data/geo/for-hire-vehicles.geojson",
}


def main() -> None:
    if not BOROUGHS_FILE.exists():
        raise SystemExit(f"Missing boroughs file: {BOROUGHS_FILE}")
    boroughs = json.loads(BOROUGHS_FILE.read_text())

    borough_geoms = [shape(feature["geometry"]) for feature in boroughs.get("features", [])]
    if not borough_geoms:
        raise SystemExit("No borough geometries found.")

    union = unary_union(borough_geoms)
    prepared = prep(union)

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    for name, source in SOURCES.items():
        source_path = Path(source)
        if not source_path.exists():
            raise SystemExit(f"Missing source file: {source_path}")

        data = json.loads(source_path.read_text())
        filtered = []
        for feature in data.get("features", []):
            coords = feature.get("geometry", {}).get("coordinates")
            if not coords:
                continue
            point = Point(coords[0], coords[1])
            if prepared.contains(point) or prepared.intersects(point):
                filtered.append(feature)

        out_file = OUT_DIR / f"{name}_filtered.geojson"
        out_file.write_text(json.dumps({"type": "FeatureCollection", "features": filtered}))
        print(f"Wrote {out_file} with {len(filtered)} features")


if __name__ == "__main__":
    main()
