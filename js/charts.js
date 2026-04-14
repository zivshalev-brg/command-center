// ===============================================================
// CHARTS.JS — Lightweight SVG Chart Library for Beanz OS
// ===============================================================

/**
 * Sparkline — compact inline trend line for metric cards
 * @param {number[]} data - Array of numeric values
 * @param {object} opts - { width, height, color, strokeWidth, showDot, showArea }
 * @returns {string} SVG HTML string
 */
function sparkline(data, opts) {
  if (!data || data.length < 2) return '';
  opts = Object.assign({ width: 120, height: 32, color: 'var(--ac)', strokeWidth: 1.5, showDot: true, showArea: true }, opts);

  const w = opts.width, h = opts.height, pad = 2;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (w - pad * 2);
    const y = pad + (1 - (v - min) / range) * (h - pad * 2);
    return { x, y };
  });

  const pathD = points.map((p, i) => (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ');

  let svg = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" class="sparkline-svg">`;

  // Area fill
  if (opts.showArea) {
    const areaD = pathD + ` L${points[points.length - 1].x.toFixed(1)},${h} L${points[0].x.toFixed(1)},${h} Z`;
    svg += `<path d="${areaD}" fill="${opts.color}" opacity=".08"/>`;
  }

  // Line
  svg += `<path d="${pathD}" fill="none" stroke="${opts.color}" stroke-width="${opts.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`;

  // End dot
  if (opts.showDot) {
    const last = points[points.length - 1];
    svg += `<circle cx="${last.x.toFixed(1)}" cy="${last.y.toFixed(1)}" r="2" fill="${opts.color}"/>`;
  }

  svg += '</svg>';
  return svg;
}

/**
 * Bar chart — horizontal bars for breakdowns
 * @param {Array<{label, value, color?}>} data
 * @param {object} opts - { width, barHeight, gap, showValues, maxItems, formatVal }
 * @returns {string} HTML string
 */
function barChart(data, opts) {
  if (!data || data.length === 0) return '';
  opts = Object.assign({ barHeight: 22, gap: 6, showValues: true, maxItems: 12, formatVal: null }, opts);

  const items = data.slice(0, opts.maxItems);
  const maxVal = Math.max(...items.map(d => Math.abs(d.value))) || 1;

  let html = '<div class="chart-bars">';
  items.forEach(d => {
    const pct = Math.abs(d.value) / maxVal * 100;
    const color = d.color || 'var(--ac)';
    const fmtVal = opts.formatVal ? opts.formatVal(d.value) : (typeof d.value === 'number' ? d.value.toLocaleString() : d.value);
    html += `<div class="chart-bar-row" style="margin-bottom:${opts.gap}px">`;
    html += `<span class="chart-bar-label">${d.label}</span>`;
    html += `<div class="chart-bar-track" style="height:${opts.barHeight}px">`;
    html += `<div class="chart-bar-fill" style="width:${pct.toFixed(1)}%;background:${color};height:100%"></div>`;
    html += `</div>`;
    if (opts.showValues) html += `<span class="chart-bar-val">${fmtVal}</span>`;
    html += '</div>';
  });
  html += '</div>';
  return html;
}

/**
 * Trend line — larger time-series line chart for panels
 * @param {Array<{label, value}>} data - Time-series data points
 * @param {object} opts - { width, height, color, showLabels, showGrid, showValues, yFormat }
 * @returns {string} SVG HTML string
 */
function trendLine(data, opts) {
  if (!data || data.length < 2) return '';
  opts = Object.assign({ width: 480, height: 180, color: 'var(--ac)', showLabels: true, showGrid: true, showValues: true, yFormat: null }, opts);

  const w = opts.width, h = opts.height;
  const padL = 50, padR = 10, padT = 10, padB = opts.showLabels ? 28 : 10;
  const chartW = w - padL - padR, chartH = h - padT - padB;

  const values = data.map(d => d.value);
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;

  const points = data.map((d, i) => ({
    x: padL + (i / (data.length - 1)) * chartW,
    y: padT + (1 - (d.value - min) / range) * chartH,
    label: d.label,
    value: d.value
  }));

  let svg = `<svg width="100%" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" class="trendline-svg">`;

  // Grid lines
  if (opts.showGrid) {
    const gridLines = 4;
    for (let i = 0; i <= gridLines; i++) {
      const y = padT + (i / gridLines) * chartH;
      const val = max - (i / gridLines) * range;
      svg += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${w - padR}" y2="${y.toFixed(1)}" stroke="var(--bd)" stroke-width="0.5" stroke-dasharray="3,3"/>`;
      if (opts.showValues) {
        const fmtVal = opts.yFormat ? opts.yFormat(val) : (val >= 1000 ? (val / 1000).toFixed(1) + 'K' : val.toFixed(0));
        svg += `<text x="${padL - 6}" y="${(y + 3).toFixed(1)}" text-anchor="end" fill="var(--tx3)" font-size="9">${fmtVal}</text>`;
      }
    }
  }

  // Area
  const pathD = points.map((p, i) => (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ');
  const areaD = pathD + ` L${points[points.length - 1].x.toFixed(1)},${padT + chartH} L${points[0].x.toFixed(1)},${padT + chartH} Z`;
  svg += `<path d="${areaD}" fill="${opts.color}" opacity=".06"/>`;

  // Line
  svg += `<path d="${pathD}" fill="none" stroke="${opts.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;

  // Data points
  points.forEach((p, i) => {
    svg += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" fill="var(--bg)" stroke="${opts.color}" stroke-width="1.5"/>`;
  });

  // X-axis labels
  if (opts.showLabels) {
    // Show at most 6 labels to avoid crowding
    const step = Math.max(1, Math.ceil(data.length / 6));
    points.forEach((p, i) => {
      if (i % step === 0 || i === data.length - 1) {
        svg += `<text x="${p.x.toFixed(1)}" y="${h - 4}" text-anchor="middle" fill="var(--tx3)" font-size="9">${p.label}</text>`;
      }
    });
  }

  svg += '</svg>';
  return svg;
}

/**
 * Heatmap — grid for regional/categorical performance
 * @param {object} opts - { rows: [{label}], cols: [{label}], values: [[number]], colorScale?, formatVal? }
 * @returns {string} HTML string
 */
function heatmap(opts) {
  if (!opts || !opts.rows || !opts.cols || !opts.values) return '';

  const allVals = opts.values.flat().filter(v => v !== null && v !== undefined);
  const min = Math.min(...allVals), max = Math.max(...allVals);
  const range = max - min || 1;

  const colorFn = opts.colorScale || function(val) {
    const pct = (val - min) / range;
    if (pct > 0.7) return 'var(--gn)';
    if (pct > 0.4) return 'var(--or)';
    return 'var(--rd)';
  };

  let html = '<div class="chart-heatmap"><table class="bm-table"><thead><tr><th></th>';
  opts.cols.forEach(c => { html += `<th style="text-align:center">${c.label}</th>`; });
  html += '</tr></thead><tbody>';

  opts.rows.forEach((row, ri) => {
    html += `<tr><td style="font-weight:var(--fw-sb)">${row.label}</td>`;
    opts.cols.forEach((col, ci) => {
      const val = opts.values[ri] && opts.values[ri][ci] != null ? opts.values[ri][ci] : null;
      if (val === null) {
        html += '<td style="text-align:center;color:var(--tx3)">—</td>';
      } else {
        const color = colorFn(val);
        const fmtVal = opts.formatVal ? opts.formatVal(val) : val.toLocaleString();
        html += `<td style="text-align:center"><span style="display:inline-block;padding:2px 8px;border-radius:4px;background:${color}20;color:${color};font-weight:var(--fw-sb);font-size:var(--f-xs)">${fmtVal}</span></td>`;
      }
    });
    html += '</tr>';
  });

  html += '</tbody></table></div>';
  return html;
}

/**
 * Mini donut — for percentage/ratio display in cards
 * @param {number} value - 0-100 percentage
 * @param {object} opts - { size, strokeWidth, color, bgColor, label }
 * @returns {string} SVG HTML string
 */
function miniDonut(value, opts) {
  opts = Object.assign({ size: 48, strokeWidth: 5, color: 'var(--ac)', bgColor: 'var(--bd)', label: '' }, opts);

  const s = opts.size, cx = s / 2, cy = s / 2, r = (s - opts.strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const dashOffset = circumference * (1 - Math.min(100, Math.max(0, value)) / 100);

  let svg = `<svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" class="mini-donut">`;
  svg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${opts.bgColor}" stroke-width="${opts.strokeWidth}"/>`;
  svg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${opts.color}" stroke-width="${opts.strokeWidth}" stroke-dasharray="${circumference}" stroke-dashoffset="${dashOffset.toFixed(1)}" transform="rotate(-90 ${cx} ${cy})" stroke-linecap="round"/>`;
  if (opts.label) {
    svg += `<text x="${cx}" y="${cy}" text-anchor="middle" dy=".35em" fill="var(--tx)" font-size="10" font-weight="700">${opts.label}</text>`;
  }
  svg += '</svg>';
  return svg;
}
