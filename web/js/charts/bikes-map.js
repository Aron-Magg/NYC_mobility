// js/charts/bikes-map.js
// NYC boroughs + bike shelters map
(function () {
  async function initBikesMap() {
    if (typeof d3 === "undefined") {
      console.error("D3 not found. Make sure d3.v7 is loaded before this script.");
      return;
    }

    const container = d3.select("#bikes-map");
    if (container.empty()) return;

    const width = 900;
    const height = 500;

    const svg = container
      .append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet");

    try {
      const [boroughs, bikeShelters] = await Promise.all([
        d3.json("data/geo/nyc_boroughs.geojson"),
        d3.json("data/geo/bike-shelters.geojson"),
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
        .attr("class", "bikes-map__borough")
        .attr("d", path);

      if (bikeShelters && Array.isArray(bikeShelters.features)) {
        svg
          .append("g")
          .selectAll("circle")
          .data(bikeShelters.features)
          .join("circle")
          .attr("class", "bikes-map__station")
          .attr("cx", (d) => projection(d.geometry.coordinates)[0])
          .attr("cy", (d) => projection(d.geometry.coordinates)[1])
          .attr("r", 4)
          .append("title")
          .text("Bike shelter");
      }
    } catch (err) {
      console.error("Error loading or rendering NYC bikes map:", err);
      container
        .append("p")
        .attr("class", "bikes-map__error")
        .text("Impossibile caricare la mappa bike (controlla i file GeoJSON).");
    }
  }

  if (typeof window.registerLazyInit === "function") {
    window.registerLazyInit("#bikes-map", initBikesMap);
  } else if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initBikesMap);
  } else {
    initBikesMap();
  }
})();
