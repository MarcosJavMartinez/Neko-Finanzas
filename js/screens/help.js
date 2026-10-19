// Preguntas frecuentes, con buscador (en el header, como Transacciones, así
// el campo no pierde el foco al redibujar). Busca en la pregunta y en la
// respuesta ya traducidas, sin importar tildes ni mayúsculas.

import { getLanguage, msg, tr } from "../core/i18n.js";
import { html } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { FAQ } from "../data/faq.js";
import { FAQ_TAGS } from "../data/faqTags.js";
import { openTransfer } from "../ui/transfer.js";
import { openSnapshots } from "../ui/snapshots.js";

const view = { query: "" };

/** "Préstamo" y "prestamo" son lo mismo para buscar; los signos no cuentan. */
const plain = (text) =>
  String(text)
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[¿?¡!.,;:()«»“”"'…→←·-]+/g, " ");

const SPACED = /^[a-zа-яё0-9]+$/;

/**
 * Raíz de una palabra para encontrar sus variantes ("deudas" → "deuda",
 * "debts" → "debt", "dólares" → "dolar"). Solo en alfabetos con espacios
 * entre palabras; en japonés o árabe se busca la palabra tal cual.
 */
function stem(w) {
  if (!SPACED.test(w)) return w;
  let s = w.length > 4 && w.endsWith("es") ? w.slice(0, -2) : w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w;
  if (s.length > 6) s = s.slice(0, Math.max(5, s.length - 2));
  return s;
}

/** Está en el texto: al comienzo de una palabra ("tip" no encuentra "multiple"). */
const has = (text, s) => (SPACED.test(s) ? ` ${text}`.includes(` ${s}`) : text.includes(s));

/** Palabras clave del idioma de la app: en español las españolas, en inglés las inglesas, en el resto las dos. */
function tagsOf(item) {
  const [es = "", en = ""] = FAQ_TAGS[item.q] || [];
  const lang = getLanguage() || "es";
  return lang === "es" ? es : lang.startsWith("en") ? en : `${es} ${en}`;
}

/** Puntaje de una pregunta: más si la palabra está en la pregunta, después en las palabras clave, después en la respuesta. */
function score(item, words) {
  const q = plain(tr(item.q)).replace(/\s+/g, " ");
  const tags = plain(tagsOf(item));
  const a = plain(tr(item.a)).replace(/\s+/g, " ");
  let points = 0;
  let found = 0;
  for (const w of words) {
    const s = stem(w);
    const p = has(q, s) ? 3 : has(tags, s) ? 2 : has(a, s) ? 1 : 0;
    if (p) found++;
    points += p;
  }
  return { found, points };
}

/** Lo que más se busca: un toque y listo. */
const QUICK = ["Negativo", "Deudas", "Cuotas", "Dólares", "Tarjeta", "Propinas", "Backup", "Otro celular"];
const quickChips = () => html`<div class="faq-quick">
  <span class="faq-quick-label">Búsquedas frecuentes:</span>
  ${QUICK.map((w) => html`<button type="button" class="chip chip-action" data-action="faq-pick" data-q="${tr(w)}">${w}</button>`)}
</div>`;

function faqItem(item, open) {
  const go = item.href
    ? html`<a class="btn btn-soft btn-sm faq-go" href="${item.href}">${icon("chevronRight", 16)} Ir ahí</a>`
    : item.action
      ? html`<button type="button" class="btn btn-soft btn-sm faq-go" data-action="${item.action}">${icon("chevronRight", 16)} Abrir</button>`
      : "";
  return html`<details class="faq-item" ${open ? "open" : ""}>
    <summary class="faq-q">${item.q}${icon("chevronRight", 16, "faq-chevron")}</summary>
    <div class="faq-a">
      <p>${item.a}</p>
      ${go}
    </div>
  </details>`;
}

export default {
  id: "ayuda",
  tab: "mas",
  title: "Ayuda",
  back: "#/mas",
  search: () => ({ value: view.query, placeholder: "Buscar una pregunta...", input: "faq-search" }),
  render() {
    const words = plain(view.query).split(/\s+/).filter((w) => w.length > 1);
    // Sin buscar: todo, por grupos. Buscando: una sola lista, lo más parecido primero
    // (si ninguna tiene todas las palabras, las que tienen más).
    const ranked = words.length
      ? FAQ.flatMap((g) => g.items.map((item) => ({ item, ...score(item, words) })))
          .filter((r) => r.found > 0)
          .sort((a, b) => b.found - a.found || b.points - a.points)
      : [];
    const best = ranked.length ? ranked[0].found : 0;
    const results = ranked.filter((r) => r.found === best || r.points >= 3).slice(0, 12);
    const found = words.length ? results.length : FAQ.reduce((s, g) => s + g.items.length, 0);
    return html`
      ${words.length
        ? html`<p class="faq-count" role="status">${found === 1 ? "1 pregunta encontrada" : found ? msg`${found} preguntas encontradas` : ""}</p>`
        : html`<p class="fine-print faq-intro">${icon("info", 14)} Toca una pregunta para ver la respuesta, o búscala arriba.</p>${quickChips()}`}
      ${words.length && found
        ? html`<section class="card faq-group reveal">
            <h2 class="section-title">Lo que más se parece</h2>
            ${results.map((r, i) => faqItem(r.item, i === 0 || (i === 1 && r.points >= results[0].points)))}
          </section>`
        : !words.length
        ? FAQ.map(
            (g) => html`<section class="card faq-group reveal">
              <h2 class="section-title">${g.group}</h2>
              ${g.items.map((item) => faqItem(item, false))}
            </section>`
          )
        : html`<section class="card faq-empty">
            <p class="sheet-text">${msg`No encontramos nada con «${view.query.trim()}».`}</p>
            <p class="fine-print">Prueba con otra palabra o toca una de estas:</p>
            ${quickChips()}
          </section>`}
    `;
  },
  inputs: {
    "faq-search"(el) {
      view.query = el.value;
      return true;
    },
  },
  actions: {
    "faq-pick"(el) {
      view.query = el.dataset.q || "";
      return true;
    },
    "transfer-data"() {
      openTransfer();
    },
    "open-snapshots"() {
      openSnapshots();
    },
  },
};
