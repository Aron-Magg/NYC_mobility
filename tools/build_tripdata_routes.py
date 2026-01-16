from __future__ import annotations

import csv
import json
from dataclasses import dataclass
from pathlib import Path

try:
    from tqdm import tqdm
except ImportError:  # pragma: no cover
    def tqdm(iterable=None, **kwargs):
        return iterable if iterable is not None else []

import networkx as nx
import osmnx as ox
from pyproj import Transformer
from shapely.geometry import LineString
from shapely.ops import transform as geom_transform


INPUT_CSV = Path("data/processed/tripdata/top_flows.csv")
OUT_DIR = Path("web/data/processed/tripdata")
OUT_GEOJSON = OUT_DIR / "top_routes.geojson"
OUT_CSV = OUT_DIR / "top_routes.csv"

TARGET_ROUTES = 10
CANDIDATE_LIMIT = 30
PAD_DEGREES = 0.02


def add_edge_lengths_safe(graph: nx.MultiDiGraph) -> nx.MultiDiGraph:
    if hasattr(ox, "add_edge_lengths"):
        return ox.add_edge_lengths(graph)
    return ox.distance.add_edge_lengths(graph)


@dataclass
class RouteCandidate:
    start_station_id: str
    start_station_name: str
    start_lat: float
    start_lng: float
    end_station_id: str
    end_station_name: str
    end_lat: float
    end_lng: float
    trip_count: int


def load_candidates(path: Path) -> list[RouteCandidate]:
    if not path.exists():
        raise SystemExit(f"Missing input CSV: {path}")

    candidates: list[RouteCandidate] = []
    with path.open(newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            try:
                start_lng = float(row["start_lng"])
                start_lat = float(row["start_lat"])
                end_lng = float(row["end_lng"])
                end_lat = float(row["end_lat"])
                trip_count = int(float(row["trip_count"]))
            except (KeyError, TypeError, ValueError):
                continue

            if row.get("start_station_id") == row.get("end_station_id"):
                continue

            candidates.append(
                RouteCandidate(
                    start_station_id=row.get("start_station_id", ""),
                    start_station_name=row.get("start_station_name", ""),
                    start_lat=start_lat,
                    start_lng=start_lng,
                    end_station_id=row.get("end_station_id", ""),
                    end_station_name=row.get("end_station_name", ""),
                    end_lat=end_lat,
                    end_lng=end_lng,
                    trip_count=trip_count,
                )
            )

    return sorted(candidates, key=lambda d: d.trip_count, reverse=True)


def compute_bbox(candidates: list[RouteCandidate]) -> tuple[float, float, float, float]:
    min_lat = min(min(c.start_lat, c.end_lat) for c in candidates)
    max_lat = max(max(c.start_lat, c.end_lat) for c in candidates)
    min_lng = min(min(c.start_lng, c.end_lng) for c in candidates)
    max_lng = max(max(c.start_lng, c.end_lng) for c in candidates)

    west = min_lng - PAD_DEGREES
    south = min_lat - PAD_DEGREES
    east = max_lng + PAD_DEGREES
    north = max_lat + PAD_DEGREES

    # OSMnx 2.0 expects bbox as (left, bottom, right, top)
    return (west, south, east, north)


def build_graph(west: float, south: float, east: float, north: float) -> nx.MultiDiGraph:
    ox.settings.use_cache = True
    ox.settings.log_console = False
    ox.settings.requests_timeout = 180

    bbox = (west, south, east, north)

    try:
        graph = ox.graph_from_bbox(
            bbox,
            network_type="bike",
            simplify=True,
            retain_all=False,
            truncate_by_edge=True,
        )
    except TypeError:
        try:
            graph = ox.graph_from_bbox(
                bbox=(west, south, east, north),
                network_type="bike",
                simplify=True,
                retain_all=False,
                truncate_by_edge=True,
            )
        except TypeError:
            # Older OSMnx versions expect positional bbox arguments.
            graph = ox.graph_from_bbox(
                north,
                south,
                east,
                west,
                network_type="bike",
                simplify=True,
                retain_all=False,
                truncate_by_edge=True,
            )

    return add_edge_lengths_safe(graph)


def route_to_linestring(graph: nx.MultiDiGraph, route: list[int]) -> LineString | None:
    coords: list[tuple[float, float]] = []

    for u, v in zip(route[:-1], route[1:]):
        data = graph.get_edge_data(u, v) or {}
        if not data:
            continue
        edge = min(data.values(), key=lambda d: d.get("length", 0))
        geometry = edge.get("geometry")
        if geometry is None:
            coords.append((graph.nodes[u]["x"], graph.nodes[u]["y"]))
            coords.append((graph.nodes[v]["x"], graph.nodes[v]["y"]))
        else:
            coords.extend(list(geometry.coords))

    cleaned: list[tuple[float, float]] = []
    for point in coords:
        if not cleaned or point != cleaned[-1]:
            cleaned.append(point)

    if len(cleaned) < 2:
        return None

    return LineString(cleaned)


def main() -> None:
    steps = tqdm(total=3, desc="Preparing routing", unit="step")
    candidates = load_candidates(INPUT_CSV)
    if not candidates:
        raise SystemExit("No valid candidates found in top_flows.csv")
    steps.update(1)

    candidates = candidates[:CANDIDATE_LIMIT]
    west, south, east, north = compute_bbox(candidates)

    print("Building bike network graph...")
    graph = build_graph(west, south, east, north)
    steps.update(1)
    graph_proj = ox.project_graph(graph)
    steps.update(1)
    steps.close()

    transformer_to_proj = Transformer.from_crs("EPSG:4326", graph_proj.graph["crs"], always_xy=True)
    transformer_to_wgs = Transformer.from_crs(graph_proj.graph["crs"], "EPSG:4326", always_xy=True)

    features: list[dict] = []
    csv_rows: list[dict] = []

    for index, candidate in enumerate(tqdm(candidates, desc="Routing top trips")):
        if len(features) >= TARGET_ROUTES:
            break

        start_x, start_y = transformer_to_proj.transform(candidate.start_lng, candidate.start_lat)
        end_x, end_y = transformer_to_proj.transform(candidate.end_lng, candidate.end_lat)

        try:
            start_node = ox.distance.nearest_nodes(graph_proj, start_x, start_y)
            end_node = ox.distance.nearest_nodes(graph_proj, end_x, end_y)
            route = nx.shortest_path(graph_proj, start_node, end_node, weight="length")
        except Exception as exc:
            print(f"[WARN] Skip route {candidate.start_station_name} -> {candidate.end_station_name}: {exc}")
            continue

        line_proj = route_to_linestring(graph_proj, route)
        if not line_proj:
            print(f"[WARN] Empty route {candidate.start_station_name} -> {candidate.end_station_name}")
            continue

        line_wgs = geom_transform(transformer_to_wgs.transform, line_proj)

        feature = {
            "type": "Feature",
            "geometry": line_wgs.__geo_interface__,
            "properties": {
                "route_id": f"route_{index + 1}",
                "start_station_id": candidate.start_station_id,
                "start_station_name": candidate.start_station_name,
                "end_station_id": candidate.end_station_id,
                "end_station_name": candidate.end_station_name,
                "trip_count": candidate.trip_count,
                "distance_m": float(line_proj.length),
            },
        }
        features.append(feature)

        csv_rows.append(
            {
                "route_id": feature["properties"]["route_id"],
                "start_station_name": candidate.start_station_name,
                "end_station_name": candidate.end_station_name,
                "trip_count": candidate.trip_count,
                "distance_m": f"{line_proj.length:.1f}",
                "coords": json.dumps(list(line_wgs.coords)),
            }
        )

    if not features:
        raise SystemExit("No routes could be built from the candidate list.")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    OUT_GEOJSON.write_text(json.dumps({"type": "FeatureCollection", "features": features}, indent=2))

    with OUT_CSV.open("w", newline="") as handle:
        fieldnames = [
            "route_id",
            "start_station_name",
            "end_station_name",
            "trip_count",
            "distance_m",
            "coords",
        ]
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(csv_rows)

    print(f"Saved {len(features)} routes to {OUT_GEOJSON}")
    print(f"Saved CSV summary to {OUT_CSV}")


if __name__ == "__main__":
    main()
