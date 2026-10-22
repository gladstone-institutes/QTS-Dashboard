async function loadStats() {
  const totalEl = document.getElementById("total-rows");
  const categoryCountEl = document.getElementById("category-count");
  const topCategoryEl = document.getElementById("top-category");
  const topCategoryPctEl = document.getElementById("top-category-pct");
  const updatedEl = document.getElementById("last-updated");
  const emptyEl = document.getElementById("chart-empty");
  const containerEl = document.getElementById("chart-container");
  const trendEmptyEl = document.getElementById("trend-empty");
  const trendContainerEl = document.getElementById("trend-container");

  let stats;
  try {
    const res = await fetch("./data/stats.json", { cache: "no-store" });
    stats = await res.json();
  } catch (err) {
    emptyEl.textContent = "Couldn't load dashboard data.";
    emptyEl.hidden = false;
    trendEmptyEl.textContent = "Couldn't load dashboard data.";
    trendEmptyEl.hidden = false;
    return;
  }

  const totalRows = stats.total_rows ?? 0;
  totalEl.textContent = totalRows.toLocaleString();
  updatedEl.textContent = stats.generated_at
    ? `Last updated: ${new Date(stats.generated_at).toLocaleString()}`
    : "Last updated: never (waiting on first pipeline run)";

  // Gap-nature bar chart + its stat tiles.
  const entries = Object.entries(stats.gap_counts || {}).sort(
    (a, b) => b[1] - a[1]
  );

  if (entries.length === 0) {
    categoryCountEl.textContent = "0";
    topCategoryEl.textContent = "—";
    emptyEl.textContent =
      "No data yet — the dashboard refreshes automatically once a day.";
    emptyEl.hidden = false;
  } else {
    categoryCountEl.textContent = entries.length.toLocaleString();

    const [topLabel, topValue] = entries[0];
    topCategoryEl.textContent = topLabel;
    const topPct = totalRows > 0 ? Math.round((topValue / totalRows) * 100) : 0;
    topCategoryPctEl.textContent = `${topPct}% of all usage scenarios`;

    renderBarChart(containerEl, entries, totalRows);
  }

  // Monthly trend chart — independent dataset from the bar chart above, so
  // it renders (or shows its own empty state) regardless of gap_counts.
  const monthEntries = Object.entries(stats.monthly_counts || {}).sort(
    (a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)
  );

  if (monthEntries.length === 0) {
    trendEmptyEl.textContent =
      "No data yet — the dashboard refreshes automatically once a day.";
    trendEmptyEl.hidden = false;
  } else {
    renderTrendChart(trendContainerEl, monthEntries);
  }
}

function renderBarChart(container, entries, totalRows) {
  const maxValue = Math.max(...entries.map(([, v]) => v));
  container.replaceChildren();

  const tooltip = document.getElementById("tooltip");

  entries.forEach(([label, value], index) => {
    const pct = totalRows > 0 ? Math.round((value / totalRows) * 100) : 0;

    const row = document.createElement("div");
    row.className = "bar-row";
    row.tabIndex = 0;

    const rankEl = document.createElement("span");
    rankEl.className = "bar-rank";
    rankEl.textContent = index + 1;

    const labelEl = document.createElement("span");
    labelEl.className = "bar-label";
    labelEl.textContent = label; // untrusted (sheet-derived) text -> textContent, never innerHTML
    labelEl.title = label;

    const track = document.createElement("div");
    track.className = "bar-track";

    const fill = document.createElement("div");
    fill.className = "bar-fill";
    fill.style.width = `${(value / maxValue) * 100}%`;
    track.appendChild(fill);

    const valueEl = document.createElement("span");
    valueEl.className = "bar-value";
    valueEl.textContent = value;

    const pctEl = document.createElement("span");
    pctEl.className = "bar-pct";
    pctEl.textContent = `${pct}%`;

    row.appendChild(rankEl);
    row.appendChild(labelEl);
    row.appendChild(track);
    row.appendChild(valueEl);
    row.appendChild(pctEl);

    const showTooltip = () => {
      tooltip.replaceChildren();
      const valueSpan = document.createElement("span");
      valueSpan.className = "tooltip-value";
      valueSpan.textContent = `${value} (${pct}%)`;
      const labelSpan = document.createElement("span");
      labelSpan.className = "tooltip-label";
      labelSpan.textContent = label;
      tooltip.appendChild(valueSpan);
      tooltip.appendChild(labelSpan);
      tooltip.hidden = false;

      const offsetParentRect = tooltip.offsetParent.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      // Measured against the chart area's own top (not the card's, which
      // includes the title) so the tooltip never overlaps the heading.
      const spaceAbove = rowRect.top - containerRect.top;
      const top =
        spaceAbove >= tooltip.offsetHeight + 6
          ? rowRect.top - offsetParentRect.top - tooltip.offsetHeight - 6
          : rowRect.bottom - offsetParentRect.top + 6;
      tooltip.style.left = `${rowRect.left - offsetParentRect.left}px`;
      tooltip.style.top = `${top}px`;
    };
    const hideTooltip = () => {
      tooltip.hidden = true;
    };

    row.addEventListener("pointerenter", showTooltip);
    row.addEventListener("pointermove", showTooltip);
    row.addEventListener("pointerleave", hideTooltip);
    row.addEventListener("mouseenter", showTooltip);
    row.addEventListener("mouseleave", hideTooltip);
    row.addEventListener("focus", showTooltip);
    row.addEventListener("blur", hideTooltip);

    container.appendChild(row);
  });
}

const SVG_NS = "http://www.w3.org/2000/svg";

function niceAxisMax(rawMax) {
  if (rawMax <= 0) return 10;
  const step = rawMax <= 20 ? 5 : 10;
  return Math.ceil(rawMax / step) * step;
}

function formatMonth(monthKey, long) {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString(
    undefined,
    long ? { month: "long", year: "numeric" } : { month: "short" }
  );
}

function renderTrendChart(container, monthEntries) {
  container.replaceChildren();

  const tooltip = document.getElementById("tooltip");
  const width = 640;
  const height = 200;
  const marginLeft = 34;
  const marginRight = 44;
  const marginTop = 16;
  const marginBottom = 28;
  const plotWidth = width - marginLeft - marginRight;
  const plotHeight = height - marginTop - marginBottom;

  const maxValue = Math.max(...monthEntries.map(([, v]) => v));
  const axisMax = niceAxisMax(maxValue);

  const xFor = (i) =>
    monthEntries.length > 1
      ? marginLeft + (i * plotWidth) / (monthEntries.length - 1)
      : marginLeft + plotWidth / 2;
  const yFor = (value) => marginTop + plotHeight - (value / axisMax) * plotHeight;

  const points = monthEntries.map(([month, value], i) => ({
    month,
    value,
    x: xFor(i),
    y: yFor(value),
  }));

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("class", "trend-svg");
  svg.setAttribute("role", "img");
  svg.setAttribute(
    "aria-label",
    `Usage scenarios submitted per month, ${monthEntries.length} months of data`
  );

  // Gridlines + y-axis ticks (0 / half / max), rounded to clean numbers.
  [0, axisMax / 2, axisMax].forEach((tickValue) => {
    const y = yFor(tickValue);

    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", marginLeft);
    line.setAttribute("x2", width - marginRight);
    line.setAttribute("y1", y);
    line.setAttribute("y2", y);
    line.setAttribute("class", tickValue === 0 ? "trend-baseline" : "trend-gridline");
    svg.appendChild(line);

    const text = document.createElementNS(SVG_NS, "text");
    text.setAttribute("x", marginLeft - 8);
    text.setAttribute("y", y);
    text.setAttribute("class", "trend-tick-label");
    text.setAttribute("text-anchor", "end");
    text.setAttribute("dominant-baseline", "middle");
    text.textContent = Math.round(tickValue).toLocaleString();
    svg.appendChild(text);
  });

  // X-axis month labels.
  points.forEach((point) => {
    const text = document.createElementNS(SVG_NS, "text");
    text.setAttribute("x", point.x);
    text.setAttribute("y", height - marginBottom + 18);
    text.setAttribute("class", "trend-month-label");
    text.setAttribute("text-anchor", "middle");
    text.textContent = formatMonth(point.month);
    svg.appendChild(text);
  });

  // Line + area (only meaningful with 2+ points to connect).
  if (points.length > 1) {
    const baselineY = yFor(0);
    const areaD = [
      `M ${points[0].x} ${baselineY}`,
      ...points.map((p) => `L ${p.x} ${p.y}`),
      `L ${points[points.length - 1].x} ${baselineY}`,
      "Z",
    ].join(" ");
    const area = document.createElementNS(SVG_NS, "path");
    area.setAttribute("d", areaD);
    area.setAttribute("class", "trend-area");
    svg.appendChild(area);

    const lineD = points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
      .join(" ");
    const line = document.createElementNS(SVG_NS, "path");
    line.setAttribute("d", lineD);
    line.setAttribute("class", "trend-line");
    svg.appendChild(line);
  }

  // End-dot + direct label — "lines label their endpoint," not every point.
  const last = points[points.length - 1];
  const endDot = document.createElementNS(SVG_NS, "circle");
  endDot.setAttribute("cx", last.x);
  endDot.setAttribute("cy", last.y);
  endDot.setAttribute("r", 4);
  endDot.setAttribute("class", "trend-end-dot");
  svg.appendChild(endDot);

  const endLabel = document.createElementNS(SVG_NS, "text");
  endLabel.setAttribute("x", last.x + 10);
  endLabel.setAttribute("y", last.y);
  endLabel.setAttribute("class", "trend-end-label");
  endLabel.setAttribute("dominant-baseline", "middle");
  endLabel.textContent = last.value.toLocaleString();
  svg.appendChild(endLabel);

  // Hover crosshair: a vertical hairline that snaps to the nearest month,
  // backed by one transparent hit rect spanning the whole plot area rather
  // than per-point targets — the crosshair is what "finds the X."
  const crosshair = document.createElementNS(SVG_NS, "line");
  crosshair.setAttribute("y1", marginTop);
  crosshair.setAttribute("y2", height - marginBottom);
  crosshair.setAttribute("class", "trend-crosshair");
  crosshair.setAttribute("hidden", "true");
  svg.appendChild(crosshair);

  const showTooltipFor = (point) => {
    crosshair.removeAttribute("hidden");
    crosshair.setAttribute("x1", point.x);
    crosshair.setAttribute("x2", point.x);

    tooltip.replaceChildren();
    const valueSpan = document.createElement("span");
    valueSpan.className = "tooltip-value";
    valueSpan.textContent = point.value.toLocaleString();
    const labelSpan = document.createElement("span");
    labelSpan.className = "tooltip-label";
    labelSpan.textContent = formatMonth(point.month, true);
    tooltip.appendChild(valueSpan);
    tooltip.appendChild(labelSpan);
    tooltip.hidden = false;

    const offsetParentRect = tooltip.offsetParent.getBoundingClientRect();
    const svgRect = svg.getBoundingClientRect();
    const pointClientX = svgRect.left + (point.x / width) * svgRect.width;
    const pointClientY = svgRect.top + (point.y / height) * svgRect.height;
    tooltip.style.left = `${pointClientX - offsetParentRect.left + 12}px`;
    tooltip.style.top = `${
      pointClientY - offsetParentRect.top - tooltip.offsetHeight - 10
    }px`;
  };

  const hideTooltip = () => {
    tooltip.hidden = true;
    crosshair.setAttribute("hidden", "true");
  };

  const nearestPoint = (clientX) => {
    const svgRect = svg.getBoundingClientRect();
    const relX = ((clientX - svgRect.left) / svgRect.width) * width;
    let nearest = points[0];
    let minDist = Math.abs(points[0].x - relX);
    for (const point of points) {
      const dist = Math.abs(point.x - relX);
      if (dist < minDist) {
        minDist = dist;
        nearest = point;
      }
    }
    return nearest;
  };

  const hitLayer = document.createElementNS(SVG_NS, "rect");
  hitLayer.setAttribute("x", marginLeft);
  hitLayer.setAttribute("y", marginTop);
  hitLayer.setAttribute("width", plotWidth);
  hitLayer.setAttribute("height", plotHeight);
  hitLayer.setAttribute("fill", "transparent"); // still hit-testable, unlike fill="none"
  hitLayer.setAttribute("tabindex", "0");
  hitLayer.addEventListener("pointermove", (evt) =>
    showTooltipFor(nearestPoint(evt.clientX))
  );
  hitLayer.addEventListener("pointerleave", hideTooltip);
  hitLayer.addEventListener("focus", () => showTooltipFor(last));
  hitLayer.addEventListener("blur", hideTooltip);
  svg.appendChild(hitLayer);

  container.appendChild(svg);
}

loadStats();
