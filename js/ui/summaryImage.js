// Resumen del mes como imagen (PNG 1080×1350, formato vertical para
// compartir en WhatsApp o historias). Se dibuja en un canvas dentro del
// dispositivo: nada se sube a ningún lado.

import { msg, tr } from "../core/i18n.js";
import { formatMoney } from "../core/money.js";
import { formatMonth } from "../core/dates.js";
import { monthlyTotals, expensesByCategory, percent } from "../core/finance.js";

const W = 1080;
const H = 1350;
const PAD = 72;

// Colores fijos (la imagen siempre sale en modo claro, igual que tokens.css)
const C = {
  bg: "#f5f3ee",
  surface: "#ffffff",
  text: "#182326",
  text2: "#3f4d51",
  muted: "#6f7c80",
  track: "#eeebe4",
  brand: "#08a7c8",
  brandInk: "#067f9c",
  income: "#2ba66a",
  incomeInk: "#1d7a4d",
  incomeSoft: "#e8f6ee",
  expense: "#ef5361",
  expenseInk: "#c93242",
  expenseSoft: "#fdeced",
  goal: "#7651e8",
  goalInk: "#6743d6",
  goalSoft: "#f0ebfd",
};

const DISPLAY = '"Outfit", "Inter", "Segoe UI", sans-serif';
const UI = '"Inter", "Segoe UI", sans-serif';
const BRAND = '"Nunito", "Outfit", "Segoe UI", sans-serif';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Recorta el texto con "…" para que entre en `max` px. */
function fit(ctx, text, max) {
  if (ctx.measureText(text).width <= max) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(s + "…").width > max) s = s.slice(0, -1);
  return s.trimEnd() + "…";
}

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function draw(state, key) {
  const main = state.settings.mainCurrency;
  const m = (v) => formatMoney(v, main, { reveal: true });
  const totals = monthlyTotals(state, key);
  const cats = expensesByCategory(state, key).slice(0, 5);

  try {
    await Promise.all([
      document.fonts.load(`800 60px ${DISPLAY}`),
      document.fonts.load(`600 30px ${UI}`),
      document.fonts.load(`900 40px ${BRAND}`),
    ]);
  } catch (error) {
    /* sin fuentes web: se usan las del sistema */
  }
  const logo = await loadImage("img/logo-header.png");

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.textBaseline = "alphabetic";

  // Fondo y cabecera de marca
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  const header = ctx.createLinearGradient(0, 0, W, 300);
  header.addColorStop(0, "#0aaccb");
  header.addColorStop(0.55, "#0898ba");
  header.addColorStop(1, "#0786aa");
  ctx.fillStyle = header;
  roundRect(ctx, 0, -60, W, 360, 60);
  ctx.fill();

  let x = PAD;
  if (logo) {
    ctx.save();
    roundRect(ctx, PAD, 64, 88, 88, 24);
    ctx.clip();
    ctx.drawImage(logo, PAD, 64, 88, 88);
    ctx.restore();
    x += 112;
  }
  ctx.fillStyle = "#ffffff";
  ctx.font = `900 46px ${BRAND}`;
  ctx.fillText("Neko Finanzas", x, 110);
  ctx.font = `600 28px ${UI}`;
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillText(msg`Resumen de ${formatMonth(key).toLowerCase()}`, x, 150);

  // Tarjeta principal: ahorro del mes
  const cardY = 210;
  ctx.fillStyle = C.surface;
  ctx.shadowColor = "rgba(24,35,38,0.10)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 12;
  roundRect(ctx, PAD, cardY, W - PAD * 2, 250, 44);
  ctx.fill();
  ctx.shadowColor = "transparent";

  const saved = totals.saved;
  ctx.fillStyle = C.text2;
  ctx.font = `700 34px ${DISPLAY}`;
  ctx.fillText(tr(saved >= 0 ? "Este mes ahorraste" : "Este mes gastaste de más"), PAD + 48, cardY + 74);
  ctx.fillStyle = saved >= 0 ? C.incomeInk : C.expenseInk;
  ctx.font = `800 96px ${DISPLAY}`;
  ctx.fillText(fit(ctx, m(Math.abs(saved)), W - PAD * 2 - 96), PAD + 48, cardY + 178);
  if (totals.income > 0) {
    ctx.fillStyle = C.muted;
    ctx.font = `600 28px ${UI}`;
    ctx.fillText(msg`${Math.round(Math.abs(totals.savingsRate))}% de tus ingresos`, PAD + 48, cardY + 222);
  }

  // Tres cifras: ingresos, gastos, metas
  const tiles = [
    { label: "Ingresos", value: totals.income, ink: C.incomeInk, soft: C.incomeSoft },
    { label: "Gastos", value: totals.expense, ink: C.expenseInk, soft: C.expenseSoft },
    { label: "A metas", value: totals.toGoals, ink: C.goalInk, soft: C.goalSoft },
  ];
  const gap = 20;
  const tileW = (W - PAD * 2 - gap * 2) / 3;
  const tileY = cardY + 290;
  tiles.forEach((t, i) => {
    const tx = PAD + i * (tileW + gap);
    ctx.fillStyle = t.soft;
    roundRect(ctx, tx, tileY, tileW, 150, 32);
    ctx.fill();
    ctx.fillStyle = t.ink;
    ctx.font = `700 28px ${DISPLAY}`;
    ctx.fillText(tr(t.label), tx + 28, tileY + 56);
    ctx.fillStyle = C.text;
    ctx.font = `800 40px ${DISPLAY}`;
    ctx.fillText(fit(ctx, m(t.value), tileW - 56), tx + 28, tileY + 112);
  });

  // En qué se fue el dinero (top 5)
  const listY = tileY + 190;
  ctx.fillStyle = C.surface;
  roundRect(ctx, PAD, listY, W - PAD * 2, H - listY - 150, 44);
  ctx.fill();
  ctx.fillStyle = C.text;
  ctx.font = `800 36px ${DISPLAY}`;
  ctx.fillText(tr("¿En qué se fue el dinero?"), PAD + 48, listY + 72);

  if (!cats.length) {
    ctx.fillStyle = C.muted;
    ctx.font = `500 30px ${UI}`;
    ctx.fillText(tr("Sin gastos registrados este mes."), PAD + 48, listY + 140);
  }
  const rowH = 76;
  const innerW = W - PAD * 2 - 96;
  // Columna de montos del ancho del más largo, así los % quedan alineados.
  ctx.font = `700 30px ${DISPLAY}`;
  const amountCol = Math.max(0, ...cats.map((c) => ctx.measureText(m(c.amount)).width));
  const pctRight = PAD + 48 + innerW - amountCol - 28;
  cats.forEach((c, i) => {
    const y = listY + 138 + i * rowH;
    const name = `${c.category?.icon || "•"}  ${c.category?.name || "Sin categoría"}`;
    const amount = m(c.amount);
    const pct = percent(c.amount, totals.expense);
    ctx.font = `700 30px ${DISPLAY}`;
    ctx.fillStyle = C.text;
    ctx.textAlign = "right";
    ctx.fillText(amount, PAD + 48 + innerW, y);
    ctx.textAlign = "left";
    ctx.font = `600 29px ${UI}`;
    ctx.fillStyle = C.text2;
    ctx.fillText(fit(ctx, name, pctRight - PAD - 48 - 90), PAD + 48, y);
    ctx.font = `600 24px ${UI}`;
    ctx.fillStyle = C.muted;
    ctx.textAlign = "right";
    ctx.fillText(`${Math.round(pct)}%`, pctRight, y);
    ctx.textAlign = "left";
    // barra
    ctx.fillStyle = C.track;
    roundRect(ctx, PAD + 48, y + 16, innerW, 12, 6);
    ctx.fill();
    ctx.fillStyle = /^#[0-9a-f]{6}$/i.test(c.category?.color || "") ? c.category.color : C.expense;
    roundRect(ctx, PAD + 48, y + 16, Math.max(12, (innerW * Math.min(100, pct)) / 100), 12, 6);
    ctx.fill();
  });

  // Pie
  ctx.fillStyle = C.muted;
  ctx.font = `600 26px ${UI}`;
  ctx.textAlign = "center";
  ctx.fillText(tr("Hecho con Neko Finanzas · nekotools.site"), W / 2, H - 78);
  ctx.textAlign = "left";

  return canvas;
}

/** Genera la imagen y la comparte (teléfono) o la descarga (computadora). */
export async function shareMonthSummary(state, key) {
  const canvas = await draw(state, key);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("No se pudo generar la imagen");
  const filename = `neko-finanzas-${key}.png`;
  const file = new File([blob], filename, { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: msg`Resumen de ${formatMonth(key)}` });
      return "shared";
    } catch (error) {
      if (error?.name === "AbortError") return "cancelled";
      // Cualquier otra falla: se descarga.
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return "downloaded";
}

export { draw as drawMonthSummary };
