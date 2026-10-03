// Configuración: una pantalla principal con accesos a cuatro secciones
// (cálculo, apariencia, este dispositivo y tus datos), cada una en su
// propia pantalla para que no quede una lista interminable.

import { html } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { toast } from "../ui/toast.js";
import { confirmDialog, whenHistorySettled } from "../ui/sheet.js";
import { segmented } from "../ui/components.js";
import { amountToInput, parseAmount } from "../core/money.js";
import { MAX_AMOUNT } from "../core/sanitize.js";
import * as store from "../core/store.js";
import { openSnapshots } from "../ui/snapshots.js";
import { canPickFile, backupFileKnown } from "../ui/backupFile.js";
import { remindersSupported, reminderPermission, enableReminders, disableReminders, syncPlan, fireDue, testReminder } from "../ui/reminders.js";
import { remindersEnabled, getReminderDays, setReminderDays } from "../core/prefs.js";

/** Avisos de vencimientos: interruptor, cuántos días antes y un aviso de prueba. */
function remindersBlock() {
  if (!remindersSupported()) {
    return html`<div class="setting">
      <span class="setting-label">${icon("calendar", 16)} Avisos de vencimientos</span>
      <span class="field-hint">${installPlatform().startsWith("ios") ? "En iPhone, instalá la app en la pantalla de inicio para poder activar los avisos." : "Este navegador no permite mostrar avisos."} Mientras tanto, podés llevar los vencimientos a tu calendario desde Facturas.</span>
    </div>`;
  }
  const blocked = reminderPermission() === "denied";
  const on = remindersEnabled() && reminderPermission() === "granted";
  return html`<div class="setting">
    <label class="toggle-field">
      <span><span class="toggle-label">Avisos de vencimientos</span><span class="field-hint">Una notificación cuando se acerca el vencimiento de una factura, de la tarjeta o de un préstamo.</span></span>
      <input type="checkbox" class="switch" ${on ? "checked" : ""} data-change="set-reminders" />
    </label>
    ${blocked ? html`<p class="notice notice-warn">${icon("alert", 16)} Los avisos están bloqueados para esta app en el navegador. Habilitalos desde el candado de la barra de direcciones (o en los ajustes del sitio) y volvé a prenderlos.</p>` : ""}
    ${on
      ? html`<span class="setting-label">Avisarme</span>
          ${segmented(
            "reminderDays",
            [
              { value: "0", label: "Ese día" },
              { value: "1", label: "1 día antes" },
              { value: "3", label: "3 días antes" },
            ],
            String(getReminderDays()),
            { action: "set-reminder-days" }
          )}
          <span class="field-hint">Los avisos salen cuando abrís la app. En Android con la app instalada también pueden llegar con la app cerrada (lo decide el navegador). Si tenés los montos ocultos, el aviso no muestra el monto.</span>
          <button type="button" class="btn btn-soft btn-sm" data-action="test-reminder">${icon("check", 16)} Probar un aviso</button>`
      : ""}
  </div>`;
}
import {
  getThemePref,
  canVibrate,
  vibrationEnabled,
  setVibration,
  getBackupEvery,
  setBackupEvery,
  getLastBackup,
  setAmountsHidden,
  markBackup,
} from "../core/prefs.js";
import { isMasked, setMasked } from "../core/money.js";
import { setThemePreference } from "../ui/theme.js";
import {
  PALETTES,
  getPalette,
  getCustomColor,
  setPalette,
  setCustomColor,
  getBackground,
  getBgColor,
  setBgColor,
  setBackground,
  setCustomImage,
  removeCustomImage,
} from "../ui/background.js";
import { canPromptInstall, isInstalled, installPlatform, INSTALL_STEPS, INSTALL_MESSAGES } from "../ui/install.js";

const DAY = 86400000;

function lastBackupText() {
  const last = getLastBackup();
  if (!last) return "Todavía no hiciste ningún backup desde este dispositivo.";
  const days = Math.floor((Date.now() - last) / DAY);
  return `Último backup: ${days <= 0 ? "hoy" : days === 1 ? "ayer" : `hace ${days} días`}.`;
}

function installBlock() {
  if (isInstalled()) {
    return html`<p class="install-done">${icon("check", 18)} Ya la estás usando como app instalada.</p>`;
  }
  if (canPromptInstall()) {
    return html`<span class="field-hint">Se instala como una app más, sin pasar por ninguna tienda, y funciona sin conexión.</span>
      <button type="button" class="btn btn-primary" data-action="install-app">${icon("download", 18)} Instalar Neko Finanzas</button>`;
  }
  const platform = installPlatform();
  const steps = INSTALL_STEPS[platform];
  const iosWarning = platform.startsWith("ios")
    ? html`<p class="notice notice-warn">${icon("alert", 16)} En iPhone, si no abrís la app en 7 días, Safari puede borrar tus datos. Instalada, eso no pasa.</p>`
    : "";
  return steps
    ? html`${iosWarning}<span class="field-hint">Queda en tu pantalla de inicio como una app más y funciona sin conexión:</span>
        <ol class="install-steps">${steps.map((step) => html`<li>${step}</li>`)}</ol>`
    : html`${iosWarning}<span class="field-hint">${INSTALL_MESSAGES[platform]}</span>`;
}

// Las cuatro secciones comparten los mismos handlers.
const handlers = {
  actions: {
    async "remove-bg-image"() {
      await removeCustomImage();
      toast("Imagen quitada", { type: "info" });
      window.dispatchEvent(new Event("neko:rerender"));
    },
    "reset-bg-color"() {
      setBgColor(null);
      return true;
    },
    async "load-demo"() {
      const ok = await confirmDialog({ title: "¿Cargar datos de ejemplo?", text: "Reemplaza lo que tengas ahora por datos ficticios. Antes se guarda una copia automática de lo tuyo.", confirmLabel: "Cargar ejemplo" });
      if (!ok) return;
      store.loadDemo();
      toast("Datos de ejemplo cargados");
      whenHistorySettled(() => (location.hash = "#/inicio"));
    },
    async "test-reminder"() {
      toast((await testReminder()) ? "Aviso enviado: fijate en las notificaciones" : "No se pudo mostrar el aviso", { type: "info" });
    },
    "open-snapshots"() {
      openSnapshots();
    },
    async "reset-all"() {
      const ok = await confirmDialog({ title: "¿Borrar todo?", text: "Se eliminan todos tus datos y las copias automáticas de este dispositivo. No se puede deshacer.", confirmLabel: "Borrar todo", danger: true });
      if (!ok) return;
      await store.resetEverything();
      toast("Listo, la app quedó vacía", { type: "info" });
      whenHistorySettled(() => (location.hash = "#/inicio"));
    },
  },
  inputs: {
    // Mientras se arrastra en el selector de color se ve el cambio en vivo.
    "preview-custom-color"(el) {
      setCustomColor(el.value);
    },
  },
  changes: {
    "set-palette"(el) {
      setPalette(el.value);
      return true;
    },
    "set-custom-color"(el) {
      setCustomColor(el.value);
      return true;
    },
    async "set-background"(el) {
      await setBackground(el.value);
      window.dispatchEvent(new Event("neko:rerender"));
    },
    "set-bg-color"(el) {
      setBgColor(el.value);
      return true;
    },
    async "set-bg-image"(el) {
      const file = el.files?.[0];
      el.value = "";
      if (!file) return;
      try {
        await setCustomImage(file);
        toast("Listo, tu imagen quedó de fondo");
      } catch (error) {
        toast(error.message || "No se pudo usar esa imagen", { type: "error" });
      }
      window.dispatchEvent(new Event("neko:rerender"));
    },
    "set-theme"(el) {
      setThemePreference(el.value);
      return true;
    },
    "set-hide-amounts"(el) {
      setAmountsHidden(el.checked);
      setMasked(el.checked);
      return true;
    },
    async "set-reminders"(el) {
      if (el.checked) {
        const result = await enableReminders(store.getState());
        if (result === "granted") toast("Avisos de vencimientos activados");
        else toast(result === "denied" ? "El navegador no dio permiso para mostrar avisos" : "Este navegador no permite avisos", { type: "error" });
      } else {
        await disableReminders(store.getState());
        toast("Avisos de vencimientos apagados", { type: "info" });
      }
      window.dispatchEvent(new Event("neko:rerender"));
    },
    async "set-reminder-days"(el) {
      setReminderDays(el.value);
      await syncPlan(store.getState());
      await fireDue();
      toast("Avisos actualizados", { type: "info" });
    },
    "set-vibration"(el) {
      setVibration(el.checked);
      if (el.checked) navigator.vibrate?.(15);
    },
    "set-backup-every"(el) {
      setBackupEvery(el.value);
      toast(el.value === "never" ? "Listo, no te vamos a recordar" : "Recordatorio de backup actualizado", { type: "info" });
    },
    "set-bill-cushion"(el) {
      store.setBillCushion(el.checked);
      toast(el.checked ? "Listo: lo que sobre de tus facturas queda guardado para las próximas" : "Colchón de facturas desactivado", { type: "info" });
    },
    "set-horizon"(el) {
      store.updateSettings({ reserveHorizon: el.value });
      toast("Reserva de facturas actualizada");
    },
    "set-reference"(el) {
      const value = el.value.trim() ? parseAmount(el.value) : 0;
      if (!Number.isFinite(value) || value < 0 || value > MAX_AMOUNT) return toast("Ese monto no es válido", { type: "error" });
      store.updateSettings({ budgetReference: Math.round(value * 100) / 100 });
      toast("Ingreso de referencia guardado");
    },
    "import-data"(el) {
      const file = el.files?.[0];
      el.value = "";
      if (!file) return;
      // Un backup real pesa unos pocos KB; un archivo enorme no es un backup.
      if (file.size > 5 * 1024 * 1024) {
        toast("El archivo es demasiado grande para ser un backup de Neko Finanzas.", { type: "error" });
        return;
      }
      const reader = new FileReader();
      reader.onload = async () => {
        const ok = await confirmDialog({ title: "¿Importar este backup?", text: "Reemplaza todos los datos actuales por los del archivo.", confirmLabel: "Importar" });
        if (!ok) return;
        try {
          const result = store.importJSON(String(reader.result));
          // Quien importa tiene ese archivo en la mano: cuenta como backup reciente.
          markBackup();
          toast(
            result.skipped > 0
              ? `Backup importado. Se omitieron ${result.skipped} movimiento${result.skipped === 1 ? "" : "s"} con datos inválidos.`
              : "Backup importado",
            { type: result.skipped > 0 ? "info" : "success" }
          );
          whenHistorySettled(() => (location.hash = "#/inicio"));
        } catch (error) {
          toast(error.message || "No se pudo leer el archivo", { type: "error" });
        }
      };
      reader.readAsText(file);
    },
  }
};

const sub = (id, title, render) => ({ id, tab: "mas", title, back: "#/ajustes", render, ...handlers });

export const settingsCalc = sub("ajustes-calculo", "Cálculo del disponible", (state) => {
  const s = state.settings;
  return html`
      <section class="card reveal">
        <h2 class="section-title">Cómo se calcula tu disponible</h2>
        <div class="formula">
          <span class="formula-row"><span>Dinero total</span><span class="muted-text">la suma de tus cuentas</span></span>
          <span class="formula-row"><span>− A reservar</span><span class="muted-text">facturas pendientes</span></span>
          <span class="formula-row"><span>− En metas</span><span class="muted-text">lo que apartaste</span></span>
          <span class="formula-row formula-total"><span>= Disponible</span></span>
        </div>

        <div class="setting">
          <span class="setting-label">Reservar facturas que vencen…</span>
          ${segmented("horizon", [{ value: "30d", label: "Próximos 30 días" }, { value: "month", label: "Hasta fin de mes" }], s.reserveHorizon, { action: "set-horizon" })}
        </div>

        <div class="setting">
          <span class="setting-label">Saldos iniciales</span>
          <span class="field-hint">Cada cuenta tiene el suyo: lo que tenía antes de que empezaras a cargar movimientos.</span>
          <a class="btn btn-soft btn-sm" href="#/cuentas">${icon("wallet", 16)} Ir a Cuentas</a>
        </div>

        <div class="setting">
          <label class="toggle-field">
            <span><span class="toggle-label">Guardar lo que sobra de las facturas</span><span class="field-hint">Si una factura viene por menos de lo esperado, la diferencia queda reservada para las próximas (y cubre las que vengan por más), en vez de pasar a tu disponible.</span></span>
            <input type="checkbox" class="switch" ${s.billCushion ? "checked" : ""} data-change="set-bill-cushion" />
          </label>
        </div>

        <label class="setting">
          <span class="setting-label">Ingreso de referencia <span class="optional">(opcional)</span></span>
          <span class="field-hint">Se usa para los presupuestos en % mientras el mes no tenga ingresos cargados.</span>
          <span class="amount-input">
            <span class="amount-currency amount-currency-static">${s.mainCurrency}</span>
            <input type="text" inputmode="decimal" value="${s.budgetReference ? amountToInput(s.budgetReference) : ""}" placeholder="0" data-change="set-reference" aria-label="Ingreso de referencia" />
          </span>
        </label>
      </section>
  `;
});

export const settingsLook = sub("ajustes-apariencia", "Apariencia", () => {
  const palette = getPalette();
  const bg = getBackground();
  const bgColor = getBgColor();
  return html`
      <section class="card reveal">
        <h2 class="section-title">Apariencia</h2>
        <p class="section-sub">Como en Neko Lista: elegí tema, color y fondo. Los colores de ingresos, gastos, facturas y metas no cambian, así siempre significan lo mismo.</p>

        <div class="setting">
          <span class="setting-label">Tema</span>
          ${segmented(
            "theme",
            [
              { value: "auto", label: "Auto", icon: "auto" },
              { value: "light", label: "Claro", icon: "sun" },
              { value: "dark", label: "Oscuro", icon: "moon" },
            ],
            getThemePref(),
            { action: "set-theme" }
          )}
          <span class="field-hint">Auto sigue el modo claro u oscuro de tu dispositivo.</span>
        </div>

        <div class="setting">
          <span class="setting-label">Color principal</span>
          <div class="palette-row" role="radiogroup" aria-label="Color principal">
            ${PALETTES.map(
              (p) => html`<label class="palette-swatch" style="--c:${p.color}" title="${p.label}">
                <input type="radio" name="palette" value="${p.id}" ${palette === p.id ? "checked" : ""} data-change="set-palette" aria-label="${p.label}" />
              </label>`
            )}
            <label class="palette-swatch palette-swatch-custom ${palette === "custom" ? "is-checked" : ""}" title="Elegí tu color" ${palette === "custom" ? html`style="--c:${getCustomColor()}"` : ""}>
              <input type="color" value="${getCustomColor()}" data-input="preview-custom-color" data-change="set-custom-color" aria-label="Elegí tu propio color" />
            </label>
          </div>
          <span class="field-hint">Cambia el color de la barra, los botones y lo seleccionado.</span>
        </div>

        <div class="setting">
          <span class="setting-label">Fondo</span>
          <div class="bg-options" role="radiogroup" aria-label="Fondo">
            <label class="bg-option"><input type="radio" name="bg" value="pattern" ${bg === "pattern" ? "checked" : ""} data-change="set-background" /><span>${icon("grid", 16)} Patrón</span></label>
            <label class="bg-option"><input type="radio" name="bg" value="none" ${bg === "none" && !bgColor ? "checked" : ""} data-change="set-background" /><span>${icon("close", 16)} Sin imagen</span></label>
            <label class="bg-option"><input type="file" accept="image/*" data-change="set-bg-image" aria-label="Subir una imagen de fondo" /><span class="${bg === "custom" ? "is-checked" : ""}">${icon("upload", 16)} Tu imagen</span></label>
          </div>
          ${bg === "custom" ? html`<button type="button" class="btn btn-ghost btn-sm" data-action="remove-bg-image">${icon("trash", 16)} Quitar mi imagen</button>` : ""}
          <div class="bg-color-row">
            <label class="bg-color-pick">
              <input type="color" value="${bgColor || (document.documentElement.dataset.theme === "dark" ? "#101d1a" : "#f5f3ee")}" data-change="set-bg-color" aria-label="Color de fondo" />
              <span>Color de fondo${bgColor ? html`: <strong>${bgColor}</strong>` : ""}</span>
            </label>
            ${bgColor ? html`<button type="button" class="btn btn-ghost btn-sm" data-action="reset-bg-color">Restablecer</button>` : ""}
          </div>
          <span class="field-hint">Tu imagen queda solo en este dispositivo. Elegir un color de fondo saca la imagen, porque la taparía.</span>
        </div>
      </section>
  `;
});

export const settingsDevice = sub("ajustes-dispositivo", "En este dispositivo", () => html`
      <section class="card reveal">
        <h2 class="section-title">En este dispositivo</h2>
        <p class="section-sub">Se guardan en este celular o navegador, no en tus backups.</p>

        ${canVibrate()
          ? html`<div class="setting">
              <label class="toggle-field">
                <span><span class="toggle-label">Vibración</span><span class="field-hint">Una vibración cortita al guardar un movimiento o pagar una factura.</span></span>
                <input type="checkbox" class="switch" ${vibrationEnabled() ? "checked" : ""} data-change="set-vibration" />
              </label>
            </div>`
          : ""}

        ${remindersBlock()}

        <div class="setting">
          <label class="toggle-field">
            <span><span class="toggle-label">Ocultar montos</span><span class="field-hint">Muestra $ ••••• en lugar de los números, para abrir la app en público. También con el ojito del inicio.</span></span>
            <input type="checkbox" class="switch" ${isMasked() ? "checked" : ""} data-change="set-hide-amounts" />
          </label>
        </div>

        <div class="setting">
          <span class="setting-label">${icon("phone", 16)} Instalar la app</span>
          ${installBlock()}
        </div>
      </section>
`);

export const settingsData = sub("ajustes-datos", "Tus datos", () => html`
      <section class="card reveal">
        <h2 class="section-title">Tus datos</h2>
        <p class="backup-status">${icon("shield", 16)} ${lastBackupText()}</p>
        <div class="setting">
          <span class="setting-label">Recordarme hacer un backup</span>
          ${segmented(
            "backupEvery",
            [
              { value: "week", label: "Semanal" },
              { value: "month", label: "Mensual" },
              { value: "never", label: "Nunca" },
            ],
            getBackupEvery(),
            { action: "set-backup-every" }
          )}
          <span class="field-hint">Te avisamos en el inicio cuando pase ese tiempo sin backup.</span>
        </div>
        <div class="settings-actions">
          <button type="button" class="settings-action" data-action="export-data">${icon("download", 20)}<span><strong>${backupFileKnown() ? "Actualizar backup" : "Exportar backup"}</strong><span>${backupFileKnown() ? `Reemplaza “${backupFileKnown()}” con tus datos de ahora` : canPickFile() ? "Elegís dónde guardarlo una vez; los próximos reemplazan ese mismo archivo" : "Un archivo .json con todo. Guardalo siempre con el mismo nombre para reemplazar el anterior"}</span></span></button>
          ${backupFileKnown() ? html`<button type="button" class="settings-action" data-action="export-data" data-choose="1">${icon("edit", 20)}<span><strong>Guardar el backup en otro archivo</strong><span>Elegí otro lugar o nombre; pasa a ser el que se reemplaza</span></span></button>` : ""}
          <button type="button" class="settings-action" data-action="export-csv">${icon("table", 20)}<span><strong>Exportar a planilla</strong><span>Tus movimientos en .csv, para abrir en Excel o Google Sheets</span></span></button>
          <button type="button" class="settings-action" data-action="open-snapshots">${icon("refresh", 20)}<span><strong>Copias automáticas</strong><span>Volver a como estaban tus datos un día anterior</span></span></button>
          <label class="settings-action">${icon("upload", 20)}<span><strong>Importar backup</strong><span>Reemplaza los datos actuales</span></span>
            <input type="file" accept="application/json,.json" data-change="import-data" hidden /></label>
          <button type="button" class="settings-action" data-action="load-demo">${icon("sparkle", 20)}<span><strong>Cargar datos de ejemplo</strong><span>Para probar la app</span></span></button>
          <button type="button" class="settings-action" data-action="start-fresh">${icon("refresh", 20)}<span><strong>Empezar de cero</strong><span>Borra movimientos, metas y facturas; conserva categorías y monedas</span></span></button>
          <button type="button" class="settings-action is-danger" data-action="reset-all">${icon("trash", 20)}<span><strong>Borrar todo</strong><span>Deja la app como recién instalada</span></span></button>
        </div>
      </section>
`);

const SECTIONS = [
  { href: "#/ajustes-calculo", icon: "pie", title: "Cálculo del disponible", sub: () => "Reserva de facturas e ingreso de referencia" },
  { href: "#/ajustes-apariencia", icon: "sparkle", title: "Apariencia", sub: () => "Tema, color principal y fondo" },
  { href: "#/ajustes-dispositivo", icon: "phone", title: "En este dispositivo", sub: () => "Avisos, ocultar montos, instalar" },
  { href: "#/ajustes-datos", icon: "shield", title: "Tus datos", sub: () => lastBackupText() },
];

export default {
  id: "ajustes",
  tab: "mas",
  title: "Configuración",
  back: "#/mas",
  render() {
    return html`
      <nav class="more-grid" aria-label="Secciones de configuración">
        ${SECTIONS.map(
          (i) => html`<a class="more-item reveal" href="${i.href}">
            <span class="more-icon">${icon(i.icon, 22)}</span>
            <span class="more-text"><span class="more-title">${i.title}</span><span class="more-sub">${i.sub()}</span></span>
            ${icon("chevronRight", 18, "more-chevron")}
          </a>`
        )}
        <button type="button" class="more-item reveal" data-action="setup-wizard">
          <span class="more-icon">${icon("list", 22)}</span>
          <span class="more-text"><span class="more-title">Asistente de carga</span><span class="more-sub">Cuentas, tarjeta, facturas, préstamos y metas, paso a paso</span></span>
          ${icon("chevronRight", 18, "more-chevron")}
        </button>
        <button type="button" class="more-item reveal" data-action="show-onboarding">
          <span class="more-icon">${icon("help", 22)}</span>
          <span class="more-text"><span class="more-title">Cómo funciona la app</span><span class="more-sub">Un repaso rápido en 4 pasos</span></span>
          ${icon("chevronRight", 18, "more-chevron")}
        </button>
      </nav>
      <section class="card card-privacy reveal">
        <span class="privacy-icon">${icon("shield", 24)}</span>
        <div>
          <h2 class="section-title">Tus datos son tuyos</h2>
          <p class="section-sub">Todo se guarda <strong>solo en este dispositivo</strong>, dentro del navegador. No hay cuentas, no hay publicidad y tu información financiera no se envía a ningún servidor.</p>
          <p class="section-sub">La app guarda copias automáticas, pero si borrás los datos del navegador o cambiás de teléfono se pierden: exportá un backup de vez en cuando.</p>
        </div>
      </section>
      <p class="app-version">Neko Finanzas v1.1 · by Neko Tools</p>
    `;
  },
  ...handlers,
};
