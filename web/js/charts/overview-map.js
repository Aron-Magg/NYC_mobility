// js/charts/overview-map.js
// Overview map with multiple infrastructure layers
(function () {
  async function initOverviewMap() {
    if (typeof d3 === "undefined") {
      console.error("D3 not found. Make sure d3.v7 is loaded before this script.");
      return;
    }

    const container = d3.select("#overview-map");
    if (container.empty()) return;

    const width = 900;
    const height = 520;
    const loadCsv = window.loadCsvMaybeParts || d3.csv;

    const svg = container
      .append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet");

    try {
      const [boroughs, subwayStations, busStops, bikeStations, fhv] = await Promise.all([
        d3.json("data/geo/nyc_boroughs.geojson"),
        d3.json("data/processed/geo/subway-stations_filtered.geojson"),
        d3.json("data/processed/geo/bus-stops_filtered.geojson"),
        loadCsv("data/processed/tripdata/top_start_stations.csv", (row) => ({
          station_name: row.station_name,
          lat: Number(row.lat),
          lng: Number(row.lng),
          trip_count: Number(row.trip_count),
        })),
        d3.json("data/processed/geo/for-hire-vehicles_filtered.geojson"),
      ]);

      if (!boroughs || !boroughs.features) {
        throw new Error('Invalid boroughs GeoJSON: missing "features" array.');
      }

      const projection = d3.geoMercator().fitSize([width, height], boroughs);
      const path = d3.geoPath().projection(projection);

      svg
        .append("g")
        .selectAll("path")
        .data(boroughs.features)
        .join("path")
        .attr("d", path)
        .attr("fill", "#2f2f2f")
        .attr("stroke", "#0a0a0a")
        .attr("stroke-width", 0.8)
        .attr("opacity", 1);

      const sampledBusStops = (() => {
        const features = busStops?.features || [];
        const target = 2500;
        if (features.length <= target) return features;
        const step = Math.ceil(features.length / target);
        return features.filter((_, index) => index % step === 0);
      })();

      const bikeFeatures = (bikeStations || [])
        .filter((d) => Number.isFinite(d.lat) && Number.isFinite(d.lng))
        .map((d) => ({
          geometry: { coordinates: [d.lng, d.lat] },
          properties: { station_name: d.station_name, trip_count: d.trip_count },
        }));

      const layers = {
        subway: {
          label: "Subway",
          color: "#da1009",
          data: subwayStations?.features || [],
          radius: 2.4,
        },
        bus: {
          label: "Bus",
          color: "#09d0da",
          data: sampledBusStops,
          radius: 1.6,
        },
        bike: {
          label: "Citi Bike",
          color: "#00C853",
          data: bikeFeatures,
          radius: 4.2,
        },
        taxi: {
          label: "Taxi/FHV",
          color: "#ede924",
          data: fhv?.features || [],
          radius: 1.9,
        },
      };

      const layerGroups = {};

      Object.entries(layers).forEach(([key, layer]) => {
        layerGroups[key] = svg
          .append("g")
          .attr("data-layer", key)
          .selectAll("circle")
          .data(layer.data)
          .join("circle")
          .attr("cx", (d) => projection(d.geometry.coordinates)[0])
          .attr("cy", (d) => projection(d.geometry.coordinates)[1])
          .attr("r", layer.radius)
          .attr("fill", layer.color)
          .attr("opacity", 0.75)
          .attr("stroke", "#101010")
          .attr("stroke-width", 0.3);
      });

      const legend = svg.append("g").attr("transform", "translate(24,24)");
      const layerState = Object.keys(layers).reduce((acc, key) => {
        acc[key] = true;
        return acc;
      }, {});

      const setLayerVisibility = () => {
        Object.keys(layerGroups).forEach((key) => {
          const isActive = layerState[key];
          layerGroups[key].attr("opacity", isActive ? 0.8 : 0.12);
          legend.select(`rect[data-layer='${key}']`).attr("opacity", isActive ? 1 : 0.35);
          legend.select(`text[data-layer='${key}']`).attr("opacity", isActive ? 1 : 0.5);
        });
      };

      const legendItems = legend
        .selectAll("g")
        .data(Object.entries(layers))
        .join("g")
        .attr("transform", (d, i) => `translate(0, ${i * 18})`)
        .attr("class", "overview-map__legend-item")
        .style("cursor", "pointer")
        .on("click", (event, [key]) => {
          layerState[key] = !layerState[key];
          setLayerVisibility();
        });

      legendItems
        .append("rect")
        .attr("data-layer", (d) => d[0])
        .attr("width", 10)
        .attr("height", 10)
        .attr("fill", (d) => d[1].color)
        .attr("rx", 2);

      legendItems
        .append("text")
        .attr("data-layer", (d) => d[0])
        .attr("x", 16)
        .attr("y", 9)
        .attr("fill", "#f2f3f4")
        .attr("font-size", 11)
        .text((d) => d[1].label);

      const legendNode = legend.node();
      if (legendNode) {
        const padding = 8;
        const bbox = legendNode.getBBox();
        legend
          .insert("rect", ":first-child")
          .attr("class", "overview-map__legend-box")
          .attr("x", bbox.x - padding)
          .attr("y", bbox.y - padding)
          .attr("width", bbox.width + padding * 2)
          .attr("height", bbox.height + padding * 2)
          .attr("rx", 8);
      }

      setLayerVisibility();
    } catch (err) {
      console.error("Error loading or rendering overview map:", err);
      container
        .append("p")
        .attr("class", "overview-map__error")
        .text("Unable to load the overview map. Check GeoJSON paths.");
    }
  }

  if (typeof window.registerLazyInit === "function") {
    window.registerLazyInit("#overview-map", initOverviewMap);
  } else if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initOverviewMap);
  } else {
    initOverviewMap();
  }
})();
