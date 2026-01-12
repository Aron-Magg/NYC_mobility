from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import networkx as nx
import osmnx as ox
from pyproj import Transformer
from shapely.geometry import mapping, Point, Polygon
from shapely.ops import transform as geom_transform
from shapely.ops import unary_union


OUT_DIR = Path("web/data/processed/isochrones")
OUT_FILE = OUT_DIR / "grand_central_full_isochrones.geojson"

# Grand Central Terminal (WGS84)
CENTER_LAT = 40.752726
CENTER_LNG = -73.977229

# Travel times (minutes) and mode speeds (km/h)
MINUTES = [5, 10, 15]


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

# Graph download radius around Grand Central (meters)
GRAPH_RADIUS_M = 9000

# Buffer (meters) used to turn reachable nodes into a polygon
BUFFER_M = 200


def add_edge_lengths_safe(graph: nx.MultiDiGraph) -> nx.MultiDiGraph:
    if hasattr(ox, "add_edge_lengths"):
        return ox.add_edge_lengths(graph)
    return ox.distance.add_edge_lengths(graph)


def build_graph(network_type: str) -> nx.MultiDiGraph:
    graph = ox.graph_from_point(
        (CENTER_LAT, CENTER_LNG),
        dist=GRAPH_RADIUS_M,
        network_type=network_type,
        simplify=True,
    )
    graph = add_edge_lengths_safe(graph)
    return graph


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


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    graphs = {}
    for mode in MODES:
        if mode.network not in graphs:
            graphs[mode.network] = build_graph(mode.network)

    features = []
    for mode in MODES:
        graph = add_travel_time(graphs[mode.network].copy(), mode.speed_kmh)
        for minutes in MINUTES:
            poly = isochrone_polygon(graph, minutes)
            if not poly:
                continue
            features.append(
                {
                    "type": "Feature",
                    "geometry": mapping(poly),
                    "properties": {
                        "mode": mode.key,
                        "label": mode.label,
                        "minutes": minutes,
                        "speed_kmh": mode.speed_kmh,
                        "method": "street-network-approx",
                        "center": "Grand Central Terminal",
                    },
                }
            )

    geojson = {"type": "FeatureCollection", "features": features}
    OUT_FILE.write_text(json.dumps(geojson))
    print(f"Wrote {OUT_FILE}")


if __name__ == "__main__":
    main()
