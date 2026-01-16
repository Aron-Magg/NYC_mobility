// js/charts/isochrones-map.js
// Approximate isochrones from Grand Central (no API)
(function () {
  function initIsochroneMap() {
    if (typeof d3 === "undefined") {
      console.error("D3 not found. Make sure d3.v7 is loaded before this script.");
      return;
    }

    const container = d3.select("#isochrone-map");
    if (container.empty()) return;

    const width = 900;
    const height = 520;

    const svg = container
      .append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet");

    const colorScale = d3
      .scaleLinear()
      .domain([5, 40])
      .range(["#1ad15b", "#ff5b5b"]);

    Promise.all([
      d3.json("data/geo/nyc_boroughs.geojson"),
      d3.json("data/processed/isochrones/grand_central_transit_isochrones.geojson"),
    ])
      .then(([boroughs, isochrones]) => {
        const clipId = "isochrone-clip";
        const defs = svg.append("defs");
        const clipPath = defs.append("clipPath").attr("id", clipId);

        const boroughLayer = svg.append("g").attr("class", "isochrone-boroughs");
        const group = svg
          .append("g")
          .attr("class", "isochrone-layer")
          .attr("clip-path", `url(#${clipId})`);

        function render(mode) {
          const filtered = isochrones.features.filter(
            (f) => f.properties.mode === mode && f.properties.minutes <= 40,
          );
          filtered.sort((a, b) => b.properties.minutes - a.properties.minutes);

          const fitCollection = {
            type: "FeatureCollection",
            features: boroughs.features.concat(filtered),
          };

          const projection = d3.geoMercator().fitSize([width, height], fitCollection);
          const path = d3.geoPath(projection);

          boroughLayer
            .selectAll("path")
            .data(boroughs.features)
            .join("path")
            .attr("d", path)
            .attr("fill", "#2f2f2f")
            .attr("stroke", "#0a0a0a")
            .attr("stroke-width", 0.8);

          clipPath
            .selectAll("path")
            .data(boroughs.features)
            .join("path")
            .attr("d", path);

          const items = group.selectAll("path").data(filtered, (d) => d.properties.minutes);

          items
            .join("path")
            .attr("d", path)
            .attr("fill", (d) => colorScale(d.properties.minutes))
            .attr("opacity", 0.45)
            .attr("stroke", "#101010")
            .attr("stroke-width", 0.8);
        }

        const legend = svg.append("g").attr("transform", "translate(24,24)");
        const legendItems = [5, 10, 20, 30, 40];

        legend
          .selectAll("g")
          .data(legendItems)
          .join("g")
          .attr("transform", (d, i) => `translate(0, ${i * 18})`)
          .attr("class", "overview-map__legend-item")
          .call((g) => {
            g.append("rect")
              .attr("width", 10)
              .attr("height", 10)
              .attr("fill", (d) => colorScale(d))
              .attr("rx", 2);

            g.append("text")
              .attr("x", 16)
              .attr("y", 9)
              .attr("fill", "#f2f3f4")
              .attr("font-size", 11)
              .text((d) => `${d} min`);
          });

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

        render("walking");

        d3.selectAll("input[name='isochrone-mode']").on("change", function () {
          render(this.value);
        });
      })
      .catch((error) => {
        console.error("Error loading isochrone map:", error);
        container
          .append("p")
          .attr("class", "overview-map__error")
          .text("Unable to load the isochrone map.");
      });
  }

  if (typeof window.registerLazyInit === "function") {
    window.registerLazyInit("#isochrone-map", initIsochroneMap);
  } else if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initIsochroneMap);
  } else {
    initIsochroneMap();
  }
})();
