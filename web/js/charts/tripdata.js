// js/charts/tripdata.js
// Citi Bike tripdata visuals from pre-aggregated CSVs
(function () {
  function initTripdataCharts() {
    if (typeof d3 === "undefined") {
      console.error("D3 not found. Make sure d3.v7 is loaded before this script.");
      return;
    }

    const mapContainer = d3.select("#bike-flow-map");
    if (mapContainer.empty()) return;

    const DATA_BASE = "data/processed/tripdata";
    const FILES = {
      routes: `${DATA_BASE}/top_routes.geojson`,
      stations: `${DATA_BASE}/top_start_stations.csv`,
      hourly: `${DATA_BASE}/hourly_by_user.csv`,
      duration: `${DATA_BASE}/duration_bins.csv`,
      members: `${DATA_BASE}/member_share.csv`,
      rideable: `${DATA_BASE}/rideable_type_share.csv`,
      boroughs: "data/geo/nyc_boroughs.geojson",
    };

    const loadCsv = window.loadCsvMaybeParts || d3.csv;

    const USER_COLORS = {
      member: "#C2185B",
      casual: "#C65D00",
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

    function styleLegendRow(legend) {
      legend
        .style("display", "flex")
        .style("flex-direction", "row")
        .style("flex-wrap", "wrap")
        .style("gap", "8px 14px")
        .style("align-items", "center");
    }

    function renderFlowMap(routes, boroughs) {
    const container = d3.select("#bike-flow-map");
    if (container.empty()) return;

    container.selectAll("svg").remove();

    if (!boroughs || !Array.isArray(boroughs.features)) {
      container.append("p").attr("class", "overview-map__error").text("Flow map data unavailable.");
      return;
    }

    if (!routes || !Array.isArray(routes.features)) {
      container.append("p").attr("class", "overview-map__error").text("Route data unavailable.");
      return;
    }

    const width = 900;
    const height = 520;

    const svg = container
      .append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet");

    const routeFeatures = routes.features
      .filter((feature) => feature.geometry && feature.geometry.type)
      .sort((a, b) => (b.properties?.trip_count || 0) - (a.properties?.trip_count || 0))
      .slice(0, 10);

    if (!routeFeatures.length) {
      container.append("p").attr("class", "overview-map__error").text("No route data available.");
      return;
    }

    const projection = d3.geoMercator().fitExtent(
      [
        [36, 36],
        [width - 36, height - 36],
      ],
      boroughs,
    );
    const path = d3.geoPath(projection);

    const mapGroup = svg.append("g");

    const routeBounds = path.bounds({ type: "FeatureCollection", features: routeFeatures });
    const [[x0, y0], [x1, y1]] = routeBounds;
    const boundWidth = x1 - x0;
    const boundHeight = y1 - y0;
    if (boundWidth > 0 && boundHeight > 0) {
      const padding = 64;
      const scale = Math.min(
        (width - padding * 2) / boundWidth,
        (height - padding * 2) / boundHeight,
      );
      const translateX = (width - scale * (x0 + x1)) / 2;
      const translateY = (height - scale * (y0 + y1)) / 2;
      mapGroup.attr("transform", `translate(${translateX},${translateY}) scale(${scale})`);
    }

    mapGroup
      .append("g")
      .selectAll("path")
      .data(boroughs.features)
      .join("path")
      .attr("d", path)
      .attr("fill", "#2f2f2f")
      .attr("stroke", "#0a0a0a")
      .attr("stroke-width", 0.8);

    const palette = [
      "#5bbcff",
      "#5fe27b",
      "#ffb347",
      "#ff7eb6",
      "#9f86ff",
      "#3fc0ff",
      "#ffd54a",
      "#2dd4bf",
      "#ff7f73",
      "#7aa8ff",
    ];

    const colorScale = d3.scaleOrdinal().domain(d3.range(routeFeatures.length)).range(palette);
    const tooltip = getTooltip();

    routeFeatures.forEach((feature, index) => {
      feature.properties = feature.properties || {};
      feature.properties._index = index;
    });

    const routeState = routeFeatures.reduce((acc, feature) => {
      acc[feature.properties._index] = true;
      return acc;
    }, {});

    const segmentKey = (a, b) => {
      const aKey = `${a[0].toFixed(5)},${a[1].toFixed(5)}`;
      const bKey = `${b[0].toFixed(5)},${b[1].toFixed(5)}`;
      return aKey < bKey ? `${aKey}|${bKey}` : `${bKey}|${aKey}`;
    };

    const collectSegments = (feature) => {
      const geom = feature.geometry || {};
      const segments = [];
      const pushSegments = (coords) => {
        for (let i = 0; i < coords.length - 1; i += 1) {
          segments.push(segmentKey(coords[i], coords[i + 1]));
        }
      };

      if (geom.type === "LineString") {
        pushSegments(geom.coordinates || []);
      } else if (geom.type === "MultiLineString") {
        (geom.coordinates || []).forEach((coords) => pushSegments(coords));
      }
      return segments;
    };

    const segmentMap = new Map();
    routeFeatures.forEach((feature) => {
      const idx = feature.properties._index;
      collectSegments(feature).forEach((key) => {
        if (!segmentMap.has(key)) {
          segmentMap.set(key, new Set());
        }
        segmentMap.get(key).add(idx);
      });
    });

    const adjacency = new Map();
    segmentMap.forEach((indices) => {
      if (indices.size < 2) return;
      const list = Array.from(indices);
      list.forEach((i) => {
        if (!adjacency.has(i)) adjacency.set(i, new Set());
        list.forEach((j) => {
          if (i !== j) adjacency.get(i).add(j);
        });
      });
    });

    const overlapNeighbors = new Map();
    routeFeatures.forEach((feature) => {
      const idx = feature.properties._index;
      overlapNeighbors.set(idx, Array.from(adjacency.get(idx) || []));
    });

    const baseWidth = 1.1;
    const highlightScale = 1.8;

    const routeGroups = mapGroup
      .append("g")
      .selectAll("g")
      .data(routeFeatures)
      .join("g")
      .attr("data-route", (d) => d.properties._index)
      .attr("opacity", 0.85);

    routeGroups.each(function (d) {
      const group = d3.select(this);
      const primary = colorScale(d.properties._index);

      const basePath = group
        .append("path")
        .attr("class", "route-base")
        .attr("d", path)
        .attr("fill", "none")
        .attr("stroke", primary)
        .attr("stroke-width", baseWidth)
        .attr("stroke-linecap", "round")
        .attr("stroke-linejoin", "round");

      const overlayPath = group
        .append("path")
        .attr("class", "route-overlay")
        .attr("d", path)
        .attr("fill", "none")
        .attr("stroke-width", baseWidth * 0.55)
        .attr("stroke-linecap", "round")
        .attr("stroke-linejoin", "round")
        .style("display", "none")
        .style("pointer-events", "none");

      basePath
        .on("mouseover", function () {
          basePath.attr("stroke-width", baseWidth * highlightScale);
          overlayPath.attr("stroke-width", baseWidth * highlightScale * 0.55);
          group.attr("opacity", 1);
          tooltip
            .style("opacity", 1)
            .html(
              `<strong>${d.properties.start_station_name}</strong> → ` +
                `<strong>${d.properties.end_station_name}</strong><br>` +
                `${formatNumber(d.properties.trip_count)} trips`,
            );
        })
        .on("mousemove", function (event) {
          tooltip.style("left", `${event.pageX + 12}px`).style("top", `${event.pageY + 12}px`);
        })
        .on("mouseout", function () {
          const isActive = routeState[d.properties._index];
          basePath.attr("stroke-width", baseWidth);
          overlayPath.attr("stroke-width", baseWidth * 0.55);
          group.attr("opacity", isActive ? 0.85 : 0.12);
          tooltip.style("opacity", 0);
        });
    });

    const updateOverlapStyles = () => {
      routeGroups.each(function (d) {
        const group = d3.select(this);
        const overlayPath = group.select("path.route-overlay");
        const idx = d.properties._index;
        const isActive = routeState[idx];
        if (!isActive) {
          overlayPath.style("display", "none");
          return;
        }
        const neighbors = overlapNeighbors.get(idx) || [];
        const activeNeighbor = neighbors.find((neighbor) => routeState[neighbor]);
        if (activeNeighbor === undefined) {
          overlayPath.style("display", "none");
        } else {
          overlayPath.style("display", null).attr("stroke", colorScale(activeNeighbor));
        }
      });
    };

    updateOverlapStyles();

    const getEndpoints = (feature) => {
      const geom = feature.geometry || {};
      if (geom.type === "LineString") {
        const coords = geom.coordinates || [];
        return coords.length >= 2
          ? { start: coords[0], end: coords[coords.length - 1] }
          : null;
      }
      if (geom.type === "MultiLineString") {
        const parts = geom.coordinates || [];
        if (!parts.length) return null;
        const first = parts[0] || [];
        const last = parts[parts.length - 1] || [];
        if (!first.length || !last.length) return null;
        return {
          start: first[0],
          end: last[last.length - 1],
        };
      }
      return null;
    };

    const pointIndex = new Map();
    routeFeatures.forEach((feature) => {
      const endpoints = getEndpoints(feature);
      if (!endpoints) return;
      const points = [
        { coord: endpoints.start, role: "start" },
        { coord: endpoints.end, role: "end" },
      ];
      points.forEach(({ coord, role }) => {
        const key = `${coord[0].toFixed(6)}|${coord[1].toFixed(6)}`;
        const entry =
          pointIndex.get(key) || { lng: coord[0], lat: coord[1], hasStart: false, hasEnd: false };
        if (role === "start") entry.hasStart = true;
        if (role === "end") entry.hasEnd = true;
        pointIndex.set(key, entry);
      });
    });

    const endpointData = Array.from(pointIndex.values());
    const endpointGroup = mapGroup.append("g");

    endpointGroup
      .selectAll("circle")
      .data(endpointData)
      .join("circle")
      .attr("cx", (d) => projection([d.lng, d.lat])[0])
      .attr("cy", (d) => projection([d.lng, d.lat])[1])
      .attr("r", 0.735)
      .attr("fill", (d) => (d.hasStart ? "#00ff57" : "#ff2bf7"))
      .attr("stroke", (d) => (d.hasStart && d.hasEnd ? "#ff2bf7" : d.hasStart ? "#00ff57" : "#ff2bf7"))
      .attr("stroke-width", 0.4)
      .attr("opacity", 0.9);

    const legend = svg.append("g").attr("transform", "translate(24,24)");

    legend
      .selectAll("g")
      .data(routeFeatures)
      .join("g")
      .attr("transform", (d, i) => `translate(0, ${i * 18})`)
      .attr("class", "overview-map__legend-item")
      .style("cursor", "pointer")
      .on("click", (event, d) => {
        const idx = d.properties._index;
        routeState[idx] = !routeState[idx];
        routeGroups
          .filter((route) => route.properties._index === idx)
          .attr("opacity", routeState[idx] ? 0.85 : 0.12);
        updateOverlapStyles();
        legend
          .select(`rect[data-route='${idx}']`)
          .attr("opacity", routeState[idx] ? 1 : 0.35);
        legend
          .select(`text[data-route='${idx}']`)
          .attr("opacity", routeState[idx] ? 1 : 0.5);
      })
      .call((g) => {
        g.append("rect")
          .attr("data-route", (d) => d.properties._index)
          .attr("width", 10)
          .attr("height", 10)
          .attr("fill", (d) => colorScale(d.properties._index))
          .attr("rx", 2);

        g.append("text")
          .attr("data-route", (d) => d.properties._index)
          .attr("x", 16)
          .attr("y", 9)
          .attr("fill", "#f2f3f4")
          .attr("font-size", 11)
          .text(
            (d) =>
              `${d.properties.start_station_name} → ${d.properties.end_station_name}`,
          );
      });

    const endpointLegend = svg.append("g").attr("class", "overview-map__legend-item");
    const legendX = width - 180;
    const legendY = 24;
    endpointLegend.attr("transform", `translate(${legendX},${legendY})`);

    const endpointItems = [
      { label: "Start station", color: "#00ff57" },
      { label: "End station", color: "#ff2bf7" },
    ];

    endpointLegend
      .selectAll("g")
      .data(endpointItems)
      .join("g")
      .attr("transform", (d, i) => `translate(0, ${i * 16})`)
      .call((g) => {
        g.append("circle")
          .attr("cx", 6)
          .attr("cy", 6)
          .attr("r", 4)
          .attr("fill", (d) => d.color);

        g.append("text")
          .attr("x", 16)
          .attr("y", 9)
          .attr("fill", "#f2f3f4")
          .attr("font-size", 11)
          .text((d) => d.label);
      });

    const legendNode = legend.node();
    if (legendNode) {
      const padding = 8;
      const bbox = legendNode.getBBox();
      legend
        .insert("rect", ":first-child")
        .attr("class", "overview-map__legend-box")
        .attr("x", bbox.x - padding)
        .attr("y", bbox.y - padding)
        .attr("width", bbox.width + padding * 2)
        .attr("height", bbox.height + padding * 2)
        .attr("rx", 8);
    }

    const endpointLegendNode = endpointLegend.node();
    if (endpointLegendNode) {
      const padding = 8;
      const bbox = endpointLegendNode.getBBox();
      endpointLegend
        .insert("rect", ":first-child")
        .attr("class", "overview-map__legend-box")
        .attr("x", bbox.x - padding)
        .attr("y", bbox.y - padding)
        .attr("width", bbox.width + padding * 2)
        .attr("height", bbox.height + padding * 2)
        .attr("rx", 8);
    }
  }

  function renderHourlyLine(data) {
    const container = d3.select("#bike-hourly");
    if (container.empty()) return;

    container.selectAll("svg").remove();

    const node = container.node();
    const width = node.clientWidth || 700;
    const height = node.clientHeight || 320;
    const margin = { top: 24, right: 24, bottom: 52, left: 90 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const svg = container
      .append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet");

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const hours = d3.range(0, 24);
    const grouped = d3.group(data, (d) => d.member_casual);

    if (!renderHourlyLine.activeGroups) {
      renderHourlyLine.activeGroups = new Set(["member", "casual"]);
    }
    const activeGroups = Array.from(renderHourlyLine.activeGroups);
    const maxValue =
      d3.max(
        data.filter((d) => activeGroups.includes(d.member_casual)),
        (d) => d.trip_count,
      ) || 1;

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
      .attr("y", -60)
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
      styleLegendRow(legend);

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
    const margin = { top: 20, right: 20, bottom: 24, left: 210 };
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
    const margin = { top: 20, right: 20, bottom: 64, left: 80 };
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
      .call(
        d3
          .axisBottom(x)
          .tickPadding(10)
          .tickFormat((d) => String(d).replace(/\s*min$/i, "")),
      );

    g.append("g")
      .attr("class", "mobility-bars__axis mobility-bars__axis--y")
      .call(d3.axisLeft(y).ticks(4).tickFormat(formatNumber));

    const xAxisLabel = g.append("text")
      .attr("class", "tripdata-axis-label")
      .attr("x", innerWidth / 2)
      .attr("y", innerHeight + 44)
      .attr("text-anchor", "middle");

    const xAxisLabelLines = ["Trip duration", "(min)"];
    xAxisLabel
      .selectAll("tspan")
      .data(xAxisLabelLines)
      .join("tspan")
      .attr("x", innerWidth / 2)
      .attr("dy", (d, i) => (i === 0 ? 0 : 16))
      .text((d) => d);

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

    const totalsByBin = new Map();
    stackedInput.forEach((row) => {
      const total = keys.reduce((sum, key) => sum + (row[key] || 0), 0);
      totalsByBin.set(row.bin, total);
    });

    g.selectAll("text.tripdata-bar-total")
      .data(bins)
      .join("text")
      .attr("class", "tripdata-bar-total")
      .attr("x", (d) => x(d) + x.bandwidth() / 2)
      .attr("y", (d) => y(totalsByBin.get(d) || 0) - 6)
      .attr("text-anchor", "middle")
      .attr("fill", "#2b2b2b")
      .attr("font-size", 14)
      .attr("font-weight", "700")
      .text((d) => formatNumber(totalsByBin.get(d) || 0));

    const legend = d3.select("#bike-duration-legend");
    if (!legend.empty()) {
      legend.selectAll("*").remove();
      styleLegendRow(legend);

      const items = legend
        .selectAll("div")
        .data(keys)
        .join("div")
        .attr("class", "tripdata-legend__item");

      items
        .append("span")
        .attr("class", "tripdata-legend__swatch")
        .style("background", (d) => USER_COLORS[d] || "#cccccc");

      items.append("span").text((d) => d);
    }
  }

  function renderPie(selector, data, colorMap, legendSelector, labelOptions = {}) {
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

    const labelStroke = labelOptions.stroke === false ? null : labelOptions.stroke || "#f2f3f4";
    const labelStrokeWidth = labelOptions.stroke === false ? null : labelOptions.strokeWidth || 2;

    g.selectAll("text")
      .data(pie(pieData))
      .join("text")
      .attr("transform", (d) => `translate(${labelArc.centroid(d)})`)
      .attr("text-anchor", "middle")
      .attr("dy", "0.35em")
      .attr("fill", labelOptions.fill || "#2b2b2b")
      .attr("font-size", labelOptions.fontSize || 12)
      .attr("font-weight", labelOptions.fontWeight || "700")
      .attr("stroke", labelStroke)
      .attr("stroke-width", labelStrokeWidth)
      .attr("paint-order", labelStroke ? "stroke" : null)
      .text((d) => `${Math.round((d.data.value / total) * 100)}%`);

    if (legendSelector) {
      const legend = d3.select(legendSelector);
      if (!legend.empty()) {
        legend.selectAll("*").remove();
        styleLegendRow(legend);

        const items = legend
          .selectAll("div")
          .data(pieData)
          .join("div")
          .attr("class", "tripdata-legend__item");

        items
          .append("span")
          .attr("class", "tripdata-legend__swatch")
          .style("background", (d) => d.color);

        items.append("span").text((d) => d.label);
      }
    }
  }

    Promise.all([
      d3.json(FILES.routes),
      loadCsv(FILES.stations, (d) => ({
        station_name: d.station_name,
        trip_count: Number(d.trip_count),
      })),
      loadCsv(FILES.hourly, (d) => ({
        hour: Number(d.hour),
        member_casual: d.member_casual,
        trip_count: Number(d.trip_count),
      })),
      loadCsv(FILES.duration, (d) => ({
        duration_bin: d.duration_bin,
        member_casual: d.member_casual,
        trip_count: Number(d.trip_count),
      })),
      loadCsv(FILES.members, (d) => ({
        label: d.member_casual,
        value: Number(d.trip_count),
      })),
      loadCsv(FILES.rideable, (d) => ({
        label: d.rideable_type,
        value: Number(d.trip_count),
      })),
      d3.json(FILES.boroughs),
    ])
      .then(([routes, stations, hourly, duration, members, rideable, boroughs]) => {
        renderFlowMap(routes, boroughs);
        renderHourlyLine(hourly);
        renderTopStations(stations);
        renderDurationBins(duration);
        renderPie(
          "#bike-member-share",
          members,
          USER_COLORS,
          "#bike-member-legend",
          { fill: "#f2f3f4", stroke: "#101010", strokeWidth: 2.5, fontSize: 13 },
        );
        renderPie(
          "#bike-rideable-share",
          rideable,
          {
            classic_bike: "#ff8c00",
            electric_bike: "#1f77b4",
            docked_bike: "#6a5acd",
          },
          "#bike-rideable-legend",
          { fill: "#f2f3f4", stroke: "#101010", strokeWidth: 2.5, fontSize: 13 },
        );
      })
      .catch((error) => {
        console.error("Failed to load tripdata assets", error);
      });
  }

  if (typeof window.registerLazyInit === "function") {
    window.registerLazyInit("#bike-flow-map", initTripdataCharts);
  } else if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initTripdataCharts);
  } else {
    initTripdataCharts();
  }
})();
