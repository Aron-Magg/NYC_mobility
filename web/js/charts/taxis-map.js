// js/charts/taxis-map.js
// NYC boroughs + for-hire vehicles (taxis) map

(async function initTaxisMap() {
  const container = d3.select("#taxis-map");
  if (container.empty()) return;

  const width = 900;
  const height = 500;

  const svg = container
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  try {
    const [boroughs, vehicles] = await Promise.all([
      d3.json("data/geo/nyc_boroughs.geojson"),
      d3.json("data/geo/for-hire-vehicles.geojson"),
    ]);

    if (!boroughs || !boroughs.features) {
      throw new Error('Invalid boroughs GeoJSON: missing "features" array.');
    }

    const projection = d3.geoMercator().fitSize([width, height], boroughs);
    const path = d3.geoPath().projection(projection);

    // Borough polygons
    svg
      .append("g")
      .selectAll("path")
      .data(boroughs.features)
      .join("path")
      .attr("class", "taxis-map__borough")
      .attr("d", path);

    // For-hire vehicle points (if data is present)
    if (vehicles && Array.isArray(vehicles.features)) {
      const pointFeatures = vehicles.features.filter(
        (f) =>
          f.geometry &&
          f.geometry.type === "Point" &&
          Array.isArray(f.geometry.coordinates),
      );

      svg
        .append("g")
        .selectAll("circle")
        .data(pointFeatures)
        .join("circle")
        .attr("class", "taxis-map__vehicle")
        .attr("transform", (d) => {
          const [x, y] = projection(d.geometry.coordinates);
          return `translate(${x}, ${y})`;
        })
        .attr("r", 1.8);
    }
  } catch (err) {
    console.error("Error loading or rendering NYC taxis map:", err);
    container
      .append("p")
      .attr("class", "taxis-map__error")
      .text("Unable to load taxis map data (check file paths and format).");
  }

  // Optional view options (if you add radios in the HTML)
  const viewRadios = document.querySelectorAll('input[name="taxis-map-view"]');
  viewRadios.forEach((radio) => {
    radio.addEventListener("change", (event) => {
      const value = event.target.value;
      console.log("Selected taxis map view:", value);
      // Here you can show/hide layers in the future
    });
  });
})();
