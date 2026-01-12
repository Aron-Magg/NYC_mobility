// js/charts/subway-map.js
// NYC boroughs + subway stations and entrances map
(async function initSubwayMap() {
  if (typeof d3 === "undefined") {
    console.error("D3 not found. Make sure d3.v7 is loaded before this script.");
    return;
  }

  const container = d3.select("#subway-map");
  if (container.empty()) return;

  const width = 900;
  const height = 500;

  const svg = container
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  try {
    const [boroughs, stations, entrances] = await Promise.all([
      d3.json("data/geo/nyc_boroughs.geojson"),
      d3.json("data/geo/subway-stations.geojson"),
      d3.json("data/geo/subway-entrances.geojson"),
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
      .attr("class", "subway-map__borough")
      .attr("d", path);

    if (stations && Array.isArray(stations.features)) {
      svg
        .append("g")
        .selectAll("circle")
        .data(stations.features)
        .join("circle")
        .attr("class", "subway-map__station")
        .attr("cx", (d) => projection(d.geometry.coordinates)[0])
        .attr("cy", (d) => projection(d.geometry.coordinates)[1])
        .attr("r", 2.5)
        .append("title")
        .text((d) => d.properties?.name || "Stazione metro");
    }

    if (entrances && Array.isArray(entrances.features)) {
      svg
        .append("g")
        .selectAll("circle")
        .data(entrances.features)
        .join("circle")
        .attr("class", "subway-map__entrance")
        .attr("cx", (d) => projection(d.geometry.coordinates)[0])
        .attr("cy", (d) => projection(d.geometry.coordinates)[1])
        .attr("r", 1.5)
        .append("title")
        .text("Ingresso metro");
    }
  } catch (err) {
    console.error("Error loading or rendering NYC subway map:", err);
    container
      .append("p")
      .attr("class", "subway-map__error")
      .text("Impossibile caricare la mappa metro (controlla i file GeoJSON).");
  }
})();
