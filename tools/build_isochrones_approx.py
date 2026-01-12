from __future__ import annotations

import json
import math
from pathlib import Path


OUT_DIR = Path("web/data/processed/isochrones")
OUT_FILE = OUT_DIR / "grand_central_approx_isochrones.geojson"

# Grand Central Terminal (WGS84)
CENTER_LAT = 40.752726
CENTER_LNG = -73.977229

MODES = {
    "walking": 4.8,  # km/h
    "cycling": 15.0,
    "driving": 30.0,
}

MINUTES = [5, 10, 15]
POINTS_PER_RING = 96
EARTH_RADIUS_KM = 6371.0


def ring_coordinates(lat: float, lng: float, radius_km: float) -> list[list[float]]:
    coords = []
    lat_rad = math.radians(lat)
    lng_rad = math.radians(lng)
    angular = radius_km / EARTH_RADIUS_KM

    for i in range(POINTS_PER_RING + 1):
        bearing = 2 * math.pi * (i / POINTS_PER_RING)
        sin_lat = math.sin(lat_rad)
        cos_lat = math.cos(lat_rad)
        sin_ang = math.sin(angular)
        cos_ang = math.cos(angular)

        lat2 = math.asin(sin_lat * cos_ang + cos_lat * sin_ang * math.cos(bearing))
        lng2 = lng_rad + math.atan2(
            math.sin(bearing) * sin_ang * cos_lat,
            cos_ang - sin_lat * math.sin(lat2),
        )

        coords.append([math.degrees(lng2), math.degrees(lat2)])

    return coords


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    features = []
    for mode, speed_kmh in MODES.items():
        for minutes in MINUTES:
            distance_km = speed_kmh * (minutes / 60)
            ring = ring_coordinates(CENTER_LAT, CENTER_LNG, distance_km)
            features.append(
                {
                    "type": "Feature",
                    "geometry": {"type": "Polygon", "coordinates": [ring]},
                    "properties": {
                        "mode": mode,
                        "minutes": minutes,
                        "distance_km": round(distance_km, 2),
                    },
                }
            )

    geojson = {"type": "FeatureCollection", "features": features}
    OUT_FILE.write_text(json.dumps(geojson))
    print(f"Wrote {OUT_FILE}")


if __name__ == "__main__":
    main()
