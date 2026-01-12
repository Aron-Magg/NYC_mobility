// js/charts/buses-map.js
// NYC boroughs + bus stops map
(async function initBusesMap() {
  if (typeof d3 === "undefined") {
    console.error("D3 not found. Make sure d3.v7 is loaded before this script.");
    return;
  }

  const container = d3.select("#buses-map");
  if (container.empty()) return;

  const width = 900;
  const height = 500;

  const svg = container
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  try {
    const [boroughs, busStops] = await Promise.all([
      d3.json("data/geo/nyc_boroughs.geojson"),
      d3.json("data/geo/bus-stops.geojson"),
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
      .attr("class", "buses-map__borough")
      .attr("d", path);

    if (busStops && Array.isArray(busStops.features)) {
      svg
        .append("g")
        .selectAll("circle")
        .data(busStops.features)
        .join("circle")
        .attr("class", "buses-map__stop")
        .attr("cx", (d) => projection(d.geometry.coordinates)[0])
        .attr("cy", (d) => projection(d.geometry.coordinates)[1])
        .attr("r", 1.3)
        .append("title")
        .text("Fermata bus");
    }
  } catch (err) {
    console.error("Error loading or rendering NYC bus map:", err);
    container
      .append("p")
      .attr("class", "buses-map__error")
      .text("Impossibile caricare la mappa bus (controlla i file GeoJSON).");
  }
})();
