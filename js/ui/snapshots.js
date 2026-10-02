// Copias automáticas: lista y restauración (Configuración → Tus datos).

import { html, setHTML } from "./dom.js";
import { icon } from "./icons.js";
import { openSheet, confirmDialog } from "./sheet.js";
import { toast } from "./toast.js";
import { storageMode, snapshotsSize } from "../core/storage.js";
import * as store from "../core/store.js";

function when(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Fecha desconocida";
  return d.toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).replace(".", "");
}

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

export function openSnapshots() {
  openSheet({
    title: "Copias automáticas",
    body: html`<p class="sheet-text">La app guarda sola una copia por día y otra antes de importar, cargar el ejemplo o empezar de cero. Se conservan las últimas 7, solo en este dispositivo.</p>
      <div class="snapshot-list" data-snapshots><p class="muted-text">Cargando…</p></div>`,
    async onMount(panel, close) {
      const box = panel.querySelector("[data-snapshots]");
      if (storageMode() !== "idb") {
        setHTML(box, html`<p class="notice notice-warn">${icon("alert", 16)} Este navegador no permite guardar copias automáticas. Exportá un backup de vez en cuando.</p>`);
        return;
      }
      const list = await store.listSnapshots();
      const bytes = await snapshotsSize();
      const size = bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
      if (!list.length) {
        setHTML(box, html`<p class="muted-text">Todavía no hay copias. La primera se hace sola cuando tengas datos propios cargados.</p>`);
        return;
      }
      setHTML(
        box,
        html`<div class="rows">
          ${list.map(
            (s) => html`<div class="row snapshot-row">
              <span class="mini-icon">${icon("shield", 18)}</span>
              <div class="row-main">
                <span class="row-title">${when(s.at)}</span>
                <span class="row-meta">${s.reason} · ${plural(s.counts.transactions || 0, "movimiento", "movimientos")}, ${plural(s.counts.bills || 0, "factura", "facturas")}, ${plural(s.counts.goals || 0, "meta", "metas")}</span>
              </div>
              <button type="button" class="btn btn-sm btn-soft" data-restore="${s.id}">Restaurar</button>
            </div>`
          )}
        </div>
        <p class="fine-print">${icon("info", 14)} Se guardan comprimidas: las ${list.length} juntas ocupan ${size}. Si no cambió nada, no se guarda una copia repetida.</p>`
      );
      box.addEventListener("click", async (event) => {
        const button = event.target.closest("[data-restore]");
        if (!button) return;
        const ok = await confirmDialog({
          title: "¿Volver a esta copia?",
          text: "Tus datos actuales se reemplazan por los de la copia. Antes se guarda una copia de lo que tenés ahora, así podés volver.",
          confirmLabel: "Restaurar",
        });
        if (!ok) return;
        const backup = store.snapshot();
        try {
          await store.restoreSnapshot(button.dataset.restore);
          close();
          toast("Listo, volviste a esa copia", { actionLabel: "Deshacer", onAction: () => store.restore(backup) });
        } catch (error) {
          toast(error.message || "No se pudo restaurar la copia", { type: "error" });
        }
      });
    },
  });
}
