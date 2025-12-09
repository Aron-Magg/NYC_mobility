// js/charts/transport-usage.js
// Reusable line chart (sinusoid) + 4 random pie charts
// for Bikes, Taxis, Buses, Subway and Walking.

(function () {
  if (typeof d3 === "undefined") {
    console.error(
      "D3 not found. Make sure d3.v7 is loaded before this script.",
    );
    return;
  }

  // ========================================
  // SHARED TOOLTIP FOR ALL PIE CHARTS
  // ========================================
  let tooltip = d3.select("body").select(".transport-usage-tooltip");
  if (tooltip.empty()) {
    tooltip = d3
      .select("body")
      .append("div")
      .attr("class", "transport-usage-tooltip");
  }

  // ========================================
  // GENERIC LINE CHART (SINUSOID)
  // ========================================
  function renderUsageLine(containerSelector, title) {
    const container = d3.select(containerSelector);
    if (container.empty()) return;

    // Clear any placeholder content
    container.selectAll("*").remove();

    const node = container.node();
    const width = node.clientWidth || 500;
    const height = node.clientHeight || 300;

    // Small title overlay in the top-right corner
    container
      .append("div")
      .attr("class", "transport-usage-line__title")
      .text(title);

    const svg = container
      .append("svg")
      .attr("width", width)
      .attr("height", height);

    const margin = { top: 20, right: 24, bottom: 30, left: 40 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const g = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Fake sinusoidal data: 60 time steps
    const n = 60;
    const data = d3.range(n).map((i) => ({
      t: i,
      value: 0.5 + 0.4 * Math.sin(i / 6) + 0.1 * Math.sin(i / 2),
    }));

    const x = d3
      .scaleLinear()
      .domain(d3.extent(data, (d) => d.t))
      .range([0, innerWidth]);

    const y = d3
      .scaleLinear()
      .domain([0, d3.max(data, (d) => d.value) * 1.1])
      .range([innerHeight, 0]);

    const line = d3
      .line()
      .x((d) => x(d.t))
      .y((d) => y(d.value))
      .curve(d3.curveMonotoneX);

    const xAxis = d3
      .axisBottom(x)
      .ticks(6)
      .tickFormat((d) => `Day ${d}`);

    const yAxis = d3.axisLeft(y).ticks(5).tickFormat(d3.format(".0%"));

    g.append("g")
      .attr("class", "transport-usage-line__axis transport-usage-line__axis--x")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(xAxis);

    g.append("g")
      .attr("class", "transport-usage-line__axis transport-usage-line__axis--y")
      .call(yAxis);

    g.append("path")
      .datum(data)
      .attr("class", "transport-usage-line__path")
      .attr("d", line);
  }

  // ========================================
  // GENERIC PIE CHART (RANDOM SPLITS)
  // ========================================
  function renderRandomPie(selector, title) {
    const container = d3.select(selector);
    if (container.empty()) return;

    // Clear placeholder text or old content
    container.selectAll("*").remove();

    // Random data: 4 categories with integer values
    const labels = ["Segment A", "Segment B", "Segment C", "Segment D"];
    const raw = labels.map((label) => ({
      label,
      value: Math.floor(20 + Math.random() * 80),
    }));
    const total = d3.sum(raw, (d) => d.value);

    const node = container.node();
    const width = node.clientWidth || 160;
    const height = width; // keep it square

    // --- Wrapper around the pie (border, background, title) ---
    const chartWrapper = container
      .append("div")
      .attr("class", "transport-usage-card__pie-chart-wrapper");

    chartWrapper
      .append("div")
      .attr("class", "transport-usage-card__pie-title")
      .text(title);

    const chartDiv = chartWrapper
      .append("div")
      .attr("class", "transport-usage-card__pie-chart");

    const svg = chartDiv
      .append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet");

    const g = svg
      .append("g")
      .attr("transform", `translate(${width / 2},${height / 2})`);

    const radius = Math.min(width, height) / 2 - 8;

    const color = d3
      .scaleOrdinal()
      .domain(labels)
      .range(["#1ad15b", "#00e5ff", "#ffb347", "#ff3bff"]);

    const pie = d3
      .pie()
      .sort(null)
      .value((d) => d.value);

    const arc = d3.arc().innerRadius(0).outerRadius(radius);
    const arcHover = d3
      .arc()
      .innerRadius(0)
      .outerRadius(radius + 8);
    const labelArc = d3
      .arc()
      .innerRadius(radius * 0.6)
      .outerRadius(radius * 0.6);

    const pieData = pie(raw);

    // --- Slices ---
    g.selectAll("path")
      .data(pieData)
      .join("path")
      .attr("d", arc)
      .attr("fill", (d) => color(d.data.label))
      .attr("stroke", "#101010")
      .attr("stroke-width", 1)
      .on("mouseover", function (event, d) {
        const perc = ((d.data.value / total) * 100).toFixed(1);

        // Highlight hovered slice
        d3.select(this)
          .transition()
          .duration(150)
          .attr("d", arcHover)
          .attr("stroke-width", 2.2);

        tooltip
          .style("opacity", 1)
          .html(
            `<strong>${d.data.label}</strong><br>` +
              `Value: ${d.data.value}<br>` +
              `Share: ${perc}%`,
          );
      })
      .on("mousemove", function (event) {
        tooltip
          .style("left", event.pageX + 12 + "px")
          .style("top", event.pageY + 12 + "px");
      })
      .on("mouseout", function () {
        // Back to normal slice
        d3.select(this)
          .transition()
          .duration(150)
          .attr("d", arc)
          .attr("stroke-width", 1);

        tooltip.style("opacity", 0);
      });

    // --- Percentage labels inside slices (big and bold) ---
    g.selectAll("text")
      .data(pieData)
      .join("text")
      .attr("transform", (d) => `translate(${labelArc.centroid(d)})`)
      .attr("text-anchor", "middle")
      .attr("dy", "0.35em")
      .attr("fill", "#f2f3f4")
      .attr("font-size", 14)
      .attr("font-weight", "700")
      .text((d) => `${Math.round((d.data.value / total) * 100)}%`);

    // --- Legend below the pie ---
    const legend = container
      .append("div")
      .attr("class", "transport-usage-card__pie-legend");

    const legendItems = legend
      .selectAll(".transport-usage-card__pie-legend-item")
      .data(pieData)
      .join("div")
      .attr("class", "transport-usage-card__pie-legend-item");

    legendItems
      .append("span")
      .attr("class", "transport-usage-card__pie-legend-color")
      .style("background", (d) => color(d.data.label));

    legendItems
      .append("span")
      .text(
        (d) =>
          `${d.data.label} – ${d.data.value} (${Math.round(
            (d.data.value / total) * 100,
          )}%)`,
      );
  }

  // ========================================
  // INIT FOR ALL TRANSPORT MODES
  // ========================================
  function initTransportUsageCharts() {
    // Configuration for each transport mode
    const configs = [
      {
        id: "bikes",
        lineTitle: "Bike usage over time",
        pies: ["Time of day", "User type", "Trip distance", "Weather"],
      },
      {
        id: "taxis",
        lineTitle: "Taxi rides over time",
        pies: [
          "Day vs night",
          "Trip distance",
          "Airport trips",
          "Borough share",
        ],
      },
      {
        id: "buses",
        lineTitle: "Bus ridership over time",
        pies: [
          "Route type",
          "Peak vs off-peak",
          "Borough share",
          "Weekend vs weekday",
        ],
      },
      {
        id: "subway",
        lineTitle: "Subway ridership over time",
        pies: [
          "Line groups",
          "Time of day",
          "Borough access",
          "Weekend vs weekday",
        ],
      },
      {
        id: "walking",
        lineTitle: "Walking activity over time",
        pies: ["Commuters", "Leisure", "Tourists", "Other"],
      },
    ];

    configs.forEach((cfg) => {
      // Line chart for this mode
      renderUsageLine(`#${cfg.id}-usage-line`, cfg.lineTitle);

      // Four pies for this mode
      cfg.pies.forEach((pieTitle, index) => {
        const num = index + 1;
        renderRandomPie(`#${cfg.id}-usage-pie-${num}`, pieTitle);
      });
    });
  }

  // Run on DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initTransportUsageCharts);
  } else {
    initTransportUsageCharts();
  }
})();
