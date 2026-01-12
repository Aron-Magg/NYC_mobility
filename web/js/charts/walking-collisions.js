// js/charts/walking-collisions.js
// Stacked bars for collision totals by borough and user type
(function () {
  if (typeof d3 === "undefined") {
    console.error("D3 not found. Make sure d3.v7 is loaded before this script.");
    return;
  }

  const container = d3.select("#walking-usage-line");
  if (container.empty()) return;

  const COLLISIONS_URL = "../data/map_Full Data_data.csv";
  const USER_TYPES = [
    { key: "pedestrians", label: "Pedestrians", color: "#7aff9b" },
    { key: "cyclists", label: "Cyclists", color: "#00e5ff" },
    { key: "motorists", label: "Motorists", color: "#ffb347" },
  ];
  const USER_LABELS = {
    pedestrian: "Pedestrians",
    cyclist: "Cyclists",
    motorist: "Motorists",
  };

  function getCollisionData() {
    if (!window.__nycCollisionDataPromise) {
      window.__nycCollisionDataPromise = d3.csv(COLLISIONS_URL, (row) => ({
        borough: row.Borough ? row.Borough.trim() : "",
        pedestrian:
          (Number(row["Number Of Pedestrians Injured"]) || 0) +
          (Number(row["Number Of Pedestrians Killed"]) || 0),
        cyclist:
          (Number(row["Number Of Cyclist Injured"]) || 0) +
          (Number(row["Number Of Cyclist Killed"]) || 0),
        motorist:
          (Number(row["Number Of Motorist Injured"]) || 0) +
          (Number(row["Number Of Motorist Killed"]) || 0),
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
      if (!borough) return;

      const current = totals.get(borough) || { borough, pedestrian: 0, cyclist: 0, motorist: 0 };
      current.pedestrian += row.pedestrian;
      current.cyclist += row.cyclist;
      current.motorist += row.motorist;
      totals.set(borough, current);
    });

    return Array.from(totals.values()).map((item) => ({
      ...item,
      total: item.pedestrian + item.cyclist + item.motorist,
    }));
  }

  let tooltip = d3.select("body").select(".walking-collisions-tooltip");
  if (tooltip.empty()) {
    tooltip = d3.select("body").append("div").attr("class", "walking-collisions-tooltip");
  }

  function renderStackedBars(data) {
    container.selectAll("*").remove();

    const node = container.node();
    const width = node.clientWidth || 500;
    const height = node.clientHeight || 300;

    container
      .append("div")
      .attr("class", "transport-usage-line__title")
      .text("Top boroughs by collision totals (stacked by road user)");

    const svg = container.append("svg").attr("width", width).attr("height", height);

    const margin = { top: 24, right: 24, bottom: 42, left: 66 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3.scaleBand().domain(data.map((d) => d.borough)).range([0, innerWidth]).padding(0.25);
    const y = d3.scaleLinear().domain([0, d3.max(data, (d) => d.total) * 1.15]).range([innerHeight, 0]);

    g.append("g")
      .attr("class", "transport-usage-line__axis transport-usage-line__axis--x")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(d3.axisBottom(x));

    g.append("g")
      .attr("class", "transport-usage-line__axis transport-usage-line__axis--y")
      .call(d3.axisLeft(y).ticks(5));

    const stack = d3.stack().keys(["pedestrian", "cyclist", "motorist"]);
    const stacked = stack(data);

    const colorMap = {
      pedestrian: USER_TYPES[0].color,
      cyclist: USER_TYPES[1].color,
      motorist: USER_TYPES[2].color,
    };

    g.selectAll("g.layer")
      .data(stacked)
      .join("g")
      .attr("class", "layer")
      .attr("fill", (d) => colorMap[d.key])
      .selectAll("rect")
      .data((d) => d.map((entry) => ({ key: d.key, borough: entry.data.borough, values: entry, data: entry.data })))
      .join("rect")
      .attr("x", (d) => x(d.borough))
      .attr("y", (d) => y(d.values[1]))
      .attr("height", (d) => y(d.values[0]) - y(d.values[1]))
      .attr("width", x.bandwidth())
      .on("mouseover", function (event, d) {
        const total = d.data.total || 1;
        const value = d.data[d.key];
        const pct = ((value / total) * 100).toFixed(1);
        tooltip
          .style("opacity", 1)
          .html(
            `<strong>${d.borough}</strong><br>${USER_LABELS[d.key]}: ${value} (${pct}%)<br>Total: ${total}`,
          );
      })
      .on("mousemove", function (event) {
        tooltip.style("left", `${event.pageX + 12}px`).style("top", `${event.pageY + 12}px`);
      })
      .on("mouseout", function () {
        tooltip.style("opacity", 0);
      });

    g.selectAll("text.total")
      .data(data)
      .join("text")
      .attr("class", "transport-usage-bar__label")
      .attr("x", (d) => x(d.borough) + x.bandwidth() / 2)
      .attr("y", (d) => y(d.total) - 6)
      .text((d) => d.total);
  }

  function renderMiniStacks(data) {
    const top = data.slice(0, 4);

    top.forEach((item, index) => {
      const selector = `#walking-usage-pie-${index + 1}`;
      const container = d3.select(selector);
      if (container.empty()) return;
      container.selectAll("*").remove();

      const chartWrapper = container
        .append("div")
        .attr("class", "transport-usage-card__pie-chart-wrapper");

      chartWrapper.append("div").attr("class", "transport-usage-card__pie-title").text(item.borough);

      const chartDiv = chartWrapper
        .append("div")
        .attr("class", "transport-usage-card__pie-chart");

      const size = chartDiv.node().clientWidth || 160;
      const width = size;
      const height = size;

      const svg = chartDiv.append("svg").attr("viewBox", `0 0 ${width} ${height}`);
      const margin = { top: 14, right: 10, bottom: 14, left: 10 };
      const innerWidth = width - margin.left - margin.right;
      const innerHeight = height - margin.top - margin.bottom;

      const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

      const segments = [
        { key: "pedestrian", value: item.pedestrian, color: USER_TYPES[0].color },
        { key: "cyclist", value: item.cyclist, color: USER_TYPES[1].color },
        { key: "motorist", value: item.motorist, color: USER_TYPES[2].color },
      ];

      const total = item.total || 1;
      let currentX = 0;

      segments.forEach((segment) => {
        const widthSegment = (segment.value / total) * innerWidth;
        g.append("rect")
          .attr("class", "transport-usage-mini__bar")
          .attr("x", currentX)
          .attr("y", innerHeight / 2 - 6)
          .attr("width", widthSegment)
          .attr("height", 12)
          .attr("fill", segment.color)
          .on("mouseover", function () {
            const pct = ((segment.value / total) * 100).toFixed(1);
            tooltip
              .style("opacity", 1)
              .html(
                `<strong>${item.borough}</strong><br>${USER_LABELS[segment.key]}: ${segment.value} (${pct}%)`,
              );
          })
          .on("mousemove", function (event) {
            tooltip.style("left", `${event.pageX + 12}px`).style("top", `${event.pageY + 12}px`);
          })
          .on("mouseout", function () {
            tooltip.style("opacity", 0);
          });

        currentX += widthSegment;
      });

      g.append("text")
        .attr("class", "transport-usage-bar__label")
        .attr("x", innerWidth / 2)
        .attr("y", innerHeight / 2 - 10)
        .text(`Total ${item.total}`);
    });
  }

  function initWalkingCharts() {
    getCollisionData()
      .then((rows) => {
        const totals = buildBoroughTotals(rows)
          .sort((a, b) => b.total - a.total)
          .slice(0, 4);

        if (!totals.length) {
          container
            .append("p")
            .attr("class", "walking-map__error")
            .text("No collision data available for the walking safety chart.");
          return;
        }

        renderStackedBars(totals);
        renderMiniStacks(totals);
      })
      .catch((err) => {
        console.error("Error loading collision data:", err);
        container
          .append("p")
          .attr("class", "walking-map__error")
          .text("Unable to load collision data for the walking safety chart.");
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initWalkingCharts);
  } else {
    initWalkingCharts();
  }
})();
