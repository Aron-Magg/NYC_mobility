// js/charts/walking-map.js
// NYC boroughs only (no walking-specific points yet)

(async function initWalkingMap() {
  const container = d3.select("#walking-map");
  if (container.empty()) return;

  const width = 900;
  const height = 500;

  const svg = container
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  try {
    const boroughs = await d3.json("data/geo/nyc_boroughs.geojson");

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
      .attr("class", "walking-map__borough")
      .attr("d", path);
  } catch (err) {
    console.error("Error loading or rendering NYC walking map:", err);
    container
      .append("p")
      .attr("class", "walking-map__error")
      .text("Unable to load walking map data (check file paths and format).");
  }

  const viewRadios = document.querySelectorAll(
    'input[name="walking-map-view"]',
  );
  viewRadios.forEach((radio) => {
    radio.addEventListener("change", (event) => {
      const value = event.target.value;
      console.log("Selected walking map view:", value);
    });
  });
})();
