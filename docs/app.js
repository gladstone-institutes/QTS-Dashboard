// Every chart's "no data"/error placeholder, by its empty-state element id
// -- used both for the fetch-failure path below and for each chart's own
// empty-state handling further down, so no chart is ever left silently
// blank with no message at all.
const CHART_EMPTY_IDS = [
  "chart-empty",
  "trend-empty",
  "outcome-empty",
  "outcome-by-gap-empty",
  "where-run-empty",
  "query-pattern-empty",
  "keyword-empty",
  "cost-of-error-empty",
];

function showAllEmptyStates(message) {
  CHART_EMPTY_IDS.forEach((id) => {
    const el = document.getElementById(id);
    el.textContent = message;
    el.hidden = false;
  });
}

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
  const outcomeEmptyEl = document.getElementById("outcome-empty");
  const outcomeContainerEl = document.getElementById("outcome-container");

  let stats;
  try {
    const res = await fetch("./data/stats.json", { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`stats.json request failed: HTTP ${res.status}`);
    }
    stats = await res.json();
  } catch (err) {
    showAllEmptyStates("Couldn't load dashboard data.");
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

  // Outcome breakdown — a fixed-order 3-state scale (not ranked by count,
  // unlike the gap-nature chart: Y/Partial/N have an inherent sequence,
  // so a magnitude-sorted rank badge would misrepresent it).
  const outcomeCounts = stats.outcome_counts || {};
  const outcomeTotal = Object.values(outcomeCounts).reduce((a, b) => a + b, 0);

  if (outcomeTotal === 0) {
    outcomeEmptyEl.textContent =
      "No data yet — the dashboard refreshes automatically once a day.";
    outcomeEmptyEl.hidden = false;
  } else {
    renderOutcomeChart(outcomeContainerEl, outcomeCounts, outcomeTotal);
  }

  // Four more simple ranked-bar breakdowns — same shape as the gap-nature
  // chart above, just a different field each time.
  renderSimpleBarField(stats, "where_run_counts", "where-run-container", "where-run-empty");
  renderSimpleBarField(stats, "query_pattern_counts", "query-pattern-container", "query-pattern-empty");
  renderSimpleBarField(stats, "keyword_counts", "keyword-container", "keyword-empty");
  renderSimpleBarField(stats, "cost_of_error_counts", "cost-of-error-container", "cost-of-error-empty");

  // Outcome by gap — the combined view: within each gap type, how often did
  // Translator actually deliver? This is the direct "intent vs. output"
  // read, not just a count of gap types on its own.
  const outcomeByGapEmptyEl = document.getElementById("outcome-by-gap-empty");
  const outcomeByGapRowsEl = document.getElementById("outcome-by-gap-rows");
  const outcomeByGap = stats.outcome_by_gap || {};

  if (Object.keys(outcomeByGap).length === 0) {
    outcomeByGapEmptyEl.textContent =
      "No data yet — the dashboard refreshes automatically once a day.";
    outcomeByGapEmptyEl.hidden = false;
  } else {
    renderStackedChart(outcomeByGapRowsEl, outcomeByGap);
  }
}

// Shared by the four simple ranked-bar charts added after the gap-nature
// chart: pulls `stats[fieldKey]`, sorts by count, and renders (or shows the
// empty state) into the given container/empty element ids.
function renderSimpleBarField(stats, fieldKey, containerId, emptyId) {
  const containerEl = document.getElementById(containerId);
  const emptyEl = document.getElementById(emptyId);
  const entries = Object.entries(stats[fieldKey] || {}).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((sum, [, v]) => sum + v, 0);

  if (entries.length === 0) {
    emptyEl.textContent = "No data yet — the dashboard refreshes automatically once a day.";
    emptyEl.hidden = false;
  } else {
    renderBarChart(containerEl, entries, total);
  }
}

// Shared by renderBarChart and renderOutcomeChart: attaches a hover/focus
// tooltip to one row, positioned above it (or below, if there's no room
// above the chart area) within `container`'s offset-positioned ancestor.
function attachRowTooltip(row, container, valueText, labelText) {
  const tooltip = document.getElementById("tooltip");

  const showTooltip = () => {
    tooltip.replaceChildren();
    const valueSpan = document.createElement("span");
    valueSpan.className = "tooltip-value";
    valueSpan.textContent = valueText;
    const labelSpan = document.createElement("span");
    labelSpan.className = "tooltip-label";
    labelSpan.textContent = labelText; // untrusted (sheet-derived) text -> textContent
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
}

function renderBarChart(container, entries, totalRows) {
  const maxValue = Math.max(...entries.map(([, v]) => v));
  container.replaceChildren();

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

    attachRowTooltip(row, container, `${value} (${pct}%)`, label);

    container.appendChild(row);
  });
}

// Y/Partial/N have an inherent sequence (success -> partial -> failure),
// so this is a fixed display order, not a magnitude ranking — unlike the
// gap-nature chart, rows here carry no rank badge.
const OUTCOME_ORDER = ["Y", "Partial", "N"];
const OUTCOME_LABELS = {
  Y: "Successful",
  Partial: "Partially successful",
  N: "Not successful",
};

// Outcome fill colors use the fixed status palette (good/warning/critical),
// not the brand hue -- Y/Partial/N carry inherent good/bad meaning, unlike
// an open categorical field. Always paired with the row's own text label,
// per the "never color alone" status-color rule.
const OUTCOME_FILL_CLASS = {
  Y: "bar-fill-good",
  Partial: "bar-fill-warning",
  N: "bar-fill-critical",
};

function renderOutcomeChart(container, counts, totalRows) {
  const entries = OUTCOME_ORDER.filter((key) => (counts[key] || 0) > 0).map((key) => [
    key,
    OUTCOME_LABELS[key] || key,
    counts[key],
  ]);
  const maxValue = Math.max(...entries.map(([, , v]) => v));
  container.replaceChildren();

  entries.forEach(([key, label, value]) => {
    const pct = totalRows > 0 ? Math.round((value / totalRows) * 100) : 0;

    const row = document.createElement("div");
    row.className = "outcome-row";
    row.tabIndex = 0;

    const labelEl = document.createElement("span");
    labelEl.className = "bar-label";
    labelEl.textContent = label;

    const track = document.createElement("div");
    track.className = "bar-track";

    const fill = document.createElement("div");
    fill.className = `bar-fill ${OUTCOME_FILL_CLASS[key] || ""}`;
    fill.style.width = `${(value / maxValue) * 100}%`;
    track.appendChild(fill);

    const valueEl = document.createElement("span");
    valueEl.className = "bar-value";
    valueEl.textContent = value;

    const pctEl = document.createElement("span");
    pctEl.className = "bar-pct";
    pctEl.textContent = `${pct}%`;

    row.appendChild(labelEl);
    row.appendChild(track);
    row.appendChild(valueEl);
    row.appendChild(pctEl);

    attachRowTooltip(row, container, `${value} (${pct}%)`, label);

    container.appendChild(row);
  });
}

// Outcome by gap — a 100%-stacked horizontal bar per gap category (part-
// to-whole within each category), 3 segments in the fixed Y/Partial/N
// order with a 2px surface gap between them (CSS `gap` on .stacked-track).
// Zero-count segments are skipped entirely so corner-rounding (:first-
// child/:last-child) lands on whichever segment is actually visible.
function renderStackedChart(container, outcomeByGap) {
  container.replaceChildren();

  const rows = Object.entries(outcomeByGap)
    .map(([gapLabel, counts]) => [
      gapLabel,
      counts,
      OUTCOME_ORDER.reduce((sum, key) => sum + (counts[key] || 0), 0),
    ])
    .sort((a, b) => b[2] - a[2]);

  rows.forEach(([gapLabel, counts, total]) => {
    const row = document.createElement("div");
    row.className = "stacked-row";

    const labelEl = document.createElement("span");
    labelEl.className = "stacked-label";
    labelEl.textContent = gapLabel;
    labelEl.title = gapLabel;

    const track = document.createElement("div");
    track.className = "stacked-track";

    // Each segment is its own hit target with its own tooltip ("the mark
    // is the hit target" — a combined row-level tooltip would run all 3
    // breakdowns into one unwieldy line instead).
    OUTCOME_ORDER.forEach((key) => {
      const value = counts[key] || 0;
      if (value === 0) return;
      const pct = total > 0 ? Math.round((value / total) * 100) : 0;
      const segment = document.createElement("div");
      segment.className = `stacked-segment ${OUTCOME_FILL_CLASS[key]}`;
      segment.style.width = `${(value / total) * 100}%`;
      segment.tabIndex = 0;
      track.appendChild(segment);
      attachRowTooltip(segment, container, `${value} (${pct}%)`, `${gapLabel} — ${OUTCOME_LABELS[key]}`);
    });

    const totalEl = document.createElement("span");
    totalEl.className = "stacked-total";
    totalEl.textContent = total;

    row.appendChild(labelEl);
    row.appendChild(track);
    row.appendChild(totalEl);

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
