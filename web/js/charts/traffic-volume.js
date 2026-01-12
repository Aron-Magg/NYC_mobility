// js/charts/traffic-volume.js
// Surface traffic charts from pre-aggregated CSVs
(function () {
  if (typeof d3 === "undefined") {
    console.error("D3 not found. Make sure d3.v7 is loaded before this script.");
    return;
  }

  const DATA_BASE = "../data/processed/traffic";
  const FILES = {
    hourly: `${DATA_BASE}/hourly_by_borough.csv`,
    weekend: `${DATA_BASE}/weekday_vs_weekend.csv`,
    weekday: `${DATA_BASE}/day_of_week.csv`,
    weekshare: `${DATA_BASE}/borough_share.csv`,
    corridors: `${DATA_BASE}/top_corridors.csv`,
  };

  const BORO_COLORS = {
    Manhattan: "#ff3bff",
    Brooklyn: "#00bfff",
    Queens: "#ffd447",
    Bronx: "#1ad15b",
    "Staten Island": "#9c7cff",
  };

  const BORO_ORDER = ["Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island"];

  function getTooltip() {
    let tooltip = d3.select("body").select(".traffic-tooltip");
    if (tooltip.empty()) {
      tooltip = d3.select("body").append("div").attr("class", "traffic-tooltip");
    }
    return tooltip;
  }

  function formatVolume(value) {
    if (!Number.isFinite(value)) return "0";
    const fmt = d3.format(".2s");
    return fmt(value).replace("G", "B");
  }

  function renderHourlyChart(data) {
    const container = d3.select("#traffic-hourly");
    if (container.empty()) return;

    container.selectAll("svg").remove();

    const node = container.node();
    const width = node.clientWidth || 700;
    const height = node.clientHeight || 320;
    const margin = { top: 24, right: 24, bottom: 52, left: 56 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const svg = container
      .append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet");

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const grouped = d3.group(data, (d) => d.Boro);
    const hours = d3.range(0, 24);
    const maxValue = d3.max(data, (d) => d.avg_volume) || 0;

    if (!renderHourlyChart.activeBoros) {
      renderHourlyChart.activeBoros = new Set(BORO_ORDER);
    }

    const activeBoros = BORO_ORDER.filter((boro) => renderHourlyChart.activeBoros.has(boro));

    const x = d3.scaleLinear().domain([0, 23]).range([0, innerWidth]);
    const y = d3.scaleLinear().domain([0, maxValue * 1.1]).range([innerHeight, 0]);

    g.append("g")
      .attr("class", "mobility-bars__axis mobility-bars__axis--x")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(d3.axisBottom(x).ticks(6).tickFormat((d) => `${d}:00`).tickPadding(8));

    g.append("g")
      .attr("class", "mobility-bars__axis mobility-bars__axis--y")
      .call(d3.axisLeft(y).ticks(5).tickFormat(formatVolume));

    g.append("text")
      .attr("class", "traffic-axis-label")
      .attr("x", innerWidth / 2)
      .attr("y", innerHeight + 42)
      .attr("text-anchor", "middle")
      .text("Hour of day");

    g.append("text")
      .attr("class", "traffic-axis-label")
      .attr("transform", "rotate(-90)")
      .attr("x", -innerHeight / 2)
      .attr("y", -46)
      .attr("text-anchor", "middle")
      .text("Avg volume");

    const line = d3
      .line()
      .x((d) => x(d.hour))
      .y((d) => y(d.avg_volume))
      .curve(d3.curveMonotoneX);

    const tooltip = getTooltip();

    activeBoros.forEach((boro) => {
      const series = grouped.get(boro) || [];
      const baseColor = BORO_COLORS[boro] || "#cccccc";
      const values = hours.map((hour) => {
        const found = series.find((d) => d.hour === hour);
        return {
          hour,
          avg_volume: found ? found.avg_volume : 0,
        };
      });

      g.append("path")
        .datum(values)
        .attr("fill", "none")
        .attr("stroke", baseColor)
        .attr("stroke-width", 2.4)
        .attr("opacity", 0.9)
        .attr("d", line);

      g.selectAll(`circle.hour-${boro.replace(/\s+/g, "-")}`)
        .data(values)
        .join("circle")
        .attr("r", 3)
        .attr("fill", baseColor)
        .attr("cx", (d) => x(d.hour))
        .attr("cy", (d) => y(d.avg_volume))
        .on("mouseover", function (event, d) {
          const highlight = d3.color(baseColor)?.brighter(0.7) || baseColor;
          d3.select(this).attr("r", 6).attr("fill", highlight);
          tooltip
            .style("opacity", 1)
            .html(`<strong>${boro}</strong><br>${d.hour}:00 - ${formatVolume(d.avg_volume)}`);
        })
        .on("mousemove", function (event) {
          tooltip.style("left", `${event.pageX + 12}px`).style("top", `${event.pageY + 12}px`);
        })
        .on("mouseout", function () {
          d3.select(this).attr("r", 3).attr("fill", baseColor);
          tooltip.style("opacity", 0);
        });
    });

    const legend = d3.select("#traffic-hourly-legend");
    if (!legend.empty()) {
      legend.selectAll("*").remove();

    const items = legend
      .selectAll("div")
      .data(BORO_ORDER)
      .join("div")
      .attr("class", "traffic-legend__item")
      .style("cursor", "pointer")
      .on("click", (event, boro) => {
        const nextState = new Set(renderHourlyChart.activeBoros);
        if (nextState.has(boro)) {
          if (nextState.size === 1) return;
          nextState.delete(boro);
        } else {
          nextState.add(boro);
        }
        renderHourlyChart.activeBoros = nextState;
        renderHourlyChart(data);
      });

    items
      .append("span")
      .attr("class", "traffic-legend__swatch")
      .style("background", (d) => BORO_COLORS[d] || "#cccccc")
      .style("opacity", (d) => (renderHourlyChart.activeBoros.has(d) ? 1 : 0.4));

    items
      .append("span")
      .style("opacity", (d) => (renderHourlyChart.activeBoros.has(d) ? 1 : 0.4))
      .text((d) => d);
    }
  }

  function renderWeekendChart(data) {
    const container = d3.select("#traffic-weekend");
    if (container.empty()) return;

    container.selectAll("svg").remove();

    const node = container.node();
    const width = node.clientWidth || 420;
    const height = node.clientHeight || 260;
    const margin = { top: 24, right: 18, bottom: 52, left: 56 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const svg = container
      .append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet");

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const grouped = d3.group(data, (d) => d.Boro);
    const series = BORO_ORDER.map((boro) => {
      const values = grouped.get(boro) || [];
      const weekday = values.find((d) => d.is_weekend === false);
      const weekend = values.find((d) => d.is_weekend === true);
      return {
        boro,
        weekday: weekday ? weekday.avg_volume : 0,
        weekend: weekend ? weekend.avg_volume : 0,
      };
    });

    const x0 = d3
      .scaleBand()
      .domain(BORO_ORDER)
      .range([0, innerWidth])
      .padding(0.2);
    const x1 = d3
      .scaleBand()
      .domain(["Weekday", "Weekend"])
      .range([0, x0.bandwidth()])
      .padding(0.15);
    const maxValue = d3.max(series, (d) => Math.max(d.weekday, d.weekend)) || 1;
    const y = d3.scaleLinear().domain([0, maxValue * 1.15]).range([innerHeight, 0]);

    g.append("g")
      .attr("class", "mobility-bars__axis mobility-bars__axis--x")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(d3.axisBottom(x0).tickPadding(8));

    g.append("g")
      .attr("class", "mobility-bars__axis mobility-bars__axis--y")
      .call(d3.axisLeft(y).ticks(4).tickFormat(formatVolume));

    g.append("text")
      .attr("class", "traffic-axis-label")
      .attr("x", innerWidth / 2)
      .attr("y", innerHeight + 42)
      .attr("text-anchor", "middle")
      .text("Borough");

    g.append("text")
      .attr("class", "traffic-axis-label")
      .attr("transform", "rotate(-90)")
      .attr("x", -innerHeight / 2)
      .attr("y", -46)
      .attr("text-anchor", "middle")
      .text("Avg volume");

    const tooltip = getTooltip();

    const barGroups = g
      .selectAll("g.bar-group")
      .data(series)
      .join("g")
      .attr("class", "bar-group")
      .attr("transform", (d) => `translate(${x0(d.boro)},0)`);

    barGroups
      .selectAll("rect")
      .data((d) => [
        { label: "Weekday", value: d.weekday, boro: d.boro, color: "#9c7cff" },
        { label: "Weekend", value: d.weekend, boro: d.boro, color: "#ffb347" },
      ])
      .join("rect")
      .attr("x", (d) => x1(d.label))
      .attr("y", (d) => y(d.value))
      .attr("width", x1.bandwidth())
      .attr("height", (d) => innerHeight - y(d.value))
      .attr("fill", (d) => d.color)
      .on("mouseover", function (event, d) {
        const highlight = d3.color(d.color)?.brighter(0.7) || d.color;
        d3.select(this).attr("fill", highlight);
        tooltip
          .style("opacity", 1)
          .html(`<strong>${d.boro}</strong><br>${d.label}: ${formatVolume(d.value)}`);
      })
      .on("mousemove", function (event) {
        tooltip.style("left", `${event.pageX + 12}px`).style("top", `${event.pageY + 12}px`);
      })
      .on("mouseout", function (event, d) {
        d3.select(this).attr("fill", d.color);
        tooltip.style("opacity", 0);
      });
  }

  function renderWeekdayChart(data) {
    const container = d3.select("#traffic-weekdays");
    if (container.empty()) return;

    container.selectAll("svg").remove();

    const node = container.node();
    const width = node.clientWidth || 420;
    const height = node.clientHeight || 260;
    const margin = { top: 20, right: 18, bottom: 52, left: 56 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const dayOrder = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const weekdayColor = "#9c7cff";
    const weekendColor = "#ffb347";
    const sorted = data
      .map((d) => ({ ...d }))
      .sort((a, b) => a.weekday_index - b.weekday_index);

    const x = d3
      .scaleBand()
      .domain(dayOrder)
      .range([0, innerWidth])
      .padding(0.2);
    const maxValue = d3.max(sorted, (d) => d.avg_volume) || 1;
    const y = d3.scaleLinear().domain([0, maxValue * 1.15]).range([innerHeight, 0]);

    const svg = container
      .append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet");

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    g.append("g")
      .attr("class", "mobility-bars__axis mobility-bars__axis--x")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(d3.axisBottom(x).tickPadding(8));

    g.append("g")
      .attr("class", "mobility-bars__axis mobility-bars__axis--y")
      .call(d3.axisLeft(y).ticks(4).tickFormat(formatVolume));

    g.append("text")
      .attr("class", "traffic-axis-label")
      .attr("x", innerWidth / 2)
      .attr("y", innerHeight + 42)
      .attr("text-anchor", "middle")
      .text("Day of week");

    g.append("text")
      .attr("class", "traffic-axis-label")
      .attr("transform", "rotate(-90)")
      .attr("x", -innerHeight / 2)
      .attr("y", -46)
      .attr("text-anchor", "middle")
      .text("Avg volume");

    const tooltip = getTooltip();

    g.selectAll("rect")
      .data(sorted)
      .join("rect")
      .attr("x", (d) => x(dayOrder[d.weekday_index]))
      .attr("y", (d) => y(d.avg_volume))
      .attr("width", x.bandwidth())
      .attr("height", (d) => innerHeight - y(d.avg_volume))
      .attr("fill", (d) => (d.weekday_index <= 4 ? weekdayColor : weekendColor))
      .attr("opacity", 0.9)
      .on("mouseover", function (event, d) {
        const baseColor = d.weekday_index <= 4 ? weekdayColor : weekendColor;
        const highlight = d3.color(baseColor)?.brighter(0.7) || baseColor;
        d3.select(this).attr("fill", highlight);
        tooltip
          .style("opacity", 1)
          .html(`<strong>${dayOrder[d.weekday_index]}</strong><br>${formatVolume(d.avg_volume)}`);
      })
      .on("mousemove", function (event) {
        tooltip.style("left", `${event.pageX + 12}px`).style("top", `${event.pageY + 12}px`);
      })
      .on("mouseout", function (event, d) {
        const baseColor = d.weekday_index <= 4 ? weekdayColor : weekendColor;
        d3.select(this).attr("fill", baseColor);
        tooltip.style("opacity", 0);
      });
  }

  function renderWeeklyShare(data) {
    const container = d3.select("#traffic-weekly-share");
    if (container.empty()) return;

    container.selectAll("svg").remove();

    const node = container.node();
    const height = node.clientHeight || 260;
    const width = node.clientWidth || 280;

    const svg = container
      .append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet");

    const g = svg.append("g").attr("transform", `translate(${width / 2},${height / 2})`);

    const pieData = data
      .map((d) => ({
        label: d.Boro,
        value: d.avg_volume,
        color: BORO_COLORS[d.Boro] || "#cccccc",
      }))
      .sort((a, b) => BORO_ORDER.indexOf(a.label) - BORO_ORDER.indexOf(b.label));

    const total = d3.sum(pieData, (d) => d.value) || 1;
    const radius = Math.min(width, height) / 2 - 6;
    const pie = d3.pie().sort(null).value((d) => d.value);
    const arc = d3.arc().innerRadius(0).outerRadius(radius);
    const arcHover = d3.arc().innerRadius(0).outerRadius(radius + 6);
    const labelArc = d3.arc().innerRadius(radius * 0.62).outerRadius(radius * 0.62);

    const tooltip = getTooltip();

    g.selectAll("path")
      .data(pie(pieData))
      .join("path")
      .attr("d", arc)
      .attr("fill", (d) => d.data.color)
      .attr("stroke", "#101010")
      .attr("stroke-width", 1)
      .on("mouseover", function (event, d) {
        const perc = ((d.data.value / total) * 100).toFixed(1);
        d3.select(this).transition().duration(150).attr("d", arcHover).attr("stroke-width", 2);
        tooltip
          .style("opacity", 1)
          .html(`<strong>${d.data.label}</strong><br>${perc}% share`);
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
      .attr("font-size", 13)
      .attr("font-weight", "700")
      .attr("stroke", "#101010")
      .attr("stroke-width", 2.5)
      .attr("paint-order", "stroke")
      .text((d) => `${Math.round((d.data.value / total) * 100)}%`);
  }

  function renderCorridorChart(data) {
    const container = d3.select("#traffic-corridors");
    if (container.empty()) return;

    container.selectAll("svg").remove();

    const node = container.node();
    const width = node.clientWidth || 420;
    const height = node.clientHeight || 260;
    const margin = { top: 20, right: 20, bottom: 24, left: 160 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const topData = data.slice(0, 10);
    const maxValue = d3.max(topData, (d) => d.total_volume) || 1;

    const svg = container
      .append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet");

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const y = d3
      .scaleBand()
      .domain(topData.map((d) => d.corridor))
      .range([0, innerHeight])
      .padding(0.2);
    const x = d3.scaleLinear().domain([0, maxValue * 1.1]).range([0, innerWidth]);

    g.append("g")
      .attr("class", "mobility-bars__axis mobility-bars__axis--x")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(d3.axisBottom(x).ticks(4).tickFormat(formatVolume));

    g.append("g").attr("class", "mobility-bars__axis mobility-bars__axis--y").call(
      d3.axisLeft(y).tickFormat((d) => {
        const parts = d.split("|").map((part) => part.trim());
        return parts[0] || d;
      }),
    );

    const tooltip = getTooltip();

    const baseColor = "#1ad15b";
    g.selectAll("rect")
      .data(topData)
      .join("rect")
      .attr("x", 0)
      .attr("y", (d) => y(d.corridor))
      .attr("width", (d) => x(d.total_volume))
      .attr("height", y.bandwidth())
      .attr("fill", baseColor)
      .attr("opacity", 0.9)
      .on("mouseover", function (event, d) {
        const highlight = d3.color(baseColor)?.brighter(0.7) || baseColor;
        d3.select(this).attr("fill", highlight);
        tooltip
          .style("opacity", 1)
          .html(`<strong>${d.corridor}</strong><br>Total: ${formatVolume(d.total_volume)}`);
      })
      .on("mousemove", function (event) {
        tooltip.style("left", `${event.pageX + 12}px`).style("top", `${event.pageY + 12}px`);
      })
      .on("mouseout", function () {
        d3.select(this).attr("fill", baseColor);
        tooltip.style("opacity", 0);
      });
  }

  Promise.all([
    d3.csv(FILES.hourly, (d) => ({
      Boro: d.Boro?.trim() || "",
      hour: Number(d.hour),
      avg_volume: Number(d.avg_volume),
    })),
    d3.csv(FILES.weekend, (d) => ({
      Boro: d.Boro?.trim() || "",
      is_weekend: String(d.is_weekend).toLowerCase() === "true",
      avg_volume: Number(d.avg_volume),
    })),
    d3.csv(FILES.weekday, (d) => ({
      weekday_index: Number(d.weekday_index),
      avg_volume: Number(d.avg_volume),
    })),
    d3.csv(FILES.weekshare, (d) => ({
      Boro: d.Boro?.trim() || "",
      avg_volume: Number(d.avg_volume),
    })),
    d3.csv(FILES.corridors, (d) => ({
      corridor: d.corridor,
      total_volume: Number(d.total_volume),
    })),
  ])
    .then(([hourly, weekend, weekday, weekshare, corridors]) => {
      renderHourlyChart(hourly);
      renderWeekendChart(weekend);
      renderWeekdayChart(weekday);
      renderWeeklyShare(weekshare);
      renderCorridorChart(corridors);
    })
    .catch((error) => {
      console.error("Failed to load traffic CSVs", error);
    });
})();
