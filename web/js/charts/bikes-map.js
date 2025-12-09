// js/charts/bikes-map.js

(async function initBikesMap() {
  // Select the container div in the Bikes chapter
  const container = d3.select("#bikes-map");
  if (container.empty()) return; // Safety: do nothing if the div isn't in the DOM

  const width = 900;
  const height = 500;

  // Create responsive SVG
  const svg = container
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  try {
    // Load both borough polygons and bike shelters (points)
    const [boroughs, bikeShelters] = await Promise.all([
      d3.json("data/geo/nyc_boroughs.geojson"),
      d3.json("data/geo/bike-shelters.geojson"),
    ]);

    if (!boroughs || !boroughs.features) {
      throw new Error('Invalid boroughs GeoJSON: missing "features" array.');
    }

    // Projection fitted to the borough polygons
    const projection = d3.geoMercator().fitSize([width, height], boroughs);
    const path = d3.geoPath().projection(projection);

    // 1) Draw borough polygons
    svg
      .append("g")
      .selectAll("path")
      .data(boroughs.features)
      .join("path")
      .attr("class", "bikes-map__borough")
      .attr("d", path);

    // 2) Draw bike shelter points (if the file loaded correctly)
    if (bikeShelters && Array.isArray(bikeShelters.features)) {
      // Keep only simple Point geometries
      const pointFeatures = bikeShelters.features.filter(
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
        .attr("class", "bikes-map__station")
        .attr("transform", (d) => {
          // GeoJSON coordinates are [longitude, latitude]
          const [x, y] = projection(d.geometry.coordinates);
          return `translate(${x}, ${y})`;
        })
        .attr("r", 2.4); // radius of the dots
    }
  } catch (err) {
    console.error("Error loading or rendering NYC bikes map:", err);
    container
      .append("p")
      .attr("class", "bikes-map__error")
      .text("Unable to load NYC map data (check file paths and format).");
  }

  // ========================================
  // VIEW OPTIONS (RADIO BUTTONS) - STUB
  // ========================================

  const viewRadios = document.querySelectorAll('input[name="bikes-map-view"]');

  viewRadios.forEach((radio) => {
    radio.addEventListener("change", (event) => {
      const value = event.target.value;
      // For now we just log the selected view.
      // Later you can show/hide layers based on this value.
      console.log("Selected bikes map view:", value);
    });
  });
})();
