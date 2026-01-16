// js/charts/boroughs-map.js
// Borough orientation map with hover highlights and note sync.
(function () {
  async function initBoroughsMap() {
    if (typeof d3 === "undefined") {
      console.error("D3 not found. Make sure d3.v7 is loaded before this script.");
      return;
    }

    const container = d3.select("#boroughs-map");
    if (container.empty()) return;

    const width = 900;
    const height = 520;

    const svg = container
      .append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet");

    svg
      .append("rect")
      .attr("width", width)
      .attr("height", height)
      .attr("fill", "#c7c3bb");

    const boroughOrder = ["Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island"];
    const boroughColors = {
      Manhattan: "#ede924",
      Brooklyn: "#ea0065",
      Queens: "#77ff00",
      Bronx: "#da1009",
      "Staten Island": "#09d0da",
    };
    const fallbackFill = "#2f2f2f";

    const noteElements = Array.from(document.querySelectorAll(".borough-note"));
    const notesByBorough = new Map(
      noteElements
        .map((note) => [note.dataset.borough, note])
        .filter(([name]) => Boolean(name)),
    );

    const highlightColor = (name) => {
      const base = d3.color(boroughColors[name] || fallbackFill);
      if (!base) return fallbackFill;
      return base.brighter(0.6).formatHex();
    };

    try {
      const boroughs = await d3.json("data/geo/nyc_boroughs.geojson");
      if (!boroughs || !boroughs.features) {
        throw new Error('Invalid boroughs GeoJSON: missing "features" array.');
      }

      const projection = d3.geoMercator().fitSize([width, height], boroughs);
      const path = d3.geoPath().projection(projection);

      const boroughLayer = svg.append("g");
      const boroughPaths = boroughLayer
        .selectAll("path")
        .data(boroughs.features)
        .join("path")
        .attr("class", "borough-map__borough")
        .attr("d", path)
        .attr("fill", (d) => {
          const name = d.properties?.BoroName || "";
          return boroughColors[name] || fallbackFill;
        })
        .attr("data-borough", (d) => d.properties?.BoroName || "")
        .each(function (d) {
          const name = d.properties?.BoroName || "Unknown borough";
          d3.select(this).append("title").text(name);
        });

      const setHighlight = (activeName) => {
        boroughPaths.each(function (d) {
          const name = d.properties?.BoroName || "";
          const isActive = activeName && name === activeName;
          const baseColor = boroughColors[name] || fallbackFill;
          const fillColor = isActive ? highlightColor(name) : baseColor;
          d3.select(this).attr("fill", fillColor).classed("is-hovered", Boolean(isActive));
        });

        notesByBorough.forEach((note, name) => {
          note.classList.toggle("is-active", Boolean(activeName && name === activeName));
        });
      };

      boroughPaths
        .on("mouseenter", (event, d) => {
          const name = d.properties?.BoroName || "";
          setHighlight(name);
        })
        .on("mouseleave", () => setHighlight(null));

      noteElements.forEach((note) => {
        const name = note.dataset.borough;
        if (!name) return;
        note.addEventListener("mouseenter", () => setHighlight(name));
        note.addEventListener("mouseleave", () => setHighlight(null));
      });

      const legend = svg
        .append("g")
        .attr("class", "borough-map__legend")
        .attr("transform", "translate(24,24)");

      const legendItems = legend
        .selectAll("g")
        .data(boroughOrder)
        .join("g")
        .attr("transform", (d, i) => `translate(0, ${i * 18})`);

      legendItems
        .append("rect")
        .attr("width", 10)
        .attr("height", 10)
        .attr("fill", (d) => boroughColors[d] || fallbackFill)
        .attr("rx", 2);

      legendItems
        .append("text")
        .attr("x", 16)
        .attr("y", 9)
        .text((d) => d);

      const legendNode = legend.node();
      if (legendNode) {
        const padding = 8;
        const bbox = legendNode.getBBox();
        legend
          .insert("rect", ":first-child")
          .attr("class", "borough-map__legend-box")
          .attr("x", bbox.x - padding)
          .attr("y", bbox.y - padding)
          .attr("width", bbox.width + padding * 2)
          .attr("height", bbox.height + padding * 2)
          .attr("rx", 8);
      }
    } catch (err) {
      console.error("Error loading or rendering boroughs map:", err);
      container
        .append("p")
        .attr("class", "borough-map__error")
        .text("Unable to load the borough map. Check GeoJSON paths.");
    }
  }

  if (typeof window.registerLazyInit === "function") {
    window.registerLazyInit("#boroughs-map", initBoroughsMap);
  } else if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initBoroughsMap);
  } else {
    initBoroughsMap();
  }
})();
