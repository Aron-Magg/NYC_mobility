// js/charts/buses-map.js
// NYC boroughs + bus stops map

(async function initBusesMap() {
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
      const pointFeatures = busStops.features.filter(
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
        .attr("class", "buses-map__stop")
        .attr("transform", (d) => {
          const [x, y] = projection(d.geometry.coordinates);
          return `translate(${x}, ${y})`;
        })
        .attr("r", 1.8);
    }
  } catch (err) {
    console.error("Error loading or rendering NYC buses map:", err);
    container
      .append("p")
      .attr("class", "buses-map__error")
      .text("Unable to load buses map data (check file paths and format).");
  }

  const viewRadios = document.querySelectorAll('input[name="buses-map-view"]');
  viewRadios.forEach((radio) => {
    radio.addEventListener("change", (event) => {
      const value = event.target.value;
      console.log("Selected buses map view:", value);
    });
  });
})();
