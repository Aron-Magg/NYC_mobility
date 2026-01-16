// js/charts/taxi-charts.js
// Taxi/FHV charts from pre-aggregated CSVs
(function () {
  function initTaxiCharts() {
    if (typeof d3 === "undefined") {
      console.error("D3 not found. Make sure d3.v7 is loaded before this script.");
      return;
    }

    const root = document.getElementById("chapter-taxis");
    if (!root) return;

    const DATA_BASE = "data/processed/yellow_taxi";
    const FILES = {
      volume: `${DATA_BASE}/taxi_trip_volume_monthly.csv`,
      heatmap: `${DATA_BASE}/taxi_pickups_by_dow_hour.csv`,
      distance: `${DATA_BASE}/taxi_distance_bins.csv`,
      duration: `${DATA_BASE}/taxi_duration_bins.csv`,
      provider: `${DATA_BASE}/taxi_provider_share.csv`,
      borough: `${DATA_BASE}/taxi_pickup_borough_share.csv`,
      zones: `${DATA_BASE}/taxi_top_pickup_zones.csv`,
      od: `${DATA_BASE}/taxi_top_od_pairs.csv`,
    };

    const loadCsv = window.loadCsvMaybeParts || d3.csv;

    const SERVICE_META = {
      yellow: { label: "Yellow taxi", color: "#c39c17" },
      green: { label: "Green taxi", color: "#0f7f37" },
      fhv: { label: "FHV", color: "#117aa3" },
      hvfhs: { label: "HVFHS", color: "#b12a8a" },
    };

    const SERVICE_ORDER = ["yellow", "green", "fhv", "hvfhs"];

    const TOOLTIP_CLASS = "tripdata-tooltip";
    const serviceSelection = new Map();

    function getTooltip() {
      let tooltip = d3.select("body").select(`.${TOOLTIP_CLASS}`);
      if (tooltip.empty()) {
        tooltip = d3.select("body").append("div").attr("class", TOOLTIP_CLASS);
      }
      return tooltip;
    }

    function formatNumber(value) {
      if (!Number.isFinite(value)) return "0";
      const fmt = d3.format(".2s");
      return fmt(value).replace("G", "B");
    }

    function formatPercent(value) {
      if (!Number.isFinite(value)) return "0%";
      return `${(value * 100).toFixed(1)}%`;
    }

    function clearContainer(selector) {
      const container = d3.select(selector);
      if (container.empty()) return null;
      container.selectAll("svg").remove();
      return container;
    }

    function renderLegend(containerTarget, items, options = {}) {
      const container =
        typeof containerTarget === "string" ? d3.select(containerTarget) : d3.select(containerTarget);
      if (container.empty()) return;

      const { onClick, activeKeys, key = "key", layout = "row" } = options;
      container.selectAll("*").remove();
      const isRow = layout !== "column";

      container
        .style("display", "flex")
        .style("flex-direction", isRow ? "row" : "column")
        .style("flex-wrap", isRow ? "wrap" : "nowrap")
        .style("gap", isRow ? "8px 14px" : "8px")
        .style("align-items", isRow ? "center" : "flex-start");

      const nodes = container
        .selectAll("div")
        .data(items)
        .join("div")
        .attr("class", "tripdata-legend__item")
        .style("cursor", onClick ? "pointer" : "default")
        .style("opacity", (d) =>
          activeKeys ? (activeKeys.has(d[key]) ? 1 : 0.4) : 1,
        )
        .on("click", onClick || null);

      nodes
        .append("span")
        .attr("class", "tripdata-legend__swatch")
        .style("background", (d) => d.color);

      nodes.append("span").text((d) => d.label);
    }

    function renderMonthlyVolume(data) {
      const container = clearContainer("#taxi-volume-line");
      if (!container) return;

      const node = container.node();
      const width = node.clientWidth || 820;
      const height = node.clientHeight || 320;
      const margin = { top: 24, right: 24, bottom: 64, left: 72 };
      const innerWidth = width - margin.left - margin.right;
      const innerHeight = height - margin.top - margin.bottom;

      const parsed = data
        .map((d) => ({
          service: String(d.service || "").trim(),
          year: Number(d.year),
          month: Number(d.month),
          trips: Number(d.trips),
        }))
        .filter(
          (d) =>
            SERVICE_META[d.service] &&
            Number.isFinite(d.year) &&
            Number.isFinite(d.month) &&
            Number.isFinite(d.trips) &&
            d.year >= 2014 &&
            d.year <= 2023 &&
            d.month >= 1 &&
            d.month <= 12,
        )
        .map((d) => ({
          service: d.service,
          date: new Date(d.year, d.month - 1, 1),
          trips: d.trips,
        }));

      const grouped = d3.group(parsed, (d) => d.service);

      const x = d3
        .scaleTime()
        .domain([new Date(2014, 0, 1), new Date(2023, 11, 31)])
        .range([0, innerWidth]);
      if (!renderMonthlyVolume.active) {
        renderMonthlyVolume.active = new Set(SERVICE_ORDER);
      }
      const active = renderMonthlyVolume.active;

      const activeValues = Array.from(active)
        .flatMap((service) => grouped.get(service) || [])
        .map((d) => d.trips);
      const yMax = d3.max(activeValues) || 1;
      const y = d3.scaleLinear().domain([0, yMax * 1.08]).range([innerHeight, 0]);

      const svg = container
        .append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("preserveAspectRatio", "xMidYMid meet");

      const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

      g.append("g")
        .attr("class", "mobility-bars__axis mobility-bars__axis--x")
        .attr("transform", `translate(0,${innerHeight})`)
        .call(d3.axisBottom(x).ticks(6).tickFormat(d3.timeFormat("%Y")));

      g.append("g")
        .attr("class", "mobility-bars__axis mobility-bars__axis--y")
        .call(d3.axisLeft(y).ticks(5).tickFormat(formatNumber));

      g.append("text")
        .attr("class", "tripdata-axis-label")
        .attr("x", innerWidth / 2)
        .attr("y", innerHeight + 50)
        .attr("text-anchor", "middle")
        .text("Year");

      g.append("text")
        .attr("class", "tripdata-axis-label")
        .attr("transform", "rotate(-90)")
        .attr("x", -innerHeight / 2)
        .attr("y", -60)
        .attr("text-anchor", "middle")
        .text("Trips per month");

      const line = d3
        .line()
        .x((d) => x(d.date))
        .y((d) => y(d.trips))
        .curve(d3.curveMonotoneX);

      const tooltip = getTooltip();

      SERVICE_ORDER.forEach((service) => {
        const series = grouped.get(service) || [];
        if (!series.length || !active.has(service)) return;

        g.append("path")
          .datum(series)
          .attr("fill", "none")
          .attr("stroke", SERVICE_META[service].color)
          .attr("stroke-width", 2.4)
          .attr("opacity", 0.95)
          .attr("d", line);

        g.selectAll(`circle.taxi-line-${service}`)
          .data(series)
          .join("circle")
          .attr("r", 2.6)
          .attr("fill", SERVICE_META[service].color)
          .attr("cx", (d) => x(d.date))
          .attr("cy", (d) => y(d.trips))
          .on("mouseover", function (event, d) {
            const highlight = d3.color(SERVICE_META[service].color)?.brighter(0.6) || SERVICE_META[service].color;
            d3.select(this).attr("r", 5).attr("fill", highlight);
            tooltip
              .style("opacity", 1)
              .html(
                `<strong>${SERVICE_META[service].label}</strong><br>` +
                  `${d3.timeFormat("%b %Y")(d.date)}: ${formatNumber(d.trips)}`,
              );
          })
          .on("mousemove", function (event) {
            tooltip.style("left", `${event.pageX + 12}px`).style("top", `${event.pageY + 12}px`);
          })
          .on("mouseout", function () {
            d3.select(this).attr("r", 2.6).attr("fill", SERVICE_META[service].color);
            tooltip.style("opacity", 0);
          });
      });

      renderLegend(
        "#taxi-volume-legend",
        SERVICE_ORDER.map((key) => ({ key, label: SERVICE_META[key].label, color: SERVICE_META[key].color })),
        {
          key: "key",
          activeKeys: active,
          onClick: (event, d) => {
            const next = new Set(active);
            if (next.has(d.key)) {
              if (next.size === 1) return;
              next.delete(d.key);
            } else {
              next.add(d.key);
            }
            renderMonthlyVolume.active = next;
            renderMonthlyVolume(data);
          },
        },
      );
    }

    function renderHeatmap(data) {
      const container = clearContainer("#taxi-heatmap");
      if (!container) return;

      const node = container.node();
      const width = node.clientWidth || 820;
      const height = node.clientHeight || 320;
      const margin = { top: 24, right: 24, bottom: 64, left: 76 };
      const innerWidth = width - margin.left - margin.right;
      const innerHeight = height - margin.top - margin.bottom;

      const services = SERVICE_ORDER.filter((service) => data.some((d) => d.service === service));

      if (!renderHeatmap.activeService || !services.includes(renderHeatmap.activeService)) {
        renderHeatmap.activeService = services[0] || "yellow";
      }
      const active = renderHeatmap.activeService;

      const filtered = data.filter((d) => d.service === active);
      if (!filtered.length) return;

      const hours = d3.range(0, 24);
      const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

      const valueMap = new Map();
      filtered.forEach((d) => {
        const key = `${d.dow_label}|${d.hour}`;
        valueMap.set(key, d.avg_trips);
      });

      const maxValue = d3.max(filtered, (d) => d.avg_trips) || 1;
      const color = d3.scaleSequential(d3.interpolatePuBuGn).domain([0, maxValue]);

      const x = d3.scaleBand().domain(hours).range([0, innerWidth]).padding(0.04);
      const y = d3.scaleBand().domain(days).range([0, innerHeight]).padding(0.04);

      const svg = container
        .append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("preserveAspectRatio", "xMidYMid meet");

      const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

      g.append("g")
        .attr("class", "mobility-bars__axis mobility-bars__axis--x")
        .attr("transform", `translate(0,${innerHeight})`)
        .call(d3.axisBottom(x).tickValues([0, 4, 8, 12, 16, 20, 23]));

      g.append("g")
        .attr("class", "mobility-bars__axis mobility-bars__axis--y")
        .call(d3.axisLeft(y));

      g.append("text")
        .attr("class", "tripdata-axis-label")
        .attr("x", innerWidth / 2)
        .attr("y", innerHeight + 50)
        .attr("text-anchor", "middle")
        .text("Hour of day");

      g.append("text")
        .attr("class", "tripdata-axis-label")
        .attr("transform", "rotate(-90)")
        .attr("x", -innerHeight / 2)
        .attr("y", -60)
        .attr("text-anchor", "middle")
        .text("Day of week");

      const tooltip = getTooltip();

      const cells = [];
      days.forEach((day) => {
        hours.forEach((hour) => {
          const key = `${day}|${hour}`;
          cells.push({
            day,
            hour,
            value: valueMap.get(key) || 0,
          });
        });
      });

      g.selectAll("rect")
        .data(cells)
        .join("rect")
        .attr("x", (d) => x(d.hour))
        .attr("y", (d) => y(d.day))
        .attr("width", x.bandwidth())
        .attr("height", y.bandwidth())
        .attr("fill", (d) => color(d.value))
        .attr("stroke", "#0a0a0a")
        .attr("stroke-width", 0.4)
        .on("mouseover", function (event, d) {
          d3.select(this).attr("stroke", "#f2f3f4").attr("stroke-width", 1.1);
          tooltip
            .style("opacity", 1)
            .html(`<strong>${d.day} ${d.hour}:00</strong><br>${formatNumber(d.value)} avg trips`);
        })
        .on("mousemove", function (event) {
          tooltip.style("left", `${event.pageX + 12}px`).style("top", `${event.pageY + 12}px`);
        })
        .on("mouseout", function () {
          d3.select(this).attr("stroke", "#0a0a0a").attr("stroke-width", 0.4);
          tooltip.style("opacity", 0);
        });

      const legendHost = d3.select("#taxi-heatmap-legend");
      if (!legendHost.empty()) {
        legendHost.selectAll("*").remove();
        legendHost
          .style("display", "flex")
          .style("width", "100%")
          .style("flex-direction", "row")
          .style("align-items", "flex-end")
          .style("justify-content", "space-between")
          .style("gap", "16px")
          .style("flex-wrap", "nowrap");

        const selectionWrap = legendHost
          .append("div")
          .style("margin-right", "auto");
        renderLegend(
          selectionWrap.node(),
          services.map((key) => ({ key, label: SERVICE_META[key].label, color: SERVICE_META[key].color })),
          {
            key: "key",
            activeKeys: new Set([active]),
            onClick: (event, d) => {
              renderHeatmap.activeService = d.key;
              renderHeatmap(data);
            },
          },
        );

        const gradientWidth = 140;
        const gradientHeight = 10;
        const gradientId = `taxi-heatmap-gradient-${active}`;

        const scaleWrap = legendHost
          .append("div")
          .style("display", "flex")
          .style("flex-direction", "column")
          .style("gap", "4px")
          .style("align-items", "flex-end")
          .style("font-family", "ConsolasBold, monospace")
          .style("color", "rgba(242, 243, 244, 0.9)")
          .style("font-size", "12px");

        const scaleSvg = scaleWrap
          .append("svg")
          .attr("width", gradientWidth)
          .attr("height", gradientHeight);

        const defs = scaleSvg.append("defs");
        const gradient = defs
          .append("linearGradient")
          .attr("id", gradientId)
          .attr("x1", "0%")
          .attr("y1", "0%")
          .attr("x2", "100%")
          .attr("y2", "0%");

        d3.range(0, 1.01, 0.2).forEach((t) => {
          gradient
            .append("stop")
            .attr("offset", `${t * 100}%`)
            .attr("stop-color", color(t * maxValue));
        });

        scaleSvg
          .append("rect")
          .attr("x", 0)
          .attr("y", 0)
          .attr("width", gradientWidth)
          .attr("height", gradientHeight)
          .attr("rx", 2)
          .attr("fill", `url(#${gradientId})`);

        const labelRow = scaleWrap
          .append("div")
          .style("display", "flex")
          .style("justify-content", "space-between")
          .style("width", `${gradientWidth}px`);

        labelRow.append("span").text("0");
        labelRow.append("span").text(formatNumber(maxValue));
      }
    }

    function renderGroupedBars({
      selector,
      data,
      categories,
      valueKey,
      valueFormatter,
      title,
      legendId,
      maxValue,
      xAxisLabel,
      yAxisLabel,
      marginBottom,
      xAxisLabelOffset,
      yAxisLabelOffset,
      leftMargin,
    }) {
      const container = clearContainer(selector);
      if (!container) return;

      const node = container.node();
      const width = node.clientWidth || 420;
      const height = node.clientHeight || 360;
      const margin = {
        top: 24,
        right: 20,
        bottom: marginBottom || 54,
        left: leftMargin || 64,
      };
      const innerWidth = width - margin.left - margin.right;
      const innerHeight = height - margin.top - margin.bottom;

      const servicesWithData = SERVICE_ORDER.filter((service) => data.some((d) => d.service === service));
      const services = servicesWithData.length ? servicesWithData : SERVICE_ORDER;

      const byCategory = new Map();
      categories.forEach((category) => {
        const row = { category };
        services.forEach((service) => {
          row[service] = 0;
        });
        byCategory.set(category, row);
      });

      data.forEach((d) => {
        if (!byCategory.has(d.category) || !SERVICE_META[d.service]) return;
        byCategory.get(d.category)[d.service] = d[valueKey];
      });

      const rows = Array.from(byCategory.values());
      const yMax =
        maxValue ||
        d3.max(rows, (row) => d3.max(services, (service) => row[service])) ||
        1;

      const x0 = d3.scaleBand().domain(categories).range([0, innerWidth]).padding(0.2);
      const x1 = d3
        .scaleBand()
        .domain(services)
        .range([0, x0.bandwidth()])
        .padding(0.15);
      const y = d3.scaleLinear().domain([0, yMax * 1.1]).range([innerHeight, 0]);

      const svg = container
        .append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("preserveAspectRatio", "xMidYMid meet");

      const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

      g.append("g")
        .attr("class", "mobility-bars__axis mobility-bars__axis--x")
        .attr("transform", `translate(0,${innerHeight})`)
        .call(d3.axisBottom(x0));

      g.append("g")
        .attr("class", "mobility-bars__axis mobility-bars__axis--y")
        .call(d3.axisLeft(y).ticks(4).tickFormat(valueFormatter || formatNumber));

      if (xAxisLabel) {
        g.append("text")
          .attr("class", "mobility-bars__axis-label")
          .attr("x", innerWidth / 2)
          .attr("y", innerHeight + (xAxisLabelOffset || 44))
          .attr("text-anchor", "middle")
          .text(xAxisLabel);
      }

      if (yAxisLabel) {
        g.append("text")
          .attr("class", "mobility-bars__axis-label")
          .attr("transform", "rotate(-90)")
          .attr("x", -innerHeight / 2)
          .attr("y", yAxisLabelOffset || -48)
          .attr("text-anchor", "middle")
          .text(yAxisLabel);
      }

      const tooltip = getTooltip();

      const barsGroup = g.append("g").attr("class", "mobility-bars__groups");

      barsGroup
        .selectAll("g")
        .data(rows)
        .join("g")
        .attr("transform", (d) => `translate(${x0(d.category)},0)`)
        .selectAll("rect")
        .data((d) =>
          services.map((service) => ({
            service,
            value: d[service],
            category: d.category,
          })),
        )
        .join("rect")
        .attr("x", (d) => x1(d.service))
        .attr("y", (d) => y(d.value))
        .attr("width", x1.bandwidth())
        .attr("height", (d) => innerHeight - y(d.value))
        .attr("fill", (d) => SERVICE_META[d.service].color)
        .attr("opacity", 0.85)
        .on("mouseover", function (event, d) {
          const highlight = d3.color(SERVICE_META[d.service].color)?.brighter(0.6) || SERVICE_META[d.service].color;
          d3.select(this).attr("fill", highlight);
          tooltip
            .style("opacity", 1)
            .html(
              `<strong>${SERVICE_META[d.service].label}</strong><br>` +
                `${d.category}: ${valueFormatter ? valueFormatter(d.value) : formatNumber(d.value)}`,
            );
        })
        .on("mousemove", function (event) {
          tooltip.style("left", `${event.pageX + 12}px`).style("top", `${event.pageY + 12}px`);
        })
        .on("mouseout", function (event, d) {
          d3.select(this).attr("fill", SERVICE_META[d.service].color);
          tooltip.style("opacity", 0);
        });

      const labelFormatter = valueFormatter || formatNumber;
      const barLabelData = rows.flatMap((row) =>
        services
          .map((service) => ({
            service,
            value: row[service],
            category: row.category,
          }))
          .filter((item) => item.value > 0),
      );

      g.append("g")
        .attr("class", "mobility-bars__labels")
        .selectAll("text")
        .data(barLabelData)
        .join("text")
        .attr("class", "mobility-bars__bar-label")
        .attr("x", (d) => x0(d.category) + x1(d.service) + x1.bandwidth() / 2)
        .attr("y", (d) => Math.max(y(d.value) - 6, 12))
        .attr("text-anchor", "middle")
        .text((d) => labelFormatter(d.value));

      if (legendId) {
        renderLegend(
          legendId,
          services.map((key) => ({ key, label: SERVICE_META[key].label, color: SERVICE_META[key].color })),
        );
      }

      if (title) {
        svg
          .append("text")
          .attr("class", "transport-usage-line__title")
          .attr("x", width - 16)
          .attr("y", 20)
          .attr("text-anchor", "end")
          .text(title);
      }
    }

    function renderProviderShare(data) {
      const container = clearContainer("#taxi-provider-share");
      if (!container) return;

      const node = container.node();
      const width = node.clientWidth || 420;
      const height = node.clientHeight || 260;
      const margin = { top: 24, right: 136, bottom: 52, left: 120 };
      const innerWidth = width - margin.left - margin.right;
      const innerHeight = height - margin.top - margin.bottom;

      const rows = data
        .map((d) => ({ provider: d.provider, share: Number(d.share) }))
        .sort((a, b) => b.share - a.share);

      const y = d3
        .scaleBand()
        .domain(rows.map((d) => d.provider))
        .range([0, innerHeight])
        .padding(0.25);
      const x = d3
        .scaleLinear()
        .domain([0, (d3.max(rows, (d) => d.share) || 1) * 1.15])
        .range([0, innerWidth]);

      const svg = container
        .append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("preserveAspectRatio", "xMidYMid meet");

      const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

      g.append("g")
        .attr("class", "mobility-bars__axis mobility-bars__axis--x")
        .attr("transform", `translate(0,${innerHeight})`)
        .call(d3.axisBottom(x).ticks(4).tickFormat(d3.format(".0%")));

      g.append("g")
        .attr("class", "mobility-bars__axis mobility-bars__axis--y")
        .call(d3.axisLeft(y).tickSize(0));

      g.append("text")
        .attr("class", "mobility-bars__axis-label")
        .attr("x", innerWidth / 2)
        .attr("y", innerHeight + 44)
        .attr("text-anchor", "middle")
        .text("Share of trips (%)");

      g.append("text")
        .attr("class", "mobility-bars__axis-label")
        .attr("transform", "rotate(-90)")
        .attr("x", -innerHeight / 2)
        .attr("y", -92)
        .attr("text-anchor", "middle")
        .text("Provider");

      const tooltip = getTooltip();

      g.selectAll("rect")
        .data(rows)
        .join("rect")
        .attr("x", 0)
        .attr("y", (d) => y(d.provider))
        .attr("width", (d) => x(d.share))
        .attr("height", y.bandwidth())
        .attr("fill", "#9c7cff")
        .attr("opacity", 0.9)
        .on("mouseover", function (event, d) {
          const highlight = d3.color("#9c7cff")?.brighter(0.6) || "#9c7cff";
          d3.select(this).attr("fill", highlight);
          tooltip.style("opacity", 1).html(`<strong>${d.provider}</strong><br>${formatPercent(d.share)}`);
        })
        .on("mousemove", function (event) {
          tooltip.style("left", `${event.pageX + 12}px`).style("top", `${event.pageY + 12}px`);
        })
        .on("mouseout", function () {
          d3.select(this).attr("fill", "#9c7cff");
          tooltip.style("opacity", 0);
        });

      const providerLabelGap = 36;
      g.selectAll("text.provider-value")
        .data(rows)
        .join("text")
        .attr("class", "mobility-bars__bar-label")
        .attr("x", (d) => {
          const end = x(d.share);
          const padded = end + providerLabelGap;
          return Math.min(padded, innerWidth + margin.right - providerLabelGap);
        })
        .attr("y", (d) => y(d.provider) + y.bandwidth() / 2)
        .attr("dy", "0.35em")
        .attr("text-anchor", "start")
        .text((d) => formatPercent(d.share));
    }

    function renderServiceSortedBars({
      selector,
      data,
      valueKey,
      labelKey,
      legendId,
      maxItems,
      formatValue,
      xAxisLabel,
      yAxisLabel,
      leftMargin,
      rightMargin,
      marginBottom,
      xAxisLabelOffset,
      yAxisLabelOffset,
      labelGap,
    }) {
      const container = clearContainer(selector);
      if (!container) return;

      const stateKey = selector;
      const active = serviceSelection.get(stateKey) || "yellow";
      serviceSelection.set(stateKey, active);

      const filtered = data.filter((d) => d.service === active);
      const latestYear = d3.max(filtered, (d) => d.year) || null;
      let yearFiltered = latestYear ? filtered.filter((d) => d.year === latestYear) : filtered;
      const minItems = Math.min(maxItems, filtered.length);
      if (yearFiltered.length < minItems) {
        yearFiltered = filtered;
      }
      const rows = yearFiltered
        .slice()
        .sort((a, b) => b[valueKey] - a[valueKey])
        .slice(0, maxItems);

      const node = container.node();
      const width = node.clientWidth || 420;
      const height = node.clientHeight || 320;
      const margin = {
        top: 18,
        right: rightMargin || 20,
        bottom: marginBottom || 32,
        left: leftMargin || 210,
      };
      const innerWidth = width - margin.left - margin.right;
      const innerHeight = height - margin.top - margin.bottom;

      const y = d3
        .scaleBand()
        .domain(rows.map((d) => d[labelKey]))
        .range([0, innerHeight])
        .padding(0.2);
      const x = d3.scaleLinear().domain([0, (d3.max(rows, (d) => d[valueKey]) || 1) * 1.1]).range([0, innerWidth]);

      const svg = container
        .append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("preserveAspectRatio", "xMidYMid meet");

      const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

      g.append("g")
        .attr("class", "mobility-bars__axis mobility-bars__axis--x")
        .attr("transform", `translate(0,${innerHeight})`)
        .call(d3.axisBottom(x).ticks(4).tickFormat(formatValue || formatNumber));

      g.append("g")
        .attr("class", "mobility-bars__axis mobility-bars__axis--y")
        .call(d3.axisLeft(y).tickSize(0));

      if (xAxisLabel) {
        g.append("text")
          .attr("class", "mobility-bars__axis-label")
          .attr("x", innerWidth / 2)
          .attr("y", innerHeight + (xAxisLabelOffset || 40))
          .attr("text-anchor", "middle")
          .text(xAxisLabel);
      }

      if (yAxisLabel) {
        g.append("text")
          .attr("class", "mobility-bars__axis-label")
          .attr("transform", "rotate(-90)")
          .attr("x", -innerHeight / 2)
          .attr("y", yAxisLabelOffset || -54)
          .attr("text-anchor", "middle")
          .text(yAxisLabel);
      }

      const tooltip = getTooltip();
      const color = SERVICE_META[active]?.color || "#ffd447";

      g.selectAll("rect")
        .data(rows)
        .join("rect")
        .attr("x", 0)
        .attr("y", (d) => y(d[labelKey]))
        .attr("width", (d) => x(d[valueKey]))
        .attr("height", y.bandwidth())
        .attr("fill", color)
        .attr("opacity", 0.9)
        .on("mouseover", function (event, d) {
          const highlight = d3.color(color)?.brighter(0.6) || color;
          d3.select(this).attr("fill", highlight);
          tooltip
            .style("opacity", 1)
            .html(`<strong>${d[labelKey]}</strong><br>${formatNumber(d[valueKey])} trips`);
        })
        .on("mousemove", function (event) {
          tooltip.style("left", `${event.pageX + 12}px`).style("top", `${event.pageY + 12}px`);
        })
        .on("mouseout", function () {
          d3.select(this).attr("fill", color);
          tooltip.style("opacity", 0);
        });

      const barLabelGap = Number.isFinite(labelGap) ? labelGap : 8;
      g.selectAll("text.service-value")
        .data(rows)
        .join("text")
        .attr("class", "mobility-bars__bar-label")
        .attr("x", (d) =>
          Math.min(x(d[valueKey]) + barLabelGap, innerWidth + (rightMargin || 20) - barLabelGap),
        )
        .attr("y", (d) => y(d[labelKey]) + y.bandwidth() / 2)
        .attr("dy", "0.35em")
        .attr("text-anchor", "start")
        .text((d) => (formatValue || formatNumber)(d[valueKey]));

      renderLegend(
        legendId,
        SERVICE_ORDER.map((key) => ({ key, label: SERVICE_META[key].label, color: SERVICE_META[key].color })),
        {
          key: "key",
          activeKeys: new Set([active]),
          onClick: (event, d) => {
            serviceSelection.set(stateKey, d.key);
            renderServiceSortedBars({
              selector,
              data,
              valueKey,
              labelKey,
              legendId,
              maxItems,
              formatValue,
              xAxisLabel,
              yAxisLabel,
              leftMargin,
              rightMargin,
              marginBottom,
              xAxisLabelOffset,
              yAxisLabelOffset,
              labelGap,
            });
          },
        },
      );
    }

    Promise.all([
      loadCsv(FILES.volume, (d) => ({
        service: String(d.service || "").trim(),
        year: Number(d.year),
        month: Number(d.month),
        trips: Number(d.trips),
      })),
      loadCsv(FILES.heatmap, (d) => ({
        service: String(d.service || "").trim(),
        dow: Number(d.dow),
        dow_label: String(d.dow_label || "").trim(),
        hour: Number(d.hour),
        avg_trips: Number(d.avg_trips),
      })),
      loadCsv(FILES.distance, (d) => ({
        service: String(d.service || "").trim(),
        category: String(d.distance_bin || "").trim(),
        value: Number(d.trips),
      })),
      loadCsv(FILES.duration, (d) => ({
        service: String(d.service || "").trim(),
        category: String(d.duration_bin || "").trim(),
        value: Number(d.trips),
      })),
      loadCsv(FILES.provider, (d) => ({
        provider: String(d.provider || "").trim(),
        share: Number(d.share),
      })),
      loadCsv(FILES.borough, (d) => ({
        service: String(d.service || "").trim(),
        category: String(d.Borough || "").trim(),
        value: Number(d.share),
      })),
      loadCsv(FILES.zones, (d) => ({
        service: String(d.service || "").trim(),
        year: d.year ? Number(d.year) : null,
        zone: String(d.Zone || "").trim(),
        borough: String(d.Borough || "").trim(),
        trips: Number(d.trips),
      })),
      loadCsv(FILES.od, (d) => ({
        service: String(d.service || "").trim(),
        year: d.year ? Number(d.year) : null,
        origin: String(d.OriginZone || "").trim(),
        dest: String(d.DestZone || "").trim(),
        trips: Number(d.trips),
      })),
    ])
      .then(
        ([volume, heatmap, distance, duration, provider, borough, zones, od]) => {
          renderMonthlyVolume(volume);
          renderHeatmap(
            heatmap.filter(
              (d) =>
                SERVICE_META[d.service] &&
                Number.isFinite(d.dow) &&
                Number.isFinite(d.hour) &&
                Number.isFinite(d.avg_trips),
            ),
          );

          renderGroupedBars({
            selector: "#taxi-distance-bins",
            data: distance.filter(
              (d) =>
                SERVICE_META[d.service] &&
                d.category &&
                Number.isFinite(d.value),
            ),
            categories: ["0-1", "1-2", "2-5", "5-10", "10-20", "20+"],
            valueKey: "value",
            legendId: "#taxi-distance-legend",
            xAxisLabel: "Trip distance (mi)",
            yAxisLabel: "Trips",
            marginBottom: 88,
            xAxisLabelOffset: 66,
            yAxisLabelOffset: -60,
            leftMargin: 84,
          });

          renderGroupedBars({
            selector: "#taxi-duration-bins",
            data: duration.filter(
              (d) =>
                SERVICE_META[d.service] &&
                d.category &&
                Number.isFinite(d.value),
            ),
            categories: ["0-5", "5-10", "10-20", "20-30", "30-45", "45+"],
            valueKey: "value",
            legendId: "#taxi-duration-legend",
            xAxisLabel: "Trip duration (min)",
            yAxisLabel: "Trips",
            marginBottom: 88,
            xAxisLabelOffset: 66,
            yAxisLabelOffset: -60,
            leftMargin: 84,
          });

          renderGroupedBars({
            selector: "#taxi-borough-share",
            data: borough.filter(
              (d) =>
                SERVICE_META[d.service] &&
                d.category &&
                Number.isFinite(d.value),
            ),
            categories: ["Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island"],
            valueKey: "value",
            valueFormatter: formatPercent,
            legendId: "#taxi-borough-legend",
            maxValue: 1,
            xAxisLabel: "Borough",
            yAxisLabel: "Share of pickups (%)",
            leftMargin: 90,
            yAxisLabelOffset: -68,
          });

          renderProviderShare(
            provider.filter((d) => d.provider && Number.isFinite(d.share)),
          );

          renderServiceSortedBars({
            selector: "#taxi-top-zones",
            data: zones
              .filter(
                (d) =>
                  SERVICE_META[d.service] &&
                  d.zone &&
                  Number.isFinite(d.trips),
              )
              .map((d) => ({
                service: d.service,
                year: Number.isFinite(d.year) ? d.year : null,
                label: `${d.zone} (${d.borough || "Unknown"})`,
                trips: d.trips,
              })),
            valueKey: "trips",
            labelKey: "label",
            legendId: "#taxi-zones-legend",
            maxItems: 12,
            xAxisLabel: "Trips",
            yAxisLabel: "Zone",
            leftMargin: 460,
            rightMargin: 120,
            marginBottom: 72,
            xAxisLabelOffset: 70,
            yAxisLabelOffset: -360,
            labelGap: 36,
          });

          renderServiceSortedBars({
            selector: "#taxi-top-od",
            data: od
              .filter(
                (d) =>
                  SERVICE_META[d.service] &&
                  d.origin &&
                  d.dest &&
                  Number.isFinite(d.trips),
              )
              .map((d) => ({
                service: d.service,
                year: Number.isFinite(d.year) ? d.year : null,
                label: `${d.origin} → ${d.dest}`,
                trips: d.trips,
              })),
            valueKey: "trips",
            labelKey: "label",
            legendId: "#taxi-od-legend",
            maxItems: 10,
            xAxisLabel: "Trips",
            yAxisLabel: "Origin → destination",
            leftMargin: 460,
            rightMargin: 120,
            marginBottom: 72,
            xAxisLabelOffset: 70,
            yAxisLabelOffset: -360,
            labelGap: 36,
          });
        },
      )
      .catch((error) => {
        console.error("Failed to load taxi datasets", error);
      });
  }

  if (typeof window.registerLazyInit === "function") {
    window.registerLazyInit("#chapter-taxis", initTaxiCharts);
  } else if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initTaxiCharts);
  } else {
    initTaxiCharts();
  }
})();
