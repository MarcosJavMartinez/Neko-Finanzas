// Tutorial "¿Cómo funciona?": 4 pasos cortos. Aparece la primera vez que se
// abre la app (sin datos) y se puede volver a ver desde Más y Configuración.

import { html } from "./dom.js";
import { icon } from "./icons.js";
import { openSheet } from "./sheet.js";
import { toast } from "./toast.js";
import { openSetupWizard } from "./forms/setupForm.js";
import { markOnboardingSeen, markSetupOffered } from "../core/prefs.js";
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
  // Último paso: la primera vez (con los datos de ejemplo de fondo) se
  // pregunta si empezás con lo tuyo o mirás el ejemplo; con la app vacía, lo
  // mismo pero al revés; con datos propios, nada que reemplazar.
  const extra = state.settings.isDemo
    ? { what: "close", label: "Ver el ejemplo", primary: "mine", done: "Empezar con lo mío", question: true }
    : store.isEmptyState(state)
      ? { what: "demo", label: "Ver un ejemplo", primary: "mine", done: "Empezar", question: true }
      : { primary: "close", done: "Listo" };
  let index = 0;

  openSheet({
    title: "Cómo funciona",
    body: html`<div class="ob">
      ${STEPS.map(
        (step, i) => html`<section class="ob-step" data-ob-step="${i}" ${i ? "hidden" : ""}>
          <div class="ob-art ${step.tone ? `ob-art-${step.tone}` : ""}">${step.art || icon(step.icon, 40)}</div>
          <h3 class="ob-title">${step.title}</h3>
          <p class="ob-text">${step.text}</p>
          ${i === STEPS.length - 1 && extra.question ? html`<p class="ob-question">¿Empezás con lo tuyo o preferís mirar un ejemplo primero?</p>` : ""}
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
        let what = button.dataset.ob;
        if (what === "back") index = Math.max(0, index - 1);
        else if (what === "next" && index < STEPS.length - 1) index++;
        else {
          if (what === "next") what = extra.primary;
          if (what === "demo") {
            const backup = store.snapshot();
            store.loadDemo();
            toast("Datos de ejemplo cargados", { type: "info", actionLabel: "Deshacer", onAction: () => store.restore(backup) });
          }
          close();
          if (what === "mine") {
            // Los datos de ejemplo se van y arranca el asistente de inicio.
            if (store.getState().settings.isDemo) store.startFresh();
            openSetupWizard();
          }
          return;
        }
        show();
      });
      show();
    },
    onClose() {
      markOnboardingSeen();
      markSetupOffered();
    },
  });
}
