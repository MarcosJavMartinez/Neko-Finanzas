// Tutorial "¿Cómo funciona?": 4 pasos cortos. Aparece la primera vez que se
// abre la app (sin datos) y se puede volver a ver desde Más y Configuración.

import { html } from "./dom.js";
import { icon } from "./icons.js";
import { openSheet } from "./sheet.js";
import { toast } from "./toast.js";
import { markOnboardingSeen } from "../core/prefs.js";
import * as store from "../core/store.js";

const STEPS = [
  {
    art: html`<img class="ob-art-img" src="img/hero-wallet.png" alt="" width="132" height="120" />`,
    title: "Tu plata, clara",
    text: "Neko Finanzas responde cuatro preguntas: ¿cuánto tengo?, ¿cuánto tengo que reservar?, ¿cuánto puedo gastar? y ¿cuánto estoy ahorrando?",
  },
  {
    icon: "wallet",
    tone: "brand",
    title: "Tu saldo disponible",
    text: "Es lo que podés gastar tranquilo: tu dinero total, menos lo que reservás para las facturas que vienen y lo que apartaste para tus metas.",
  },
  {
    icon: "plus",
    tone: "action",
    title: "Cargá en segundos",
    text: "Tocá «Agregar transacción» para anotar un gasto o un ingreso. Sumá tus facturas con su vencimiento y te decimos cuánto reservar.",
  },
  {
    icon: "shield",
    tone: "goal",
    title: "Tus datos son tuyos",
    text: "Todo queda en este dispositivo: sin cuentas ni publicidad. Hacé un backup de vez en cuando desde Configuración.",
  },
];

export function openOnboarding() {
  const state = store.getState();
  // Último paso: con los datos de ejemplo (primera vez) se ofrece empezar
  // de cero; con la app vacía, ver un ejemplo; con datos propios, nada.
  // Solo se ofrece reemplazar datos cuando no hay nada tuyo en juego.
  const extra = store.isPristineDemo(state)
    ? { what: "fresh", label: "Empezar de cero", done: "Explorar ejemplo" }
    : store.isEmptyState(state)
      ? { what: "demo", label: "Ver un ejemplo", done: "Empezar" }
      : { done: "Listo" };
  let index = 0;

  openSheet({
    title: "Cómo funciona",
    body: html`<div class="ob">
      ${STEPS.map(
        (step, i) => html`<section class="ob-step" data-ob-step="${i}" ${i ? "hidden" : ""}>
          <div class="ob-art ${step.tone ? `ob-art-${step.tone}` : ""}">${step.art || icon(step.icon, 40)}</div>
          <h3 class="ob-title">${step.title}</h3>
          <p class="ob-text">${step.text}</p>
        </section>`
      )}
      <div class="ob-dots" aria-hidden="true">${STEPS.map((_, i) => html`<span class="ob-dot" data-ob-dot="${i}"></span>`)}</div>
      <div class="form-actions ob-actions">
        <button type="button" class="btn btn-ghost" data-ob="back">Atrás</button>
        ${extra.what ? html`<button type="button" class="btn btn-ghost" data-ob="${extra.what}" hidden>${extra.label}</button>` : ""}
        <button type="button" class="btn btn-primary" data-ob="next">Siguiente</button>
      </div>
    </div>`,
    onMount(panel, close) {
      const $ = (sel) => panel.querySelector(sel);
      const show = () => {
        const last = index === STEPS.length - 1;
        panel.querySelectorAll("[data-ob-step]").forEach((el) => (el.hidden = Number(el.dataset.obStep) !== index));
        panel.querySelectorAll("[data-ob-dot]").forEach((el) => el.classList.toggle("is-active", Number(el.dataset.obDot) === index));
        // En el último paso con dos opciones, "Atrás" deja lugar a esas dos.
        $("[data-ob=back]").hidden = index === 0 || (last && !!extra.what);
        if (extra.what) $(`[data-ob=${extra.what}]`).hidden = !last;
        $("[data-ob=next]").textContent = last ? extra.done : "Siguiente";
      };
      panel.addEventListener("click", (event) => {
        const button = event.target.closest("[data-ob]");
        if (!button) return;
        const what = button.dataset.ob;
        if (what === "back") index = Math.max(0, index - 1);
        else if (what === "next" && index < STEPS.length - 1) index++;
        else {
          if (what === "demo" || what === "fresh") {
            const backup = store.snapshot();
            if (what === "demo") store.loadDemo();
            else store.startFresh();
            toast(what === "demo" ? "Datos de ejemplo cargados" : "¡Listo! Tu app está vacía y lista para usar", {
              type: "info",
              actionLabel: "Deshacer",
              onAction: () => store.restore(backup),
            });
          }
          close();
          return;
        }
        show();
      });
      show();
    },
    onClose: markOnboardingSeen,
  });
}
