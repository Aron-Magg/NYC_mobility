// js/charts/taxis-map.js
// NYC boroughs + for-hire vehicles map
(function () {
  async function initTaxisMap() {
    if (typeof d3 === "undefined") {
      console.error("D3 not found. Make sure d3.v7 is loaded before this script.");
      return;
    }

    const container = d3.select("#taxis-map");
    if (container.empty()) return;

    const width = 900;
    const height = 500;

    const svg = container
      .append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet");

    try {
      const [boroughs, fhv] = await Promise.all([
        d3.json("data/geo/nyc_boroughs.geojson"),
        d3.json("data/geo/for-hire-vehicles.geojson"),
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
        .attr("class", "taxis-map__borough")
        .attr("d", path);

      if (fhv && Array.isArray(fhv.features)) {
        svg
          .append("g")
          .selectAll("circle")
          .data(fhv.features)
          .join("circle")
          .attr("class", "taxis-map__vehicle")
          .attr("cx", (d) => projection(d.geometry.coordinates)[0])
          .attr("cy", (d) => projection(d.geometry.coordinates)[1])
          .attr("r", 1.9)
          .append("title")
          .text("FHV / taxi punto");
      }
    } catch (err) {
      console.error("Error loading or rendering NYC taxis map:", err);
      container
        .append("p")
        .attr("class", "taxis-map__error")
        .text("Impossibile caricare la mappa taxi (controlla i file GeoJSON).");
    }
  }

  if (typeof window.registerLazyInit === "function") {
    window.registerLazyInit("#taxis-map", initTaxisMap);
  } else if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initTaxisMap);
  } else {
    initTaxisMap();
  }
})();
