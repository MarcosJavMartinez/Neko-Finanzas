// Preguntas frecuentes, con buscador (en el header, como Transacciones, así
// el campo no pierde el foco al redibujar). Busca en la pregunta y en la
// respuesta ya traducidas, sin importar tildes ni mayúsculas.

import { msg, tr } from "../core/i18n.js";
import { html } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { FAQ } from "../data/faq.js";
import { openTransfer } from "../ui/transfer.js";
import { openSnapshots } from "../ui/snapshots.js";

const view = { query: "" };

/** "Préstamo" y "prestamo" son lo mismo para buscar. */
const plain = (text) =>
  String(text)
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

function matches(item, words) {
  if (!words.length) return true;
  const text = plain(`${tr(item.q)} ${tr(item.a)}`);
  return words.every((w) => text.includes(w));
}

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
    const groups = FAQ.map((g) => ({ ...g, items: g.items.filter((item) => matches(item, words)) })).filter((g) => g.items.length);
    const found = groups.reduce((s, g) => s + g.items.length, 0);
    // Buscando, las respuestas se muestran abiertas (si no son demasiadas).
    const open = words.length > 0 && found <= 4;
    return html`
      ${words.length
        ? html`<p class="faq-count" role="status">${found === 1 ? "1 pregunta encontrada" : found ? msg`${found} preguntas encontradas` : ""}</p>`
        : html`<p class="fine-print faq-intro">${icon("info", 14)} Toca una pregunta para ver la respuesta, o búscala arriba.</p>`}
      ${found
        ? groups.map(
            (g) => html`<section class="card faq-group reveal">
              <h2 class="section-title">${g.group}</h2>
              ${g.items.map((item) => faqItem(item, open))}
            </section>`
          )
        : html`<section class="card faq-empty">
            <p class="sheet-text">${msg`No encontramos nada con «${view.query.trim()}».`}</p>
            <p class="fine-print">Prueba con otra palabra, por ejemplo «deuda», «cuotas», «backup» o «dólares».</p>
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
    "transfer-data"() {
      openTransfer();
    },
    "open-snapshots"() {
      openSnapshots();
    },
  },
};
