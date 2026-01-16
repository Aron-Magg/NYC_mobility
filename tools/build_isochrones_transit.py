from __future__ import annotations

import json
import math
from pathlib import Path

try:
    from tqdm import tqdm
except ImportError:  # pragma: no cover - fallback when tqdm is unavailable
    def tqdm(iterable=None, **kwargs):
        return iterable if iterable is not None else []

import networkx as nx
import osmnx as ox
from pyproj import Transformer
from shapely.geometry import MultiPoint
from shapely.ops import transform as geom_transform


OUT_DIR = Path("web/data/processed/isochrones")
OUT_FILE = OUT_DIR / "grand_central_transit_isochrones.geojson"
FULL_FILE = OUT_DIR / "grand_central_full_isochrones.geojson"

BUS_STOPS = Path("web/data/processed/geo/bus-stops_filtered.geojson")
SUBWAY_STATIONS = Path("web/data/processed/geo/subway-stations_filtered.geojson")

# Grand Central Terminal (WGS84)
CENTER_LAT = 40.752726
CENTER_LNG = -73.977229

MINUTES = [5, 10, 20, 30, 40]
POINTS_PER_RING = 96

EARTH_RADIUS_M = 6_371_000.0

MODE_CIRCLES = {
    "walking": 4.8,
    "cycling": 15.0,
    "driving": 30.0,
}

MODE_NETWORKS = {
    "bus": {
        "speed_kmh": 14.0,
        "source": BUS_STOPS,
        "buffer_m": 160,
        "stop_buffer_m": 220,
        "start_buffer_m": 600,
    },
    "subway": {
        "speed_kmh": 30.0,
        "source": SUBWAY_STATIONS,
        "buffer_m": 220,
        "stop_buffer_m": 450,
        "start_buffer_m": 800,
    },
}


def ring_coordinates(lat: float, lng: float, radius_m: float) -> list[list[float]]:
    coords = []
    lat_rad = math.radians(lat)
    lng_rad = math.radians(lng)
    angular = radius_m / EARTH_RADIUS_M

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


def add_edge_lengths_safe(graph: nx.MultiDiGraph) -> nx.MultiDiGraph:
    if hasattr(ox, "add_edge_lengths"):
        return ox.add_edge_lengths(graph)
    return ox.distance.add_edge_lengths(graph)


def build_drive_graph(radius_m: int) -> nx.MultiDiGraph:
    ox.settings.use_cache = True
    ox.settings.log_console = False
    ox.settings.requests_timeout = 180
    graph = ox.graph_from_point(
        (CENTER_LAT, CENTER_LNG),
        dist=radius_m,
        network_type="drive",
        simplify=True,
    )
    return add_edge_lengths_safe(graph)


def add_travel_time(graph: nx.MultiDiGraph, speed_kmh: float) -> nx.MultiDiGraph:
    speed_m_s = speed_kmh * 1000 / 3600
    for _, _, _, data in graph.edges(keys=True, data=True):
        length = data.get("length", 0)
        data["travel_time"] = length / speed_m_s if speed_m_s > 0 else 0
    return graph


def load_points(path: Path) -> list[tuple[float, float]]:
    if not path.exists():
        raise SystemExit(f"Missing GeoJSON file: {path}")
    data = json.loads(path.read_text())
    points = []
    for feature in data.get("features", []):
        coords = feature.get("geometry", {}).get("coordinates")
        if not coords:
            continue
        lng, lat = coords[:2]
        points.append((lat, lng))
    return points


def station_grid(
    stations_xy: list[tuple[float, float]],
    cell_size: float,
) -> dict[tuple[int, int], list[tuple[float, float]]]:
    grid: dict[tuple[int, int], list[tuple[float, float]]] = {}
    for x, y in stations_xy:
        cell = (int(x // cell_size), int(y // cell_size))
        grid.setdefault(cell, []).append((x, y))
    return grid


def nodes_near_stations(
    graph_proj: nx.MultiDiGraph,
    stations_xy: list[tuple[float, float]],
    stop_buffer_m: float,
    center_xy: tuple[float, float],
    start_buffer_m: float,
) -> set[int]:
    if not stations_xy:
        return set()

    grid = station_grid(stations_xy, stop_buffer_m)
    allowed: set[int] = set()
    stop_buffer_sq = stop_buffer_m ** 2
    start_buffer_sq = start_buffer_m ** 2

    for node_id, data in tqdm(graph_proj.nodes(data=True), desc="Filtering nodes", leave=False):
        x = data.get("x")
        y = data.get("y")
        if x is None or y is None:
            continue

        dx_center = x - center_xy[0]
        dy_center = y - center_xy[1]
        if dx_center * dx_center + dy_center * dy_center <= start_buffer_sq:
            allowed.add(node_id)
            continue

        cell = (int(x // stop_buffer_m), int(y // stop_buffer_m))
        found = False
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for sx, sy in grid.get((cell[0] + dx, cell[1] + dy), []):
                    dx_stop = x - sx
                    dy_stop = y - sy
                    if dx_stop * dx_stop + dy_stop * dy_stop <= stop_buffer_sq:
                        allowed.add(node_id)
                        found = True
                        break
                if found:
                    break
            if found:
                break

    return allowed


def isochrone_polygon(
    graph_proj: nx.MultiDiGraph,
    center_node: int,
    minutes: int,
    buffer_m: float,
    transformer: Transformer,
) -> dict | None:
    cutoff = minutes * 60
    lengths = nx.single_source_dijkstra_path_length(
        graph_proj,
        center_node,
        cutoff=cutoff,
        weight="travel_time",
    )
    if not lengths:
        return None

    points = [
        (graph_proj.nodes[node]["x"], graph_proj.nodes[node]["y"])
        for node in lengths.keys()
    ]
    merged = MultiPoint(points).buffer(buffer_m)
    if merged.is_empty:
        return None

    geo_shape = geom_transform(transformer.transform, merged)
    return geo_shape.__geo_interface__


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    features: list[dict] = []
    if FULL_FILE.exists():
        data = json.loads(FULL_FILE.read_text())
        for feature in data.get("features", []):
            mode = feature.get("properties", {}).get("mode")
            if mode in {"walking", "cycling", "driving"}:
                features.append(feature)

    if not features:
        for mode, speed_kmh in tqdm(MODE_CIRCLES.items(), desc="Building circle modes"):
            for minutes in tqdm(MINUTES, desc=f"{mode} rings", leave=False):
                distance_m = speed_kmh * (minutes / 60) * 1000
                ring = ring_coordinates(CENTER_LAT, CENTER_LNG, distance_m)
                features.append(
                    {
                        "type": "Feature",
                        "geometry": {"type": "Polygon", "coordinates": [ring]},
                        "properties": {
                            "mode": mode,
                            "minutes": minutes,
                            "distance_km": round(distance_m / 1000, 2),
                            "method": "circle-approx",
                        },
                    }
                )

    max_speed = max(config["speed_kmh"] for config in MODE_NETWORKS.values())
    radius_m = int(max_speed * (max(MINUTES) / 60) * 1000 * 1.1)
    radius_m = max(12_000, min(radius_m, 24_000))

    with tqdm(total=1, desc="Downloading drive network", unit="graph") as bar:
        base_graph = build_drive_graph(radius_m)
        bar.update(1)

    graph_proj = ox.project_graph(base_graph)
    crs = graph_proj.graph.get("crs", "EPSG:3857")
    transformer_to_proj = Transformer.from_crs("EPSG:4326", crs, always_xy=True)
    transformer_to_wgs = Transformer.from_crs(crs, "EPSG:4326", always_xy=True)
    center_x, center_y = transformer_to_proj.transform(CENTER_LNG, CENTER_LAT)

    for mode, config in tqdm(MODE_NETWORKS.items(), desc="Building network modes"):
        points = load_points(config["source"])
        if not points:
            continue

        stops_xy = [transformer_to_proj.transform(lng, lat) for lat, lng in points]
        allowed_nodes = nodes_near_stations(
            graph_proj,
            stops_xy,
            config["stop_buffer_m"],
            (center_x, center_y),
            config["start_buffer_m"],
        )
        if not allowed_nodes:
            continue

        subgraph = graph_proj.subgraph(allowed_nodes).copy()
        add_travel_time(subgraph, config["speed_kmh"])

        center_node = min(
            subgraph.nodes,
            key=lambda node: math.hypot(
                subgraph.nodes[node]["x"] - center_x,
                subgraph.nodes[node]["y"] - center_y,
            ),
        )

        for minutes in tqdm(MINUTES, desc=f"{mode} rings", leave=False):
            geometry = isochrone_polygon(
                subgraph,
                center_node,
                minutes,
                config["buffer_m"],
                transformer_to_wgs,
            )
            if not geometry:
                continue
            features.append(
                {
                    "type": "Feature",
                    "geometry": geometry,
                    "properties": {
                        "mode": mode,
                        "minutes": minutes,
                        "speed_kmh": config["speed_kmh"],
                        "source": config["source"].name,
                        "method": "street-network",
                    },
                }
            )

    geojson = {"type": "FeatureCollection", "features": features}
    OUT_FILE.write_text(json.dumps(geojson))
    print(f"Wrote {OUT_FILE}")


if __name__ == "__main__":
    main()
