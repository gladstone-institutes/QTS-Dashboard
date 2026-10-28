// Every chart's "no data"/error placeholder, by its empty-state element id
// -- used both for the fetch-failure path below and for each chart's own
// empty-state handling further down, so no chart is ever left silently
// blank with no message at all.
const CHART_EMPTY_IDS = [
  "chart-empty",
  "trend-empty",
  "outcome-by-platform-empty",
  "outcome-by-gap-empty",
  "query-pattern-empty",
  "keyword-empty",
  "cost-of-error-empty",
  "pattern-by-gap-empty",
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
    topCategoryEl.textContent = "–";
    emptyEl.textContent =
      "No data yet. This updates each time a usage scenario is logged.";
    emptyEl.hidden = false;
  } else {
    const [topLabel, topValue] = entries[0];
    topCategoryEl.textContent = topLabel;
    const topPct = totalRows > 0 ? Math.round((topValue / totalRows) * 100) : 0;
    topCategoryPctEl.textContent = `${topPct}% of all logged queries`;

    renderBarChart(containerEl, entries, totalRows);
  }

  // Most common platform tile -- same shape as the most-common-gap tile.
  const platformEntries = Object.entries(stats.where_run_counts || {}).sort(
    (a, b) => b[1] - a[1]
  );
  if (platformEntries.length > 0) {
    const [topPlatform, topPlatformValue] = platformEntries[0];
    document.getElementById("top-platform").textContent = topPlatform;
    const platformPct = totalRows > 0 ? Math.round((topPlatformValue / totalRows) * 100) : 0;
    document.getElementById("top-platform-pct").textContent = `${platformPct}% of all logged queries`;
  }

  // Monthly trend chart — independent dataset from the bar chart above, so
  // it renders (or shows its own empty state) regardless of gap_counts.
  const monthEntries = Object.entries(stats.monthly_counts || {}).sort(
    (a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)
  );

  if (monthEntries.length === 0) {
    trendEmptyEl.textContent =
      "No data yet. This updates each time a usage scenario is logged.";
    trendEmptyEl.hidden = false;
  } else {
    renderTrendChart(trendContainerEl, monthEntries);
    // The SVG is drawn at the container's real pixel width (so text and
    // strokes stay 1:1 instead of scaling up with the card) -- redraw it
    // when that width changes.
    let lastWidth = trendContainerEl.clientWidth;
    let resizeTimer;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (trendContainerEl.clientWidth !== lastWidth) {
          lastWidth = trendContainerEl.clientWidth;
          renderTrendChart(trendContainerEl, monthEntries);
        }
      }, 150);
    });
  }

  // Outcome by where the query was run: is success higher on UI, ARAX or
  // TCT? Platforms in their fixed order (any legacy value after them), with
  // the overall outcome split pinned on top.
  const outcomeByPlatformEmptyEl = document.getElementById("outcome-by-platform-empty");
  const outcomeByPlatformContainerEl = document.getElementById("outcome-by-platform-container");
  const outcomeByPlatform = stats.outcome_by_where_run || {};

  if (Object.keys(outcomeByPlatform).length === 0) {
    outcomeByPlatformContainerEl.hidden = true;
    outcomeByPlatformEmptyEl.textContent =
      "No data yet. This updates each time a usage scenario is logged.";
    outcomeByPlatformEmptyEl.hidden = false;
  } else {
    renderStackedChart(
      document.getElementById("outcome-by-platform-rows"),
      Object.entries(outcomeByPlatform),
      OUTCOME_ORDER,
      (key) => OUTCOME_FILL_CLASS[key],
      (key) => OUTCOME_LABELS[key],
      {
        overallRow: ["All queries", stats.outcome_counts || {}],
        rowOrder: PLATFORM_ORDER,
        showPercent: true,
      }
    );
  }

  // Query pattern pie: a fixed 4-value scale, so each pattern keeps its own
  // color whatever its count.
  renderPieField(stats, "query_pattern_counts", "query-pattern-container", "query-pattern-empty", PATTERN_ORDER);

  // Outcome by gap — the combined view: within each gap type, how often did
  // Translator actually deliver? This is the direct "intent vs. output"
  // read, not just a count of gap types on its own.
  const outcomeByGapEmptyEl = document.getElementById("outcome-by-gap-empty");
  const outcomeByGapRowsEl = document.getElementById("outcome-by-gap-rows");
  const outcomeByGap = stats.outcome_by_gap || {};

  if (Object.keys(outcomeByGap).length === 0) {
    outcomeByGapEmptyEl.textContent =
      "No data yet. This updates each time a usage scenario is logged.";
    outcomeByGapEmptyEl.hidden = false;
  } else {
    renderStackedChart(
      outcomeByGapRowsEl,
      Object.entries(outcomeByGap),
      OUTCOME_ORDER,
      (key) => OUTCOME_FILL_CLASS[key],
      (key) => OUTCOME_LABELS[key],
      { showPercent: true }
    );
  }

  // Cost of an incorrect answer -- 100%-stacked bar, overall + per gap
  // type, Low (yellow) through Critical (deep red) with a distinct hue per
  // level, and each segment's % printed on it.
  const costEmptyEl = document.getElementById("cost-of-error-empty");
  const costContainerEl = document.getElementById("cost-of-error-container");
  const costOverall = { ...(stats.cost_of_error_counts || {}) };
  delete costOverall.Unspecified;
  const costTotal = COST_ORDER.reduce((sum, key) => sum + (costOverall[key] || 0), 0);

  if (costTotal === 0) {
    costContainerEl.hidden = true;
    costEmptyEl.textContent =
      "No data yet. This updates each time a usage scenario is logged.";
    costEmptyEl.hidden = false;
  } else {
    renderStackedChart(
      document.getElementById("cost-of-error-rows"),
      Object.entries(stats.cost_of_error_by_gap || {}),
      COST_ORDER,
      (key) => `sev-${COST_ORDER.indexOf(key) + 1}`,
      (key) => key,
      { overallRow: ["All queries", costOverall], showPercent: true }
    );
    const unspecified = stats.cost_of_error_unspecified || 0;
    if (unspecified > 0) {
      const noteEl = document.getElementById("cost-of-error-note");
      noteEl.textContent = `${unspecified} quer${unspecified === 1 ? "y" : "ies"} with no cost recorded ${unspecified === 1 ? "is" : "are"} left out.`;
      noteEl.hidden = false;
    }
  }

  // Keyword word cloud.
  const keywordEmptyEl = document.getElementById("keyword-empty");
  const keywordEntries = Object.entries(stats.keyword_counts || {});
  if (keywordEntries.length === 0) {
    keywordEmptyEl.textContent =
      "No data yet. This updates each time a usage scenario is logged.";
    keywordEmptyEl.hidden = false;
  } else {
    renderWordCloud(document.getElementById("keyword-container"), keywordEntries);
  }

  // Query pattern x gap heatmap.
  const patternByGapEmptyEl = document.getElementById("pattern-by-gap-empty");
  const patternByGap = stats.query_pattern_by_gap || {};

  if (Object.keys(patternByGap).length === 0) {
    patternByGapEmptyEl.textContent =
      "No data yet. This updates each time a usage scenario is logged.";
    patternByGapEmptyEl.hidden = false;
  } else {
    renderHeatmap(document.getElementById("pattern-by-gap-container"), patternByGap);
  }
}

// Shared by renderBarChart and the stacked charts: attaches a hover/focus
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

// A 100%-stacked horizontal bar per row (part-to-whole within each row),
// segments in the scale's fixed `order` with a 2px surface gap between them
// (CSS `gap` on .stacked-track). Used by outcome-by-gap and cost of an
// incorrect answer. `rows` is [label, counts] pairs, drawn largest total
// first unless `rowOrder` fixes the order (labels not in it follow, by
// total); an optional `overallRow` is pinned on top and set apart.
// `showPercent` prints each segment's % on it when the segment is wide
// enough to hold the text. Zero-count segments are skipped entirely so
// corner-rounding (:first-child/:last-child) lands on whichever segment is
// actually visible.
const MIN_LABELLED_PCT = 8;

function renderStackedChart(container, rows, order, fillClassFor, labelFor, options = {}) {
  const { overallRow, rowOrder, showPercent } = options;
  container.replaceChildren();

  const rowTotal = (counts) => order.reduce((sum, key) => sum + (counts[key] || 0), 0);
  const rank = (label) => {
    const i = rowOrder ? rowOrder.indexOf(label) : -1;
    return i === -1 ? Infinity : i;
  };
  const sorted = rows
    .filter(([, counts]) => rowTotal(counts) > 0)
    .sort((a, b) => rank(a[0]) - rank(b[0]) || rowTotal(b[1]) - rowTotal(a[1]));
  const allRows = overallRow ? [[...overallRow, true], ...sorted] : sorted;

  allRows.forEach(([rowLabel, counts, isOverall]) => {
    const total = rowTotal(counts);

    const row = document.createElement("div");
    row.className = isOverall ? "stacked-row stacked-row-overall" : "stacked-row";

    const labelEl = document.createElement("span");
    labelEl.className = "stacked-label";
    labelEl.textContent = rowLabel;
    labelEl.title = rowLabel;

    const track = document.createElement("div");
    track.className = "stacked-track";

    // Each segment is its own hit target with its own tooltip ("the mark
    // is the hit target"; a combined row-level tooltip would run every
    // breakdown into one unwieldy line instead).
    order.forEach((key) => {
      const value = counts[key] || 0;
      if (value === 0) return;
      const pct = total > 0 ? Math.round((value / total) * 100) : 0;
      const segment = document.createElement("div");
      segment.className = `stacked-segment ${fillClassFor(key)}`;
      segment.style.width = `${(value / total) * 100}%`;
      segment.tabIndex = 0;
      if (showPercent && pct >= MIN_LABELLED_PCT) {
        const pctEl = document.createElement("span");
        pctEl.className = "stacked-pct";
        pctEl.textContent = `${pct}%`;
        segment.appendChild(pctEl);
      }
      track.appendChild(segment);
      attachRowTooltip(segment, container, `${value} (${pct}%)`, `${rowLabel}: ${labelFor(key)}`);
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

// "Where was the query run?" options, in display order.
const PLATFORM_ORDER = ["UI", "ARAX", "TCT"];

// Cost of an incorrect answer: an ordered 5-step scale, Low -> Critical.
const COST_ORDER = [
  "Low",
  "Moderate",
  "Practical impact",
  "High consequence",
  "Critical/irreversible",
];

// Query pattern x gap -- a count heatmap. Columns in the scale's own order
// (not by count). Cell shade is one of 5 steps of the brand purple
// (--seq-1..5, matching the legend above the grid); every cell also
// prints its number, so shade is never the only encoding.
const HEAT_STEPS = 5;
const PATTERN_ORDER = ["Deductive", "Causal", "Mechanistic", "Contextual", "Unspecified"];

function renderHeatmap(container, patternByGap) {
  container.replaceChildren();

  const columns = PATTERN_ORDER.filter((pattern) =>
    Object.values(patternByGap).some((counts) => (counts[pattern] || 0) > 0)
  );
  const rowTotal = (counts) => columns.reduce((sum, p) => sum + (counts[p] || 0), 0);
  const rows = Object.entries(patternByGap).sort((a, b) => rowTotal(b[1]) - rowTotal(a[1]));
  const maxValue = Math.max(
    ...rows.flatMap(([, counts]) => columns.map((p) => counts[p] || 0))
  );

  const grid = document.createElement("div");
  grid.className = "heatmap";
  grid.style.gridTemplateColumns = `minmax(120px, 160px) repeat(${columns.length}, minmax(64px, 1fr)) 48px`;

  const addCell = (className, text) => {
    const cell = document.createElement("div");
    cell.className = className;
    cell.textContent = text;
    grid.appendChild(cell);
    return cell;
  };

  addCell("heatmap-corner", "");
  columns.forEach((p) => addCell("heatmap-col-label", p));
  addCell("heatmap-col-label heatmap-total-label", "Total");

  rows.forEach(([gapLabel, counts]) => {
    const labelCell = addCell("heatmap-row-label", gapLabel);
    labelCell.title = gapLabel;

    columns.forEach((pattern) => {
      const value = counts[pattern] || 0;
      const cell = addCell("heatmap-cell", value > 0 ? value : "");
      if (value > 0) {
        const step = Math.max(1, Math.ceil((value / maxValue) * HEAT_STEPS));
        cell.classList.add(`seq-${step}`);
        cell.tabIndex = 0;
        attachRowTooltip(cell, container, `${value}`, `${gapLabel}: ${pattern}`);
      }
    });

    addCell("heatmap-row-total", rowTotal(counts));
  });

  addCell("heatmap-row-label heatmap-total-label", "Total");
  columns.forEach((pattern) =>
    addCell("heatmap-row-total", rows.reduce((sum, [, counts]) => sum + (counts[pattern] || 0), 0))
  );
  addCell("heatmap-row-total", rows.reduce((sum, [, counts]) => sum + rowTotal(counts), 0));

  container.appendChild(grid);
}

// Pie chart + legend. At most PIE_COLORS.length named slices; anything
// past that (and "Unspecified") folds into one gray slice so no color is
// ever generated or reused. Slices start at 12 o'clock, clockwise, with a
// 2px surface-colored stroke between them.
const PIE_COLORS = ["var(--pie-1)", "var(--pie-2)", "var(--pie-3)", "var(--pie-4)"];
const PIE_OTHER_COLOR = "var(--pie-other)";

function renderPieField(stats, fieldKey, containerId, emptyId, fixedOrder) {
  const containerEl = document.getElementById(containerId);
  const emptyEl = document.getElementById(emptyId);
  const counts = stats[fieldKey] || {};
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  if (total === 0) {
    emptyEl.textContent = "No data yet. This updates each time a usage scenario is logged.";
    emptyEl.hidden = false;
    return;
  }

  let named;
  let otherValue = 0;
  let otherLabel = "Other";
  if (fixedOrder) {
    named = fixedOrder
      .filter((key) => key !== "Unspecified")
      .map((key, i) => ({ label: key, value: counts[key] || 0, color: PIE_COLORS[i] }));
    Object.entries(counts).forEach(([key, value]) => {
      if (!fixedOrder.includes(key) || key === "Unspecified") otherValue += value;
    });
    if (Object.keys(counts).every((key) => fixedOrder.includes(key))) otherLabel = "Unspecified";
  } else {
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    named = sorted
      .slice(0, PIE_COLORS.length)
      .map(([label, value], i) => ({ label, value, color: PIE_COLORS[i] }));
    otherValue = sorted.slice(PIE_COLORS.length).reduce((sum, [, v]) => sum + v, 0);
  }
  const slices = named.filter((slice) => slice.value > 0);
  if (otherValue > 0) slices.push({ label: otherLabel, value: otherValue, color: PIE_OTHER_COLOR });

  renderPieChart(containerEl, slices, total);
}

function renderPieChart(container, slices, total) {
  container.replaceChildren();
  container.className = "pie-chart";

  const size = 160;
  const r = size / 2 - 2;
  const c = size / 2;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
  svg.setAttribute("class", "pie-svg");
  svg.setAttribute("role", "img");
  svg.setAttribute(
    "aria-label",
    slices.map((s) => `${s.label}: ${s.value}`).join(", ")
  );

  const point = (angle) => [c + r * Math.sin(angle), c - r * Math.cos(angle)];
  let angle = 0;
  slices.forEach((slice) => {
    const pct = Math.round((slice.value / total) * 100);
    const sweep = (slice.value / total) * Math.PI * 2;
    let mark;
    if (slices.length === 1) {
      mark = document.createElementNS(SVG_NS, "circle");
      mark.setAttribute("cx", c);
      mark.setAttribute("cy", c);
      mark.setAttribute("r", r);
    } else {
      const [x1, y1] = point(angle);
      const [x2, y2] = point(angle + sweep);
      mark = document.createElementNS(SVG_NS, "path");
      mark.setAttribute(
        "d",
        `M ${c} ${c} L ${x1} ${y1} A ${r} ${r} 0 ${sweep > Math.PI ? 1 : 0} 1 ${x2} ${y2} Z`
      );
    }
    mark.setAttribute("class", "pie-slice");
    mark.style.fill = slice.color;
    mark.setAttribute("tabindex", "0");
    svg.appendChild(mark);
    attachRowTooltip(mark, container, `${slice.value} (${pct}%)`, slice.label);
    angle += sweep;
  });

  const legend = document.createElement("div");
  legend.className = "pie-legend";
  slices.forEach((slice) => {
    const pct = Math.round((slice.value / total) * 100);
    const item = document.createElement("div");
    item.className = "pie-legend-item";

    const swatch = document.createElement("span");
    swatch.className = "legend-swatch";
    swatch.style.background = slice.color;
    const labelEl = document.createElement("span");
    labelEl.className = "pie-legend-label";
    labelEl.textContent = slice.label; // untrusted (sheet-derived) text -> textContent
    labelEl.title = slice.label;
    const valueEl = document.createElement("span");
    valueEl.className = "pie-legend-value";
    valueEl.textContent = `${slice.value} (${pct}%)`;

    item.appendChild(swatch);
    item.appendChild(labelEl);
    item.appendChild(valueEl);
    legend.appendChild(item);
  });

  container.appendChild(svg);
  container.appendChild(legend);
}

// Keyword word cloud -- font size scales with count (by square root, so
// area rather than height tracks the count). Biggest words sit in the
// middle: entries are dealt alternately to either side of the largest.
// Each word also shows its count, since size alone is hard to compare.
function renderWordCloud(container, entries) {
  container.replaceChildren();
  container.className = "word-cloud";

  const sorted = entries.slice().sort((a, b) => b[1] - a[1]);
  const total = sorted.reduce((sum, [, v]) => sum + v, 0);
  const maxValue = sorted[0][1];
  const minValue = sorted[sorted.length - 1][1];
  const MIN_PX = 14;
  const MAX_PX = 30;
  const sizeFor = (value) =>
    maxValue === minValue
      ? (MIN_PX + MAX_PX) / 2
      : MIN_PX + ((Math.sqrt(value) - Math.sqrt(minValue)) / (Math.sqrt(maxValue) - Math.sqrt(minValue))) * (MAX_PX - MIN_PX);

  const ordered = [];
  sorted.forEach((entry, i) => (i % 2 === 0 ? ordered.push(entry) : ordered.unshift(entry)));

  ordered.forEach(([word, value]) => {
    const pct = total > 0 ? Math.round((value / total) * 100) : 0;
    const item = document.createElement("span");
    item.className = "word-cloud-item";
    item.style.fontSize = `${Math.round(sizeFor(value))}px`;
    item.tabIndex = 0;

    const wordEl = document.createElement("span");
    wordEl.textContent = word; // untrusted (sheet-derived) text -> textContent
    const countEl = document.createElement("span");
    countEl.className = "word-cloud-count";
    countEl.textContent = value;

    item.appendChild(wordEl);
    item.appendChild(countEl);
    attachRowTooltip(item, container, `${value} (${pct}%)`, word);
    container.appendChild(item);
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
  const width = Math.max(320, Math.round(container.clientWidth || 640));
  const height = 180;
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

  // X-axis month labels: every nth month so they never overlap, with the
  // year added whenever it changes from the last label shown ("Mar 2025",
  // ..., "Jan 2026"), even if January itself is skipped.
  const MONTH_LABEL_SLOT = 56; // px one "Mar 2025" label needs
  const labelEvery = Math.max(1, Math.ceil((points.length * MONTH_LABEL_SLOT) / plotWidth));
  let lastLabelYear = null;
  points.forEach((point, i) => {
    if (i % labelEvery !== 0) return;
    const year = point.month.slice(0, 4);
    const text = document.createElementNS(SVG_NS, "text");
    text.setAttribute("x", point.x);
    text.setAttribute("y", height - marginBottom + 18);
    text.setAttribute("class", "trend-month-label");
    text.setAttribute("text-anchor", "middle");
    text.textContent =
      year !== lastLabelYear ? `${formatMonth(point.month)} ${year}` : formatMonth(point.month);
    lastLabelYear = year;
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
