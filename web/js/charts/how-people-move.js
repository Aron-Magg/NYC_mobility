// js/charts/how-people-move.js
// Grouped annual ridership + total system volume charts
(function () {
  if (typeof d3 === "undefined") {
    console.error("D3 not found. Make sure d3.v7 is loaded before this script.");
    return;
  }

  const RIDERSHIP_URL = "../data/RidershipMode_Full Data_data.csv";
  const MODE_META = {
    Subway: { label: "Subway", color: "#ff3bff" },
    Bus: { label: "Bus", color: "#00bfff" },
    Taxi: { label: "Taxi/FHV", color: "#ffd447" },
    Citibike: { label: "Citi Bike", color: "#1ad15b" },
  };
  const MODE_ORDER = ["Subway", "Bus", "Taxi", "Citibike"];

  function getRidershipData() {
    if (!window.__nycRidershipDataPromise) {
      window.__nycRidershipDataPromise = d3.csv(RIDERSHIP_URL, (row) => ({
        mode: row.Mode?.trim() || "",
        year: Number(row.Year),
        ridership: Number(row.Ridership),
      }));
    }
    return window.__nycRidershipDataPromise;
  }

  function aggregateRidership(rows) {
    const acc = new Map();
    rows.forEach((row) => {
      if (!MODE_META[row.mode] || !Number.isFinite(row.year)) return;
      const key = `${row.mode}-${row.year}`;
      const current = acc.get(key) || { mode: row.mode, year: row.year, sum: 0, count: 0 };
      current.sum += row.ridership;
      current.count += 1;
      acc.set(key, current);
    });

    return Array.from(acc.values()).map((item) => ({
      mode: item.mode,
      year: item.year,
      ridership: item.count ? item.sum / item.count : 0,
    }));
  }

  function formatRidership(value) {
    if (!Number.isFinite(value)) return "0";
    const fmt = d3.format(".2s");
    return fmt(value).replace("G", "B");
  }

  let tooltip = d3.select("body").select(".mobility-pie-tooltip");
  if (tooltip.empty()) {
    tooltip = d3.select("body").append("div").attr("class", "mobility-pie-tooltip");
  }

  function renderGroupedBars(data) {
    const container = d3.select("#mobility-pie");
    if (container.empty()) return;

    container.selectAll("svg").remove();

    const node = container.node();
    const width = node.clientWidth || 640;
    const baseHeight = node.clientHeight || 360;
    const height = Math.max(280, baseHeight - 30);

    const margin = { top: 24, right: 80, bottom: 70, left: 72 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const svg = container
      .append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet");

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const years = Array.from(new Set(data.map((d) => d.year))).sort((a, b) => a - b);

    if (!renderGroupedBars.activeModes) {
      renderGroupedBars.activeModes = new Set(MODE_ORDER);
    }

    const activeModes = MODE_ORDER.filter((mode) => renderGroupedBars.activeModes.has(mode));

    const yearData = years.map((year) => {
      const entries = data.filter((d) => d.year === year);
      const row = { year: String(year) };
      MODE_ORDER.forEach((mode) => {
        const entry = entries.find((d) => d.mode === mode);
        row[mode] = entry ? entry.ridership : 0;
      });
      return row;
    });

    const stack = d3.stack().keys(activeModes);
    const stackedSeries = stack(yearData);

    const totals = yearData.map((row) => ({
      year: row.year,
      total: activeModes.reduce((sum, mode) => sum + (row[mode] || 0), 0),
    }));

    const maxTotal = d3.max(totals, (d) => d.total) || 0;

    const x = d3.scaleBand().domain(years.map(String)).range([0, innerWidth]).padding(0.25);
    const y = d3.scaleLinear().domain([0, maxTotal * 1.15]).range([innerHeight, 0]);

    g.append("g")
      .attr("class", "mobility-bars__axis mobility-bars__axis--x")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(d3.axisBottom(x).tickFormat((d) => d).tickPadding(10));

    g.append("g")
      .attr("class", "mobility-bars__axis mobility-bars__axis--y")
      .call(d3.axisLeft(y).ticks(5).tickFormat(formatRidership));

    g.append("text")
      .attr("class", "mobility-bars__axis-label")
      .attr("x", innerWidth / 2)
      .attr("y", innerHeight + 48)
      .attr("text-anchor", "middle")
      .text("Year");

    g.append("text")
      .attr("class", "mobility-bars__axis-label")
      .attr("transform", "rotate(-90)")
      .attr("x", -innerHeight / 2)
      .attr("y", -52)
      .attr("text-anchor", "middle")
      .text("Riders");

    const layers = g
      .selectAll("g.layer")
      .data(stackedSeries, (d) => d.key)
      .join("g")
      .attr("class", "layer")
      .attr("fill", (d) => MODE_META[d.key].color);

    layers
      .selectAll("rect")
      .data((d) => d.map((entry) => ({ key: d.key, data: entry.data, values: entry })))
      .join("rect")
      .attr("class", "mobility-bars__bar")
      .attr("x", (d) => x(d.data.year))
      .attr("y", (d) => y(d.values[1]))
      .attr("height", (d) => y(d.values[0]) - y(d.values[1]))
      .attr("width", x.bandwidth())
      .on("mouseover", function (event, d) {
        const year = d.data.year;
        const total = activeModes.reduce((sum, mode) => sum + (d.data[mode] || 0), 0);
        const breakdown = activeModes
          .map((mode) => `${MODE_META[mode].label}: ${formatRidership(d.data[mode] || 0)}`)
          .join("<br>");

        tooltip
          .style("opacity", 1)
          .html(`<strong>${year}</strong><br>${breakdown}<br>Total: ${formatRidership(total)}`);
      })
      .on("mousemove", function (event) {
        tooltip.style("left", `${event.pageX + 12}px`).style("top", `${event.pageY + 12}px`);
      })
      .on("mouseout", function () {
        tooltip.style("opacity", 0);
      });

    g.selectAll("text.total")
      .data(totals)
      .join("text")
      .attr("class", "mobility-bars__bar-label")
      .attr("x", (d) => x(d.year) + x.bandwidth() / 2)
      .attr("y", (d) => y(d.total) - 6)
      .text((d) => formatRidership(d.total));

    const legendContainer = d3.select("#mobility-pie-legend");
    if (!legendContainer.empty()) {
      legendContainer.selectAll("*").remove();

      const items = legendContainer
        .append("div")
        .attr("class", "mobility-bars__legend")
        .selectAll("div")
        .data(MODE_ORDER)
        .join("div")
        .attr("class", "mobility-bars__legend-item")
        .style("cursor", "pointer")
        .on("click", (event, mode) => {
          const nextState = new Set(renderGroupedBars.activeModes);
          if (nextState.has(mode)) {
            if (nextState.size === 1) return;
            nextState.delete(mode);
          } else {
            nextState.add(mode);
          }
          renderGroupedBars.activeModes = nextState;
          renderGroupedBars(data);
        });

      items
        .append("span")
        .attr("class", "mobility-bars__legend-color")
        .style("background", (d) => MODE_META[d].color)
        .style("width", "12px")
        .style("height", "12px")
        .style("opacity", (d) => (renderGroupedBars.activeModes.has(d) ? 1 : 0.4));

      items
        .append("span")
        .style("font-size", "14px")
        .style("opacity", (d) => (renderGroupedBars.activeModes.has(d) ? 1 : 0.5))
        .text((d) => MODE_META[d].label);
    }
  }

  function renderTotalBars(data) {
    const container = d3.select("#mobility-bars");
    if (container.empty()) return;

    container.selectAll("svg").remove();

    const node = container.node();
    const width = node.clientWidth || 560;
    const baseHeight = node.clientHeight || 300;
    const height = baseHeight + 20;

    const totals = d3
      .rollups(
        data,
        (v) => d3.sum(v, (d) => d.ridership),
        (d) => d.year,
      )
      .map(([year, value]) => ({ year, value }))
      .sort((a, b) => a.year - b.year);

    const margin = { top: 24, right: 24, bottom: 70, left: 72 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const svg = container
      .append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet");

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3.scaleBand().domain(totals.map((d) => String(d.year))).range([0, innerWidth]).padding(0.25);
    const y = d3.scaleLinear().domain([0, d3.max(totals, (d) => d.value) * 1.1]).range([innerHeight, 0]);

    g.append("g")
      .attr("class", "mobility-bars__axis mobility-bars__axis--x")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(d3.axisBottom(x).tickFormat((d) => d).tickPadding(10));

    g.append("g")
      .attr("class", "mobility-bars__axis mobility-bars__axis--y")
      .call(d3.axisLeft(y).ticks(5).tickFormat(formatRidership));

    g.append("text")
      .attr("class", "mobility-bars__axis-label")
      .attr("x", innerWidth / 2)
      .attr("y", innerHeight + 48)
      .attr("text-anchor", "middle")
      .text("Year");

    g.append("text")
      .attr("class", "mobility-bars__axis-label")
      .attr("transform", "rotate(-90)")
      .attr("x", -innerHeight / 2)
      .attr("y", -52)
      .attr("text-anchor", "middle")
      .text("Riders");

    g.selectAll("rect")
      .data(totals)
      .join("rect")
      .attr("class", "mobility-bars__bar")
      .attr("x", (d) => x(String(d.year)))
      .attr("y", (d) => y(d.value))
      .attr("width", x.bandwidth())
      .attr("height", (d) => innerHeight - y(d.value))
      .attr("fill", "#ffb347")
      .on("mouseover", function (event, d) {
        tooltip.style("opacity", 1).html(`<strong>${d.year}</strong><br>Total: ${formatRidership(d.value)}`);
      })
      .on("mousemove", function (event) {
        tooltip.style("left", `${event.pageX + 12}px`).style("top", `${event.pageY + 12}px`);
      })
      .on("mouseout", function () {
        tooltip.style("opacity", 0);
      });

    g.selectAll("text.value")
      .data(totals)
      .join("text")
      .attr("class", "mobility-bars__bar-label")
      .attr("x", (d) => x(String(d.year)) + x.bandwidth() / 2)
      .attr("y", (d) => y(d.value) - 6)
      .text((d) => formatRidership(d.value));

  }

  function renderLatestYearPie(data) {
    const container = d3.select("#mobility-share-pie");
    if (container.empty()) return;

    container.selectAll("svg").remove();

    const latestYear = d3.max(data, (d) => d.year);
    if (!latestYear) return;

    const yearData = data.filter((d) => d.year === latestYear);
    const pieData = MODE_ORDER.map((mode) => {
      const entry = yearData.find((d) => d.mode === mode);
      return {
        mode,
        label: MODE_META[mode].label,
        color: MODE_META[mode].color,
        value: entry ? entry.ridership : 0,
      };
    });

    const total = d3.sum(pieData, (d) => d.value) || 1;

    const node = container.node();
    const size = node.clientWidth || 300;
    const width = size;
    const height = node.clientHeight || size;

    const svg = container
      .append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet");

    const g = svg.append("g").attr("transform", `translate(${width / 2},${height / 2})`);

    const radius = Math.min(width, height) / 2 - 10;
    const pie = d3.pie().sort(null).value((d) => d.value);
    const arc = d3.arc().innerRadius(0).outerRadius(radius);
    const arcHover = d3.arc().innerRadius(0).outerRadius(radius + 8);
    const labelArc = d3.arc().innerRadius(radius * 0.6).outerRadius(radius * 0.6);

    g.selectAll("path")
      .data(pie(pieData))
      .join("path")
      .attr("d", arc)
      .attr("fill", (d) => d.data.color)
      .attr("stroke", "#101010")
      .attr("stroke-width", 1)
      .on("mouseover", function (event, d) {
        const perc = ((d.data.value / total) * 100).toFixed(1);
        d3.select(this).transition().duration(150).attr("d", arcHover).attr("stroke-width", 2.2);

        tooltip
          .style("opacity", 1)
          .html(
            `<strong>${latestYear}</strong><br>${d.data.label}: ${formatRidership(
              d.data.value,
            )} (${perc}%)`,
          );
      })
      .on("mousemove", function (event) {
        tooltip.style("left", `${event.pageX + 12}px`).style("top", `${event.pageY + 12}px`);
      })
      .on("mouseout", function () {
        d3.select(this).transition().duration(150).attr("d", arc).attr("stroke-width", 1);
        tooltip.style("opacity", 0);
      });

    g.selectAll("text")
      .data(pie(pieData))
      .join("text")
      .attr("transform", (d) => `translate(${labelArc.centroid(d)})`)
      .attr("text-anchor", "middle")
      .attr("dy", "0.35em")
      .attr("fill", "#f2f3f4")
      .attr("font-size", 16)
      .attr("font-weight", "700")
      .attr("stroke", "#101010")
      .attr("stroke-width", 4)
      .attr("paint-order", "stroke")
      .text((d) => `${Math.round((d.data.value / total) * 100)}%`);

    const legendContainer = d3.select("#mobility-share-legend");
    if (!legendContainer.empty()) {
      legendContainer.selectAll("*").remove();

      const items = legendContainer
        .append("div")
        .attr("class", "mobility-bars__legend")
        .selectAll("div")
        .data(pieData)
        .join("div")
        .attr("class", "mobility-bars__legend-item");

      items
        .append("span")
        .attr("class", "mobility-bars__legend-color")
        .style("background", (d) => d.color);

      items.append("span").text((d) => {
        const perc = Math.round((d.value / total) * 100);
        return `${d.label} - ${perc}%`;
      });
    }
  }

  function initHowPeopleMoveCharts() {
    getRidershipData()
      .then((rows) => {
        const data = aggregateRidership(rows);
        renderGroupedBars(data);
        renderTotalBars(data);
        renderLatestYearPie(data);
      })
      .catch((err) => {
        console.error("Error loading ridership:", err);
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initHowPeopleMoveCharts);
  } else {
    initHowPeopleMoveCharts();
  }

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      getRidershipData().then((rows) => {
        const data = aggregateRidership(rows);
        renderGroupedBars(data);
        renderTotalBars(data);
        renderLatestYearPie(data);
      });
    }, 150);
  });
})();
