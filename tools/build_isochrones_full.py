from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
import math
import time

import networkx as nx
import osmnx as ox
from pyproj import Transformer
from shapely.geometry import mapping, Point, Polygon
from shapely.ops import transform as geom_transform
from shapely.ops import unary_union
from requests.exceptions import ChunkedEncodingError, RequestException
from tqdm import tqdm


OUT_DIR = Path("web/data/processed/isochrones")
OUT_FILE = OUT_DIR / "grand_central_full_isochrones.geojson"

# Grand Central Terminal (WGS84)
CENTER_LAT = 40.752726
CENTER_LNG = -73.977229

# Travel times (minutes) and mode speeds (km/h)
MINUTES = [5, 10, 20, 30, 40]

# Use street-network isochrones up to this limit. Longer ranges use circles.
MAX_NETWORK_MINUTES = 60

# Cap the graph radius to avoid excessive memory usage.
MIN_GRAPH_RADIUS_M = 10_000
MAX_GRAPH_RADIUS_M = 25_000

OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.nchc.org.tw/api/interpreter",
]


@dataclass(frozen=True)
class Mode:
    key: str
    label: str
    speed_kmh: float
    network: str


MODES = [
    Mode(key="walking", label="Walking", speed_kmh=4.8, network="walk"),
    Mode(key="cycling", label="Bike", speed_kmh=15.0, network="bike"),
    Mode(key="driving", label="Taxi/FHV", speed_kmh=25.0, network="drive"),
    Mode(key="bus", label="Bus (approx)", speed_kmh=18.0, network="drive"),
    Mode(key="subway", label="Subway (approx)", speed_kmh=30.0, network="drive"),
]

# Buffer (meters) used to turn reachable nodes into a polygon
BUFFER_M = 200


def add_edge_lengths_safe(graph: nx.MultiDiGraph) -> nx.MultiDiGraph:
    if hasattr(ox, "add_edge_lengths"):
        return ox.add_edge_lengths(graph)
    return ox.distance.add_edge_lengths(graph)


def build_graph(network_type: str, radius_m: int, retries: int = 3) -> nx.MultiDiGraph:
    ox.settings.requests_timeout = 180
    ox.settings.use_cache = True
    ox.settings.log_console = False

    for attempt in range(1, retries + 1):
        endpoint = OVERPASS_ENDPOINTS[(attempt - 1) % len(OVERPASS_ENDPOINTS)]
        ox.settings.overpass_endpoint = endpoint

        try:
            graph = ox.graph_from_point(
                (CENTER_LAT, CENTER_LNG),
                dist=radius_m,
                network_type=network_type,
                simplify=True,
            )
            graph = add_edge_lengths_safe(graph)
            return graph
        except (ChunkedEncodingError, RequestException, ConnectionError) as exc:
            if attempt >= retries:
                raise RuntimeError(
                    f"Failed to download {network_type} graph after {retries} attempts."
                ) from exc
            wait_s = 20 * attempt
            print(f"[WARN] Overpass error ({network_type}). Retry {attempt}/{retries} in {wait_s}s...")
            time.sleep(wait_s)


def add_travel_time(graph: nx.MultiDiGraph, speed_kmh: float) -> nx.MultiDiGraph:
    speed_m_s = speed_kmh * 1000 / 3600
    for _, _, key, data in graph.edges(keys=True, data=True):
        length = data.get("length", 0)
        data["travel_time"] = length / speed_m_s if speed_m_s > 0 else 0
    return graph


def graph_to_gdfs_safe(graph: nx.MultiDiGraph):
    if hasattr(ox, "graph_to_gdfs"):
        return ox.graph_to_gdfs(graph, edges=False)
    return ox.utils_graph.graph_to_gdfs(graph, edges=False)


def isochrone_polygon(graph: nx.MultiDiGraph, minutes: int) -> Polygon | None:
    center_node = ox.distance.nearest_nodes(graph, CENTER_LNG, CENTER_LAT)
    cutoff = minutes * 60
    lengths = nx.single_source_dijkstra_path_length(graph, center_node, cutoff=cutoff, weight="travel_time")
    if not lengths:
        return None

    nodes = list(lengths.keys())
    gdf_nodes = graph_to_gdfs_safe(graph).loc[nodes]
    if gdf_nodes.empty:
        return None

    # Project to meters for buffering
    graph_proj = ox.project_graph(graph)
    gdf_nodes_proj = graph_to_gdfs_safe(graph_proj).loc[nodes]

    buffers = gdf_nodes_proj.geometry.buffer(BUFFER_M)
    merged = unary_union(buffers)

    if merged.is_empty:
        return None

    # Reproject back to WGS84
    source_crs = graph_proj.graph.get("crs", "EPSG:3857")
    transformer = Transformer.from_crs(source_crs, "EPSG:4326", always_xy=True)
    merged_wgs = geom_transform(transformer.transform, merged)

    if isinstance(merged_wgs, Point):
        return merged_wgs.buffer(0.001)
    return merged_wgs


def ring_coordinates(lat: float, lng: float, radius_km: float, points: int = 96) -> list[list[float]]:
    coords = []
    lat_rad = math.radians(lat)
    lng_rad = math.radians(lng)
    angular = radius_km / 6371.0

    for i in range(points + 1):
        bearing = 2 * math.pi * (i / points)
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


def circle_polygon(speed_kmh: float, minutes: int) -> Polygon:
    radius_km = speed_kmh * (minutes / 60)
    ring = ring_coordinates(CENTER_LAT, CENTER_LNG, radius_km)
    return Polygon(ring)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    max_minutes = max(MINUTES)
    networks = {}
    for mode in MODES:
        networks.setdefault(mode.network, []).append(mode.speed_kmh)

    graphs = {}
    with tqdm(total=len(networks), desc="Building graphs", unit="graph") as bar:
        for network_type, speeds in networks.items():
            max_speed = max(speeds)
            radius_m = int(max_speed * (MAX_NETWORK_MINUTES / 60) * 1000 * 1.1)
            radius_m = max(min(radius_m, MAX_GRAPH_RADIUS_M), MIN_GRAPH_RADIUS_M)
            bar.set_postfix_str(f"{network_type} ~{radius_m/1000:.0f}km")
            graphs[network_type] = build_graph(network_type, radius_m)
            bar.update(1)

    features = []
    total_steps = len(MODES) * len(MINUTES)
    with tqdm(total=total_steps, desc="Isochrones", unit="ring") as bar:
        for mode in MODES:
            graph = add_travel_time(graphs[mode.network].copy(), mode.speed_kmh)
            for minutes in MINUTES:
                bar.set_postfix_str(f"{mode.key} {minutes}min")

                if minutes > MAX_NETWORK_MINUTES:
                    poly = circle_polygon(mode.speed_kmh, minutes)
                    method = "circle-approx"
                else:
                    poly = isochrone_polygon(graph, minutes)
                    method = "street-network"

                if poly:
                    features.append(
                        {
                            "type": "Feature",
                            "geometry": mapping(poly),
                            "properties": {
                                "mode": mode.key,
                                "label": mode.label,
                                "minutes": minutes,
                                "speed_kmh": mode.speed_kmh,
                                "method": method,
                                "center": "Grand Central Terminal",
                            },
                        }
                    )
                bar.update(1)

    geojson = {"type": "FeatureCollection", "features": features}
    OUT_FILE.write_text(json.dumps(geojson))
    print(f"Wrote {OUT_FILE}")


if __name__ == "__main__":
    main()
