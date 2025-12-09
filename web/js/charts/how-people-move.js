// js/charts/how-people-move.js
// Big pie chart + yearly bar chart for "How people move" section
(function () {
  if (typeof d3 === "undefined") {
    console.error(
      "D3 not found. Make sure d3.v7 is loaded before this script.",
    );
    return;
  }

  // Shared tooltip for pie + bars
  let tooltip = d3.select("body").select(".mobility-pie-tooltip");
  if (tooltip.empty()) {
    tooltip = d3
      .select("body")
      .append("div")
      .attr("class", "mobility-pie-tooltip");
  }

  // ========================================
  // PIE CHART – RANDOM MODE SHARE
  // ========================================
  function renderMobilityPie() {
    const container = d3.select("#mobility-pie");
    if (container.empty()) return;

    // Rimuove solo eventuali SVG precedenti, NON il titolo
    container.selectAll("svg").remove();

    const node = container.node();
    const width = node.clientWidth || 400;
    const height = width; // quadrato

    // Dati fittizi: random ma "sensati"
    const modes = [
      { mode: "Subway", color: "#00e5ff" },
      { mode: "Bus", color: "#ffb347" },
      { mode: "Taxi & FHV", color: "#ff3bff" },
      { mode: "Bike", color: "#1ad15b" },
      { mode: "Walking", color: "#e6e6e6" },
    ];

    // Valori casuali con leggera preferenza per Subway/Bus
    let raw = modes.map((m) => {
      let base;
      switch (m.mode) {
        case "Subway":
          base = 40;
          break;
        case "Bus":
          base = 25;
          break;
        case "Taxi & FHV":
          base = 15;
          break;
        case "Bike":
          base = 10;
          break;
        case "Walking":
          base = 10;
          break;
        default:
          base = 10;
      }
      // aggiungo un po’ di rumore casuale
      const noisy = base + (Math.random() * 10 - 5);
      return { ...m, value: Math.max(3, noisy) }; // minimo 3
    });

    const total = d3.sum(raw, (d) => d.value);

    const svg = container
      .append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet");

    const g = svg
      .append("g")
      .attr("transform", `translate(${width / 2},${height / 2})`);

    const radius = Math.min(width, height) / 2 - 10;

    const pie = d3
      .pie()
      .sort(null)
      .value((d) => d.value);

    const arc = d3.arc().innerRadius(0).outerRadius(radius);
    const arcHover = d3
      .arc()
      .innerRadius(0)
      .outerRadius(radius + 10);
    const labelArc = d3
      .arc()
      .innerRadius(radius * 0.6)
      .outerRadius(radius * 0.6);

    const pieData = pie(raw);

    // --------- Slices ----------
    g.selectAll("path")
      .data(pieData)
      .join("path")
      .attr("d", arc)
      .attr("fill", (d) => d.data.color)
      .attr("stroke", "#101010")
      .attr("stroke-width", 1)
      .on("mouseover", function (event, d) {
        const perc = ((d.data.value / total) * 100).toFixed(1);

        d3.select(this)
          .transition()
          .duration(150)
          .attr("d", arcHover)
          .attr("stroke-width", 2.2);

        tooltip
          .style("opacity", 1)
          .html(
            `<strong>${d.data.mode}</strong><br>` +
              `Share: ${perc}%<br>` +
              `Index: ${d.data.value.toFixed(1)}`,
          );
      })
      .on("mousemove", function (event) {
        tooltip
          .style("left", event.pageX + 12 + "px")
          .style("top", event.pageY + 12 + "px");
      })
      .on("mouseout", function () {
        d3.select(this)
          .transition()
          .duration(150)
          .attr("d", arc)
          .attr("stroke-width", 1);

        tooltip.style("opacity", 0);
      });

    // --------- Labels (percentuali dentro la fetta) ----------
    g.selectAll("text")
      .data(pieData)
      .join("text")
      .attr("class", "mobility-pie-label")
      .attr("transform", (d) => `translate(${labelArc.centroid(d)})`)
      .text((d) => `${Math.round((d.data.value / total) * 100)}%`);

    // --------- Legend sotto (riempie #mobility-pie-legend) ----------
    const legendContainer = d3.select("#mobility-pie-legend");
    if (!legendContainer.empty()) {
      legendContainer.selectAll("*").remove();

      const items = legendContainer
        .selectAll(".mobility-pie-card__legend-item")
        .data(pieData)
        .join("div")
        .attr("class", "mobility-pie-card__legend-item");

      items
        .append("span")
        .attr("class", "mobility-pie-card__legend-color")
        .style("background", (d) => d.data.color);

      items.append("span").text((d) => {
        const perc = Math.round((d.data.value / total) * 100);
        return `${d.data.mode} – ${perc}% (index ${d.data.value.toFixed(1)})`;
      });
    }
  }

  // ========================================
  // BAR CHART – RANDOM RIDERS PER YEAR
  // ========================================
  function renderMobilityBars() {
    const container = d3.select("#mobility-bars");
    if (container.empty()) return;

    // Rimuove eventuali SVG precedenti, NON il titolo
    container.selectAll("svg").remove();

    const node = container.node();
    const width = node.clientWidth || 460;
    const height = node.clientHeight || 260;

    const svg = container
      .append("svg")
      .attr("width", width)
      .attr("height", height);

    const margin = { top: 24, right: 16, bottom: 40, left: 60 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const g = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Anni fittizi
    const years = d3.range(2015, 2025); // 2015–2024

    // Valori casuali ma con tendenza crescente
    let base = 200; // milioni? indice? lo deciderai dopo
    const data = years.map((year, i) => {
      const trend = base + i * 20;
      const noisy = trend + (Math.random() * 40 - 20);
      return {
        year,
        value: Math.max(100, noisy),
      };
    });

    const x = d3
      .scaleBand()
      .domain(data.map((d) => d.year))
      .range([0, innerWidth])
      .padding(0.25);

    const y = d3
      .scaleLinear()
      .domain([0, d3.max(data, (d) => d.value) * 1.1])
      .range([innerHeight, 0]);

    const xAxis = d3.axisBottom(x).tickFormat((d) => d);
    const yAxis = d3
      .axisLeft(y)
      .ticks(5)
      .tickFormat((d) => d3.format(",")(Math.round(d)));

    g.append("g")
      .attr("class", "mobility-bars__axis mobility-bars__axis--x")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(xAxis);

    g.append("g")
      .attr("class", "mobility-bars__axis mobility-bars__axis--y")
      .call(yAxis);

    // Barre
    g.selectAll(".mobility-bars__bar")
      .data(data)
      .join("rect")
      .attr("class", "mobility-bars__bar")
      .attr("x", (d) => x(d.year))
      .attr("y", (d) => y(d.value))
      .attr("width", x.bandwidth())
      .attr("height", (d) => innerHeight - y(d.value))
      .on("mouseover", function (event, d) {
        tooltip
          .style("opacity", 1)
          .html(
            `<strong>${d.year}</strong><br>` +
              `Riders (index): ${Math.round(d.value)}`,
          );
      })
      .on("mousemove", function (event) {
        tooltip
          .style("left", event.pageX + 12 + "px")
          .style("top", event.pageY + 12 + "px");
      })
      .on("mouseout", function () {
        tooltip.style("opacity", 0);
      });
  }

  // ========================================
  // INIT
  // ========================================
  function initHowPeopleMoveCharts() {
    renderMobilityPie();
    renderMobilityBars();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initHowPeopleMoveCharts);
  } else {
    initHowPeopleMoveCharts();
  }
})();
