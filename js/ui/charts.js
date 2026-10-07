// Gráficos simples en SVG, sin librerías.
//
// Criterios: marcas finas, extremos redondeados, 2px de separación entre
// segmentos, grilla muy suave, textos siempre en colores de texto (el color
// solo identifica la serie) y leyenda cuando hay más de una serie. Cada
// marca tiene `data-tip` para el tooltip (mouse, toque o foco con teclado).

import { html, raw, esc } from "./dom.js";
import { formatCompact, formatMoney } from "../core/money.js";

const r1 = (n) => Math.round(n * 10) / 10;

/**
 * Dona para distribución por categorías.
 * segments: [{ label, value, color }]
 */
export function donutChart(segments, { size = 168, thickness = 22, centerLabel = "", centerValue = "", currency } = {}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const gap = segments.length > 1 ? 2 : 0; // 2px de superficie entre porciones
  let offset = 0;
  const arcs = segments.map((seg) => {
    const length = total ? (seg.value / total) * circumference : 0;
    const visible = Math.max(0, length - gap);
    const arc = html`<circle class="donut-seg" cx="${size / 2}" cy="${size / 2}" r="${r1(radius)}"
      stroke="${seg.color}" stroke-width="${thickness}" fill="none"
      stroke-dasharray="${r1(visible)} ${r1(circumference - visible)}" stroke-dashoffset="${r1(-offset)}"
      tabindex="0" data-tip="${seg.label}\n${formatMoney(seg.value, currency)} · ${Math.round((seg.value / total) * 100)}%"></circle>`;
    offset += length;
    return arc;
  });
  return html`<div class="donut" style="width:${size}px;height:${size}px">
    <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${centerLabel} ${centerValue}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r1(radius)}" stroke="var(--track)" stroke-width="${thickness}" fill="none"></circle>
      <g transform="rotate(-90 ${size / 2} ${size / 2})">${arcs}</g>
    </svg>
    <div class="donut-center"><span class="donut-center-label">${centerLabel}</span><span class="donut-center-value">${centerValue}</span></div>
  </div>`;
}

/**
 * Barras agrupadas ingresos vs gastos por mes.
 * months: [{ label, income, expense }]
 */
export function barChart(months, { currency, height = 180, width = 320 } = {}) {
  const padTop = 12;
  const padBottom = 24;
  const padLeft = 44;
  const plotH = height - padTop - padBottom;
  const plotW = width - padLeft - 4;
  const max = niceMax(Math.max(1, ...months.flatMap((m) => [m.income, m.expense])));
  const groupW = plotW / months.length;
  const barW = Math.min(width > 400 ? 24 : 14, (groupW - 12) / 2);
  const y = (v) => padTop + plotH - (v / max) * plotH;

  const grid = [0, 0.5, 1].map((t) => {
    const gy = r1(y(max * t));
    return html`<line class="grid-line" x1="${padLeft}" x2="${width}" y1="${gy}" y2="${gy}"></line>
      <text class="axis-label" x="${padLeft - 6}" y="${gy + 3.5}" text-anchor="end">${t === 0 ? "0" : formatCompact(max * t, currency)}</text>`;
  });

  const groups = months.map((m, i) => {
    const cx = padLeft + groupW * i + groupW / 2;
    const bar = (value, x, cls) => {
      const h = Math.max(value > 0 ? 3 : 0, (value / max) * plotH);
      return raw(`<path class="bar ${cls}" d="${roundedTopRect(x, padTop + plotH - h, barW, h, Math.min(4, barW / 2))}"></path>`);
    };
    return html`<g class="bar-group" tabindex="0" data-tip="${m.label}\nIngresos: ${formatMoney(m.income, currency)}\nGastos: ${formatMoney(m.expense, currency)}">
      <rect class="hit" x="${r1(cx - groupW / 2)}" y="${padTop}" width="${r1(groupW)}" height="${plotH}"></rect>
      ${bar(m.income, cx - barW - 1, "bar-income")}
      ${bar(m.expense, cx + 1, "bar-expense")}
      <text class="axis-label ${m.current ? "is-current" : ""}" x="${r1(cx)}" y="${height - 6}" text-anchor="middle">${m.label}</text>
    </g>`;
  });

  return html`<div class="chart">
    <div class="legend">
      <span class="legend-item"><span class="legend-swatch swatch-income"></span>Ingresos</span>
      <span class="legend-item"><span class="legend-swatch swatch-expense"></span>Gastos</span>
    </div>
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Ingresos y gastos por mes">
      ${grid}${groups}
    </svg>
  </div>`;
}

/**
 * Línea con área para la evolución del dinero total.
 * points: [{ label, value }]
 */
export function lineChart(points, { currency, height = 160, color = "var(--brand)", width = 320 } = {}) {
  const padTop = 16;
  const padBottom = 24;
  const padLeft = 44;
  const padRight = 12;
  const plotH = height - padTop - padBottom;
  const plotW = width - padLeft - padRight;
  const values = points.map((p) => p.value);
  const rawMin = Math.min(0, ...values);
  const max = niceMax(Math.max(1, ...values));
  const min = rawMin < 0 ? -niceMax(-rawMin) : 0;
  const x = (i) => padLeft + (points.length === 1 ? plotW / 2 : (plotW * i) / (points.length - 1));
  const y = (v) => padTop + plotH - ((v - min) / (max - min)) * plotH;
  const coords = points.map((p, i) => [r1(x(i)), r1(y(p.value))]);
  const line = coords.map(([cx, cy], i) => `${i ? "L" : "M"}${cx} ${cy}`).join(" ");
  const area = `${line} L${coords[coords.length - 1][0]} ${r1(y(Math.max(0, min)))} L${coords[0][0]} ${r1(y(Math.max(0, min)))} Z`;
  const last = coords[coords.length - 1];
  const stepW = points.length > 1 ? plotW / (points.length - 1) : plotW;

  return html`<div class="chart">
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Evolución del dinero total">
      <defs><linearGradient id="area-grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${color}" stop-opacity=".22"></stop><stop offset="1" stop-color="${color}" stop-opacity="0"></stop>
      </linearGradient></defs>
      ${[min, (min + max) / 2, max].map((v) => {
        const gy = r1(y(v));
        return html`<line class="grid-line" x1="${padLeft}" x2="${width - padRight}" y1="${gy}" y2="${gy}"></line>
          <text class="axis-label" x="${padLeft - 6}" y="${gy + 3.5}" text-anchor="end">${v === 0 ? "0" : formatCompact(v, currency)}</text>`;
      })}
      <path d="${area}" fill="url(#area-grad)"></path>
      <path class="line-path" d="${line}" stroke="${color}"></path>
      ${points.map(
        (p, i) => html`<g class="line-point" tabindex="0" data-tip="${p.label}\n${formatMoney(p.value, currency)}">
          <rect class="hit" x="${r1(coords[i][0] - stepW / 2)}" y="${padTop}" width="${r1(stepW)}" height="${plotH}"></rect>
          <line class="crosshair" x1="${coords[i][0]}" x2="${coords[i][0]}" y1="${padTop}" y2="${padTop + plotH}"></line>
          <circle class="dot" cx="${coords[i][0]}" cy="${coords[i][1]}" r="4" fill="${color}"></circle>
          <text class="axis-label" x="${coords[i][0]}" y="${height - 6}" text-anchor="middle">${p.label}</text>
        </g>`
      )}
      <circle class="dot-last" cx="${last[0]}" cy="${last[1]}" r="4.5" fill="${color}"></circle>
    </svg>
  </div>`;
}

/** Barra apilada horizontal (se usa en el saldo del inicio). */
export function stackBar(segments) {
  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0) || 1;
  return html`<div class="stack-bar" role="img" aria-label="${segments.map((s) => `${s.label}: ${Math.round((Math.max(0, s.value) / total) * 100)}%`).join(", ")}">
    ${segments
      .filter((s) => s.value > 0)
      .map((s) => html`<span class="stack-seg" style="--w:${(s.value / total) * 100}%;--c:${s.color}" data-tip="${s.label}\n${s.tip || ""}"></span>`)}
  </div>`;
}

function roundedTopRect(x, y, w, h, r) {
  if (h <= 0) return "";
  r = Math.min(r, h);
  return `M${r1(x)} ${r1(y + h)} V${r1(y + r)} Q${r1(x)} ${r1(y)} ${r1(x + r)} ${r1(y)} H${r1(x + w - r)} Q${r1(x + w)} ${r1(y)} ${r1(x + w)} ${r1(y + r)} V${r1(y + h)} Z`;
}

/** Redondea el máximo del eje a un número "lindo" (1, 2, 2.5, 5 × 10^n). */
function niceMax(value) {
  const exp = Math.pow(10, Math.floor(Math.log10(value)));
  const f = value / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * exp;
}

// ---------------------------------------------------------------------------
// Tooltip compartido
// ---------------------------------------------------------------------------

let tipEl = null;

export function initChartTooltips() {
  tipEl = document.createElement("div");
  tipEl.className = "chart-tip";
  tipEl.setAttribute("role", "tooltip");
  document.body.appendChild(tipEl);

  const show = (target) => {
    const text = target.getAttribute("data-tip");
    if (!text) return;
    tipEl.innerHTML = text
      .split("\n")
      .filter(Boolean)
      .map((line, i) => (i === 0 ? `<strong>${esc(line)}</strong>` : `<span>${esc(line)}</span>`))
      .join("");
    const rect = target.getBoundingClientRect();
    tipEl.classList.add("is-visible");
    const tipRect = tipEl.getBoundingClientRect();
    const left = Math.min(window.innerWidth - tipRect.width - 8, Math.max(8, rect.left + rect.width / 2 - tipRect.width / 2));
    const top = rect.top - tipRect.height - 8 < 8 ? rect.bottom + 8 : rect.top - tipRect.height - 8;
    tipEl.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  };
  const hide = () => tipEl.classList.remove("is-visible");

  document.addEventListener("pointerover", (e) => {
    const target = e.target.closest?.("[data-tip]");
    if (target) show(target);
    else hide();
  });
  document.addEventListener("focusin", (e) => {
    const target = e.target.closest?.("[data-tip]");
    if (target) show(target);
  });
  document.addEventListener("focusout", hide);
  window.addEventListener("scroll", hide, { passive: true });
}
