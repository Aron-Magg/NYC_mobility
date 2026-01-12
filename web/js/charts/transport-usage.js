// js/charts/transport-usage.js
// Mode-specific annual ridership charts + share pies
(function () {
  if (typeof d3 === "undefined") {
    console.error("D3 not found. Make sure d3.v7 is loaded before this script.");
    return;
  }

  const RIDERSHIP_URL = "../data/RidershipMode_Full Data_data.csv";
  const MODE_META = {
    subway: { key: "Subway", label: "Subway", color: "#ff3bff" },
    buses: { key: "Bus", label: "Bus", color: "#00bfff" },
    bikes: { key: "Citibike", label: "Citi Bike", color: "#1ad15b" },
    taxis: { key: "Taxi", label: "Taxi/FHV", color: "#ffd447" },
  };

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

  let tooltip = d3.select("body").select(".transport-usage-tooltip");
  if (tooltip.empty()) {
    tooltip = d3.select("body").append("div").attr("class", "transport-usage-tooltip");
  }

  function renderModeBars({ containerSelector, title, data, color }) {
    const container = d3.select(containerSelector);
    if (container.empty()) return;

    container.selectAll("svg").remove();
    container.selectAll("div.transport-usage-line__title").remove();

    const node = container.node();
    const width = node.clientWidth || 560;
    const height = node.clientHeight || 320;

    container.append("div").attr("class", "transport-usage-line__title").text(title);

    const svg = container
      .append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet");

    const margin = { top: 24, right: 24, bottom: 70, left: 72 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const sorted = data.slice().sort((a, b) => a.year - b.year);
    const years = sorted.map((d) => String(d.year));

    const x = d3.scaleBand().domain(years).range([0, innerWidth]).padding(0.25);
    const y = d3.scaleLinear().domain([0, d3.max(sorted, (d) => d.ridership) * 1.1]).range([innerHeight, 0]);

    g.append("g")
      .attr("class", "transport-usage-line__axis transport-usage-line__axis--x")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(d3.axisBottom(x).tickFormat((d) => d).tickPadding(10));

    g.append("g")
      .attr("class", "transport-usage-line__axis transport-usage-line__axis--y")
      .call(d3.axisLeft(y).ticks(5).tickFormat(formatRidership));

    g.append("text")
      .attr("class", "transport-usage-axis-label")
      .attr("x", innerWidth / 2)
      .attr("y", innerHeight + 48)
      .attr("text-anchor", "middle")
      .text("Year");

    g.append("text")
      .attr("class", "transport-usage-axis-label")
      .attr("transform", "rotate(-90)")
      .attr("x", -innerHeight / 2)
      .attr("y", -52)
      .attr("text-anchor", "middle")
      .text("Riders");

    g.selectAll("rect")
      .data(sorted)
      .join("rect")
      .attr("class", "transport-usage-bar__bar")
      .attr("x", (d) => x(String(d.year)))
      .attr("y", (d) => y(d.ridership))
      .attr("width", x.bandwidth())
      .attr("height", (d) => innerHeight - y(d.ridership))
      .attr("fill", color)
      .on("mouseover", function (event, d) {
        tooltip
          .style("opacity", 1)
          .html(`<strong>${d.year}</strong><br>${formatRidership(d.ridership)}`);
      })
      .on("mousemove", function (event) {
        tooltip.style("left", `${event.pageX + 12}px`).style("top", `${event.pageY + 12}px`);
      })
      .on("mouseout", function () {
        tooltip.style("opacity", 0);
      });

    g.selectAll("text.value")
      .data(sorted)
      .join("text")
      .attr("class", "transport-usage-bar__label")
      .attr("x", (d) => x(String(d.year)) + x.bandwidth() / 2)
      .attr("y", (d) => y(d.ridership) - 6)
      .text((d) => formatRidership(d.ridership));
  }

  function pickFeaturedYears(years) {
    const unique = Array.from(new Set(years)).sort((a, b) => a - b);
    if (unique.length <= 4) return unique;
    const idx = [0, Math.floor(unique.length / 3), Math.floor((2 * unique.length) / 3), unique.length - 1];
    return idx.map((i) => unique[i]);
  }

  function renderSharePie({ selector, year, modeValue, total, color, modeLabel }) {
    const container = d3.select(selector);
    if (container.empty()) return;

    container.selectAll("*").remove();

    const otherValue = Math.max(0, total - modeValue);
    const data = [
      { label: modeLabel, value: modeValue, color },
      { label: "Other modes", value: otherValue, color: "#2f2f2f" },
    ];

    const node = container.node();
    const size = node.clientWidth || 160;
    const width = size;
    const height = size;

    const chartWrapper = container
      .append("div")
      .attr("class", "transport-usage-card__pie-chart-wrapper");

    chartWrapper.append("div").attr("class", "transport-usage-card__pie-title").text(`Year ${year}`);

    const chartDiv = chartWrapper
      .append("div")
      .attr("class", "transport-usage-card__pie-chart");

    const svg = chartDiv
      .append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet");

    const g = svg.append("g").attr("transform", `translate(${width / 2},${height / 2})`);

    const radius = Math.min(width, height) / 2 - 8;
    const pie = d3.pie().sort(null).value((d) => d.value);
    const arc = d3.arc().innerRadius(0).outerRadius(radius);
    const arcHover = d3.arc().innerRadius(0).outerRadius(radius + 6);
    const labelArc = d3.arc().innerRadius(radius * 0.6).outerRadius(radius * 0.6);

    const totalValue = total || 1;

    g.selectAll("path")
      .data(pie(data))
      .join("path")
      .attr("d", arc)
      .attr("fill", (d) => d.data.color)
      .attr("stroke", "#101010")
      .attr("stroke-width", 1)
      .on("mouseover", function (event, d) {
        const pct = ((d.data.value / totalValue) * 100).toFixed(1);
        d3.select(this)
          .transition()
          .duration(150)
          .attr("d", arcHover)
          .attr("stroke-width", 2.2);

        tooltip
          .style("opacity", 1)
          .html(
            `<strong>${year}</strong><br>${d.data.label}: ${formatRidership(d.data.value)} (${pct}%)`,
          );
      })
      .on("mousemove", function (event) {
        tooltip.style("left", `${event.pageX + 12}px`).style("top", `${event.pageY + 12}px`);
      })
      .on("mouseout", function () {
        d3.select(this)
          .transition()
          .duration(150)
          .attr("d", arc)
          .attr("stroke-width", 1);
        tooltip.style("opacity", 0);
      });

    g.selectAll("text")
      .data(pie(data))
      .join("text")
      .attr("transform", (d) => `translate(${labelArc.centroid(d)})`)
      .attr("text-anchor", "middle")
      .attr("dy", "0.35em")
      .attr("fill", "#f2f3f4")
      .attr("font-size", 14)
      .attr("font-weight", "700")
      .attr("stroke", "#101010")
      .attr("stroke-width", 3)
      .attr("paint-order", "stroke")
      .text((d) => `${Math.round((d.data.value / totalValue) * 100)}%`);
  }

  function renderModeCharts({ modeId, dataset, allData }) {
    const meta = MODE_META[modeId];
    if (!meta) return;

    const modeData = dataset
      .filter((d) => d.mode === meta.key)
      .sort((a, b) => a.year - b.year);

    if (!modeData.length) return;

    renderModeBars({
      containerSelector: `#${modeId}-usage-line`,
      title: `${meta.label} annual ridership`,
      data: modeData,
      color: meta.color,
    });

    for (let i = 1; i <= 4; i += 1) {
      d3.select(`#${modeId}-usage-pie-${i}`).selectAll("*").remove();
    }

    const featuredYears = pickFeaturedYears(modeData.map((d) => d.year));
    featuredYears.forEach((year, index) => {
      const modeYear = modeData.find((d) => d.year === year);
      const totalYear = d3.sum(
        allData.filter((d) => d.year === year),
        (d) => d.ridership,
      );
      renderSharePie({
        selector: `#${modeId}-usage-pie-${index + 1}`,
        year,
        modeLabel: meta.label,
        modeValue: modeYear ? modeYear.ridership : 0,
        total: totalYear,
        color: meta.color,
      });
    });
  }

  function initTransportUsageCharts() {
    getRidershipData()
      .then((rows) => {
        const data = aggregateRidership(rows);
        Object.keys(MODE_META).forEach((modeId) => {
          renderModeCharts({ modeId, dataset: data, allData: data });
        });
      })
      .catch((err) => {
        console.error("Error loading ridership:", err);
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initTransportUsageCharts);
  } else {
    initTransportUsageCharts();
  }
})();
