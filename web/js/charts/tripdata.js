// js/charts/tripdata.js
// Citi Bike tripdata visuals from pre-aggregated CSVs
(function () {
  if (typeof d3 === "undefined") {
    console.error("D3 not found. Make sure d3.v7 is loaded before this script.");
    return;
  }

  const DATA_BASE = "data/processed/tripdata";
  const FILES = {
    flows: `${DATA_BASE}/top_flows.csv`,
    stations: `${DATA_BASE}/top_start_stations.csv`,
    hourly: `${DATA_BASE}/hourly_by_user.csv`,
    duration: `${DATA_BASE}/duration_bins.csv`,
    members: `${DATA_BASE}/member_share.csv`,
    rideable: `${DATA_BASE}/rideable_type_share.csv`,
    boroughs: "data/geo/nyc_boroughs.geojson",
  };

  const USER_COLORS = {
    member: "#9c7cff",
    casual: "#ffb347",
  };

  const TOOLTIP_CLASS = "tripdata-tooltip";

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

  function renderFlowMap(flows, boroughs) {
    const container = d3.select("#bike-flow-map");
    if (container.empty()) return;

    container.selectAll("svg").remove();

    const node = container.node();
    const width = 900;
    const height = 520;

    const svg = container
      .append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet");

    const projection = d3.geoMercator().fitSize([width, height], boroughs);
    const path = d3.geoPath(projection);

    svg
      .append("g")
      .selectAll("path")
      .data(boroughs.features)
      .join("path")
      .attr("d", path)
      .attr("fill", "#2f2f2f")
      .attr("stroke", "#0a0a0a")
      .attr("stroke-width", 0.8);

    const legend = svg
      .append("g")
      .attr("transform", "translate(24,24)")
      .attr("class", "overview-map__legend-item");

    legend
      .append("rect")
      .attr("width", 10)
      .attr("height", 10)
      .attr("fill", "#00bfff")
      .attr("rx", 2);

    legend
      .append("text")
      .attr("x", 16)
      .attr("y", 9)
      .attr("fill", "#f2f3f4")
      .attr("font-size", 11)
      .text("Top flows");

    const maxTrips = d3.max(flows, (d) => d.trip_count) || 1;
    const widthScale = d3.scaleSqrt().domain([0, maxTrips]).range([1, 7]);
    const tooltip = getTooltip();

    svg
      .append("g")
      .selectAll("path")
      .data(flows)
      .join("path")
      .attr("d", (d) => {
        const start = projection([d.start_lng, d.start_lat]);
        const end = projection([d.end_lng, d.end_lat]);
        if (!start || !end) return "";
        return `M${start[0]},${start[1]} L${end[0]},${end[1]}`;
      })
      .attr("fill", "none")
      .attr("stroke", "#00bfff")
      .attr("stroke-linecap", "round")
      .attr("stroke-width", (d) => widthScale(d.trip_count))
      .attr("opacity", 0.55)
      .on("mouseover", function (event, d) {
        d3.select(this).attr("opacity", 0.95).attr("stroke", "#ffd447");
        tooltip
          .style("opacity", 1)
          .html(
            `<strong>${d.start_station_name}</strong> → <strong>${d.end_station_name}</strong><br>` +
              `${formatNumber(d.trip_count)} trips`,
          );
      })
      .on("mousemove", function (event) {
        tooltip.style("left", `${event.pageX + 12}px`).style("top", `${event.pageY + 12}px`);
      })
      .on("mouseout", function () {
        d3.select(this).attr("opacity", 0.55).attr("stroke", "#00bfff");
        tooltip.style("opacity", 0);
      });
  }

  function renderHourlyLine(data) {
    const container = d3.select("#bike-hourly");
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

    const hours = d3.range(0, 24);
    const grouped = d3.group(data, (d) => d.member_casual);
    const maxValue = d3.max(data, (d) => d.trip_count) || 1;

    if (!renderHourlyLine.activeGroups) {
      renderHourlyLine.activeGroups = new Set(["member", "casual"]);
    }
    const activeGroups = Array.from(renderHourlyLine.activeGroups);

    const x = d3.scaleLinear().domain([0, 23]).range([0, innerWidth]);
    const y = d3.scaleLinear().domain([0, maxValue * 1.15]).range([innerHeight, 0]);

    g.append("g")
      .attr("class", "mobility-bars__axis mobility-bars__axis--x")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(d3.axisBottom(x).ticks(6).tickFormat((d) => `${d}:00`).tickPadding(8));

    g.append("g")
      .attr("class", "mobility-bars__axis mobility-bars__axis--y")
      .call(d3.axisLeft(y).ticks(5).tickFormat(formatNumber));

    g.append("text")
      .attr("class", "tripdata-axis-label")
      .attr("x", innerWidth / 2)
      .attr("y", innerHeight + 42)
      .attr("text-anchor", "middle")
      .text("Hour of day");

    g.append("text")
      .attr("class", "tripdata-axis-label")
      .attr("transform", "rotate(-90)")
      .attr("x", -innerHeight / 2)
      .attr("y", -46)
      .attr("text-anchor", "middle")
      .text("Trips");

    const line = d3
      .line()
      .x((d) => x(d.hour))
      .y((d) => y(d.trip_count))
      .curve(d3.curveMonotoneX);

    const tooltip = getTooltip();

    activeGroups.forEach((group) => {
      const series = grouped.get(group) || [];
      const values = hours.map((hour) => {
        const found = series.find((d) => d.hour === hour);
        return {
          hour,
          trip_count: found ? found.trip_count : 0,
        };
      });

      const color = USER_COLORS[group] || "#cccccc";

      g.append("path")
        .datum(values)
        .attr("fill", "none")
        .attr("stroke", color)
        .attr("stroke-width", 2.4)
        .attr("opacity", 0.9)
        .attr("d", line);

      g.selectAll(`circle.tripdata-${group}`)
        .data(values)
        .join("circle")
        .attr("r", 3)
        .attr("fill", color)
        .attr("cx", (d) => x(d.hour))
        .attr("cy", (d) => y(d.trip_count))
        .on("mouseover", function (event, d) {
          const highlight = d3.color(color)?.brighter(0.7) || color;
          d3.select(this).attr("r", 6).attr("fill", highlight);
          tooltip
            .style("opacity", 1)
            .html(`<strong>${group}</strong><br>${d.hour}:00 - ${formatNumber(d.trip_count)} trips`);
        })
        .on("mousemove", function (event) {
          tooltip.style("left", `${event.pageX + 12}px`).style("top", `${event.pageY + 12}px`);
        })
        .on("mouseout", function () {
          d3.select(this).attr("r", 3).attr("fill", color);
          tooltip.style("opacity", 0);
        });
    });

    const legend = d3.select("#bike-hourly-legend");
    if (!legend.empty()) {
      legend.selectAll("*").remove();

      const items = legend
        .selectAll("div")
        .data(["member", "casual"])
        .join("div")
        .attr("class", "tripdata-legend__item")
        .style("opacity", (d) => (renderHourlyLine.activeGroups.has(d) ? 1 : 0.4))
        .on("click", (event, group) => {
          const nextState = new Set(renderHourlyLine.activeGroups);
          if (nextState.has(group)) {
            if (nextState.size === 1) return;
            nextState.delete(group);
          } else {
            nextState.add(group);
          }
          renderHourlyLine.activeGroups = nextState;
          renderHourlyLine(data);
        });

      items
        .append("span")
        .attr("class", "tripdata-legend__swatch")
        .style("background", (d) => USER_COLORS[d] || "#cccccc");

      items.append("span").text((d) => d);
    }
  }

  function renderTopStations(data) {
    const container = d3.select("#bike-top-stations");
    if (container.empty()) return;

    container.selectAll("svg").remove();

    const node = container.node();
    const width = node.clientWidth || 420;
    const height = node.clientHeight || 260;
    const margin = { top: 20, right: 20, bottom: 24, left: 170 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const topData = data.slice(0, 10);
    const maxValue = d3.max(topData, (d) => d.trip_count) || 1;

    const svg = container
      .append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet");

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const y = d3
      .scaleBand()
      .domain(topData.map((d) => d.station_name))
      .range([0, innerHeight])
      .padding(0.2);
    const x = d3.scaleLinear().domain([0, maxValue * 1.1]).range([0, innerWidth]);

    g.append("g")
      .attr("class", "mobility-bars__axis mobility-bars__axis--x")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(d3.axisBottom(x).ticks(4).tickFormat(formatNumber));

    g.append("g")
      .attr("class", "mobility-bars__axis mobility-bars__axis--y")
      .call(d3.axisLeft(y).tickSize(0));

    const tooltip = getTooltip();

    g.selectAll("rect")
      .data(topData)
      .join("rect")
      .attr("x", 0)
      .attr("y", (d) => y(d.station_name))
      .attr("width", (d) => x(d.trip_count))
      .attr("height", y.bandwidth())
      .attr("fill", "#1ad15b")
      .attr("opacity", 0.9)
      .on("mouseover", function (event, d) {
        const highlight = d3.color("#1ad15b")?.brighter(0.7) || "#1ad15b";
        d3.select(this).attr("fill", highlight);
        tooltip
          .style("opacity", 1)
          .html(`<strong>${d.station_name}</strong><br>${formatNumber(d.trip_count)} trips`);
      })
      .on("mousemove", function (event) {
        tooltip.style("left", `${event.pageX + 12}px`).style("top", `${event.pageY + 12}px`);
      })
      .on("mouseout", function () {
        d3.select(this).attr("fill", "#1ad15b");
        tooltip.style("opacity", 0);
      });
  }

  function renderDurationBins(data) {
    const container = d3.select("#bike-duration-bins");
    if (container.empty()) return;

    container.selectAll("svg").remove();

    const node = container.node();
    const width = node.clientWidth || 420;
    const height = node.clientHeight || 260;
    const margin = { top: 20, right: 20, bottom: 52, left: 56 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const bins = Array.from(new Set(data.map((d) => d.duration_bin)));
    const grouped = d3.group(data, (d) => d.duration_bin);

    const stackedInput = bins.map((bin) => {
      const values = grouped.get(bin) || [];
      const row = { bin };
      values.forEach((item) => {
        row[item.member_casual] = item.trip_count;
      });
      return row;
    });

    const keys = ["member", "casual"];
    const stack = d3.stack().keys(keys);
    const series = stack(stackedInput);
    const maxValue = d3.max(series, (layer) => d3.max(layer, (d) => d[1])) || 1;

    const x = d3.scaleBand().domain(bins).range([0, innerWidth]).padding(0.2);
    const y = d3.scaleLinear().domain([0, maxValue * 1.1]).range([innerHeight, 0]);

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
      .call(d3.axisLeft(y).ticks(4).tickFormat(formatNumber));

    g.append("text")
      .attr("class", "tripdata-axis-label")
      .attr("x", innerWidth / 2)
      .attr("y", innerHeight + 42)
      .attr("text-anchor", "middle")
      .text("Trip duration");

    g.append("text")
      .attr("class", "tripdata-axis-label")
      .attr("transform", "rotate(-90)")
      .attr("x", -innerHeight / 2)
      .attr("y", -46)
      .attr("text-anchor", "middle")
      .text("Trips");

    const tooltip = getTooltip();

    g.selectAll("g.layer")
      .data(series)
      .join("g")
      .attr("class", "layer")
      .attr("fill", (d) => USER_COLORS[d.key] || "#cccccc")
      .selectAll("rect")
      .data((d) => d.map((entry) => ({ key: d.key, data: entry.data, values: entry })))
      .join("rect")
      .attr("x", (d) => x(d.data.bin))
      .attr("y", (d) => y(d.values[1]))
      .attr("height", (d) => y(d.values[0]) - y(d.values[1]))
      .attr("width", x.bandwidth())
      .attr("opacity", 0.85)
      .on("mouseover", function (event, d) {
        const value = d.data[d.key] || 0;
        const highlight = d3.color(USER_COLORS[d.key])?.brighter(0.7) || USER_COLORS[d.key];
        d3.select(this).attr("fill", highlight);
        tooltip
          .style("opacity", 1)
          .html(`<strong>${d.data.bin}</strong><br>${d.key}: ${formatNumber(value)}`);
      })
      .on("mousemove", function (event) {
        tooltip.style("left", `${event.pageX + 12}px`).style("top", `${event.pageY + 12}px`);
      })
      .on("mouseout", function (event, d) {
        d3.select(this).attr("fill", USER_COLORS[d.key] || "#cccccc");
        tooltip.style("opacity", 0);
      });
  }

  function renderPie(selector, data, colorMap) {
    const container = d3.select(selector);
    if (container.empty()) return;

    container.selectAll("svg").remove();

    const node = container.node();
    const size = Math.min(node.clientWidth || 220, node.clientHeight || 220);
    const width = size;
    const height = size;

    const svg = container
      .append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet");

    const g = svg.append("g").attr("transform", `translate(${width / 2},${height / 2})`);

    const pieData = data.map((d) => ({
      label: d.label,
      value: d.value,
      color: colorMap[d.label] || "#cccccc",
    }));

    const total = d3.sum(pieData, (d) => d.value) || 1;
    const radius = Math.min(width, height) / 2 - 8;
    const pie = d3.pie().sort(null).value((d) => d.value);
    const arc = d3.arc().innerRadius(0).outerRadius(radius);
    const arcHover = d3.arc().innerRadius(0).outerRadius(radius + 6);
    const labelArc = d3.arc().innerRadius(radius * 0.6).outerRadius(radius * 0.6);

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
      .attr("font-size", 12)
      .attr("font-weight", "700")
      .attr("stroke", "#101010")
      .attr("stroke-width", 3)
      .attr("paint-order", "stroke")
      .text((d) => `${Math.round((d.data.value / total) * 100)}%`);
  }

  Promise.all([
    d3.csv(FILES.flows, (d) => ({
      start_station_id: d.start_station_id,
      start_station_name: d.start_station_name,
      start_lat: Number(d.start_lat),
      start_lng: Number(d.start_lng),
      end_station_id: d.end_station_id,
      end_station_name: d.end_station_name,
      end_lat: Number(d.end_lat),
      end_lng: Number(d.end_lng),
      trip_count: Number(d.trip_count),
    })),
    d3.csv(FILES.stations, (d) => ({
      station_name: d.station_name,
      trip_count: Number(d.trip_count),
    })),
    d3.csv(FILES.hourly, (d) => ({
      hour: Number(d.hour),
      member_casual: d.member_casual,
      trip_count: Number(d.trip_count),
    })),
    d3.csv(FILES.duration, (d) => ({
      duration_bin: d.duration_bin,
      member_casual: d.member_casual,
      trip_count: Number(d.trip_count),
    })),
    d3.csv(FILES.members, (d) => ({
      label: d.member_casual,
      value: Number(d.trip_count),
    })),
    d3.csv(FILES.rideable, (d) => ({
      label: d.rideable_type,
      value: Number(d.trip_count),
    })),
    d3.json(FILES.boroughs),
  ])
    .then(([flows, stations, hourly, duration, members, rideable, boroughs]) => {
      renderFlowMap(flows, boroughs);
      renderHourlyLine(hourly);
      renderTopStations(stations);
      renderDurationBins(duration);
      renderPie("#bike-member-share", members, USER_COLORS);
      renderPie(
        "#bike-rideable-share",
        rideable,
        {
          classic_bike: "#00bfff",
          electric_bike: "#ff3bff",
          docked_bike: "#1ad15b",
        },
      );
    })
    .catch((error) => {
      console.error("Failed to load tripdata CSVs", error);
    });
})();
