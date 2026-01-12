// js/charts/walking-map.js
// NYC boroughs choropleth based on pedestrian injuries + fatalities
(async function initWalkingMap() {
  if (typeof d3 === "undefined") {
    console.error("D3 not found. Make sure d3.v7 is loaded before this script.");
    return;
  }

  const container = d3.select("#walking-map");
  if (container.empty()) return;

  const COLLISIONS_URL = "../data/map_Full Data_data.csv";
  const width = 900;
  const height = 500;

  function getCollisionData() {
    if (!window.__nycCollisionDataPromise) {
      window.__nycCollisionDataPromise = d3.csv(COLLISIONS_URL, (row) => ({
        borough: row.Borough ? row.Borough.trim() : "",
        pedestrianInjured: Number(row["Number Of Pedestrians Injured"]) || 0,
        pedestrianKilled: Number(row["Number Of Pedestrians Killed"]) || 0,
      }));
    }
    return window.__nycCollisionDataPromise;
  }

  function normalizeBorough(value) {
    if (!value) return "";
    return value
      .toLowerCase()
      .split(" ")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  function buildBoroughTotals(rows) {
    const totals = new Map();
    rows.forEach((row) => {
      const borough = normalizeBorough(row.borough);
      const value = row.pedestrianInjured + row.pedestrianKilled;
      totals.set(borough, (totals.get(borough) || 0) + value);
    });
    return totals;
  }

  const svg = container
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  try {
    const [boroughs, collisionRows] = await Promise.all([
      d3.json("data/geo/nyc_boroughs.geojson"),
      getCollisionData(),
    ]);

    if (!boroughs || !boroughs.features) {
      throw new Error('Invalid boroughs GeoJSON: missing "features" array.');
    }

    const totals = buildBoroughTotals(collisionRows);
    const values = Array.from(totals.values());
    const maxValue = d3.max(values) || 1;

    const color = d3
      .scaleLinear()
      .domain([0, maxValue])
      .range(["#0f7c3b", "#7aff9b"]);

    const projection = d3.geoMercator().fitSize([width, height], boroughs);
    const path = d3.geoPath().projection(projection);

    svg
      .append("g")
      .selectAll("path")
      .data(boroughs.features)
      .join("path")
      .attr("class", "walking-map__borough")
      .attr("d", path)
      .attr("fill", (d) => {
        const name = d.properties?.BoroName || "";
        const value = totals.get(name) || 0;
        return color(value);
      })
      .each(function (d) {
        const name = d.properties?.BoroName || "";
        const value = totals.get(name) || 0;
        d3.select(this).append("title").text(`${name}: ${value}`);
      });

    const legend = svg.append("g").attr("transform", "translate(24,470)");
    legend
      .append("rect")
      .attr("width", 140)
      .attr("height", 22)
      .attr("fill", "rgba(0,0,0,0.6)")
      .attr("rx", 6);

    legend
      .append("text")
      .attr("class", "walking-map__legend")
      .attr("x", 10)
      .attr("y", 15)
      .text(`Pedestrian injuries + fatalities (max ${maxValue})`);
  } catch (err) {
    console.error("Error loading or rendering NYC walking map:", err);
    container
      .append("p")
      .attr("class", "walking-map__error")
      .text("Unable to load the walking safety map. Check data files.");
  }
})();
