// "Pasar a otro dispositivo": enviar (muestra un QR y un código) o recibir
// (escanear el QR con la cámara o escribir el código). Es una copia de una
// sola vez, no una sincronización. Ver js/core/transfer.js.

import { msg, tr } from "../core/i18n.js";
import { html } from "./dom.js";
import { icon } from "./icons.js";
import { openSheet, confirmDialog, whenHistorySettled } from "./sheet.js";
import { toast } from "./toast.js";
import * as store from "../core/store.js";
import { sendData, receiveData, isWaiting, parseCode, formatCode, transferErrorText, QR_PREFIX } from "../core/transfer.js";

const POLL_MS = 5000;
const canScan = () => Boolean(navigator.mediaDevices?.getUserMedia);
const clock = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.max(0, Math.floor(seconds % 60))).padStart(2, "0")}`;

export function openTransfer() {
  let stopWatch = () => {};
  let stopCamera = () => {};
  let cameraBox = null;
  const stopScan = () => {
    stopCamera();
    stopCamera = () => {};
    if (cameraBox) cameraBox.hidden = true;
  };
  openSheet({
    title: "Pasar a otro dispositivo",
    body: html`<div class="transfer">
      <p class="sheet-text">Para cambiar de celular o pasar tus datos a la compu. Es una copia de una sola vez: después cada dispositivo sigue por su lado.</p>
      <div class="transfer-choice" role="group" aria-label="¿Qué quieres hacer?">
        <button type="button" class="transfer-option" data-view="send" aria-pressed="false">${icon("upload", 22)}<span><strong>Enviar desde aquí</strong><span>Este dispositivo tiene los datos</span></span></button>
        <button type="button" class="transfer-option" data-view="receive" aria-pressed="false">${icon("download", 22)}<span><strong>Recibir aquí</strong><span>Los datos están en el otro</span></span></button>
      </div>

      <section class="transfer-panel" data-panel="send" hidden>
        <p class="field-hint">Tus datos se cifran en este dispositivo y se guardan en nekotools.site solo por 15 minutos. Nadie más puede leerlos: la clave va en el código.</p>
        <button type="button" class="btn btn-primary btn-block" data-do="generate">${icon("lock", 18)} Generar código</button>
        <div class="transfer-result" data-result hidden>
          <canvas class="transfer-qr" data-qr aria-label="Código QR para escanear desde el otro dispositivo" role="img"></canvas>
          <p class="transfer-code" data-code></p>
          <p class="transfer-status" data-status role="status" aria-live="polite"></p>
          <button type="button" class="btn btn-ghost btn-sm" data-do="copy" hidden>${icon("check", 16)} Copiar código</button>
          <p class="field-hint">En el otro dispositivo: Configuración → Tus datos → Pasar a otro dispositivo → Recibir aquí.</p>
        </div>
      </section>

      <section class="transfer-panel" data-panel="receive" hidden>
        <p class="field-hint">Lo que llegue reemplaza todos los datos de este dispositivo. Antes se guarda una copia automática.</p>
        ${canScan() ? html`<button type="button" class="btn btn-primary btn-block" data-do="scan">${icon("search", 18)} Escanear el QR</button>` : ""}
        <div class="transfer-camera" data-camera hidden>
          <video data-video playsinline muted aria-label="Cámara"></video>
          <button type="button" class="btn btn-ghost btn-sm" data-do="stop-scan">Cancelar</button>
        </div>
        <form class="form" data-code-form novalidate>
          <label class="field">
            <span class="field-label">${canScan() ? "O escribe el código" : "Escribe el código"}</span>
            <input name="code" type="text" class="transfer-input" autocomplete="off" autocapitalize="characters" spellcheck="false" inputmode="text" maxlength="20" placeholder="AB12CD-EF34-GH56" />
          </label>
          <p class="field-error" data-error-for="code"></p>
          <button type="submit" class="btn btn-primary btn-block">${icon("download", 18)} Recibir datos</button>
        </form>
      </section>
    </div>`,
    onMount(panel, close) {
      const $ = (sel) => panel.querySelector(sel);
      cameraBox = $("[data-camera]");
      const show = (view) => {
        panel.querySelectorAll("[data-view]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === view)));
        panel.querySelectorAll("[data-panel]").forEach((p) => (p.hidden = p.dataset.panel !== view));
        if (view !== "receive") stopScan();
      };
      panel.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => show(b.dataset.view)));

      // ---- Enviar ----
      let current = "";
      const status = $("[data-status]");
      $("[data-do=generate]").addEventListener("click", async (event) => {
        const button = event.currentTarget;
        button.disabled = true;
        stopWatch();
        status.textContent = tr("Cifrando y subiendo…");
        $("[data-result]").hidden = false;
        $("[data-qr]").hidden = true;
        $("[data-code]").textContent = "";
        $("[data-do=copy]").hidden = true;
        try {
          const { code, ttlSeconds } = await sendData(store.exportJSON());
          current = code;
          await drawQR($("[data-qr]"), QR_PREFIX + code);
          $("[data-qr]").hidden = false;
          $("[data-code]").textContent = formatCode(code);
          $("[data-do=copy]").hidden = false;
          stopWatch = watch(code, ttlSeconds, status);
          button.textContent = tr("Generar otro código");
        } catch (error) {
          status.textContent = tr(transferErrorText(error));
        } finally {
          button.disabled = false;
        }
      });
      $("[data-do=copy]").addEventListener("click", async () => {
        if (!current) return;
        try {
          await navigator.clipboard.writeText(formatCode(current));
          toast("Código copiado");
        } catch {
          toast("No se pudo copiar: anótalo a mano", { type: "error" });
        }
      });

      // ---- Recibir ----
      const form = $("[data-code-form]");
      const input = form.elements.code;
      const error = $("[data-error-for=code]");
      input.addEventListener("input", () => {
        // Se escribe de corrido y se agrupa solo: AB12CD-EF34-GH56.
        const raw = input.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 14);
        input.value = [raw.slice(0, 6), raw.slice(6, 10), raw.slice(10)].filter(Boolean).join("-");
        error.textContent = "";
      });
      const receive = async (code) => {
        error.textContent = "";
        const submit = form.querySelector("[type=submit]");
        submit.disabled = true;
        submit.setAttribute("aria-busy", "true");
        try {
          const text = await receiveData(code);
          let count = 0;
          try {
            count = (JSON.parse(text).data?.transactions || []).length;
          } catch {
            // importJSON avisa si no es un backup válido
          }
          const ok = await confirmDialog({
            title: "¿Reemplazar tus datos?",
            text: msg`Llegaron los datos del otro dispositivo, con ${count} movimientos. Reemplazan todo lo que tienes aquí; antes se guarda una copia automática. Si cancelas, tendrás que generar otro código.`,
            confirmLabel: "Reemplazar",
          });
          if (!ok) return;
          store.importJSON(text);
          toast("¡Listo! Tus datos ya están en este dispositivo", { type: "success" });
          close();
          whenHistorySettled(() => (location.hash = "#/inicio"));
        } catch (err) {
          error.textContent = err?.code ? tr(transferErrorText(err)) : tr(err?.message || "No se pudo leer el archivo");
        } finally {
          submit.disabled = false;
          submit.removeAttribute("aria-busy");
        }
      };
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const code = parseCode(input.value);
        if (!code) {
          error.textContent = tr("El código tiene 14 letras y números, como AB12CD-EF34-GH56.");
          return;
        }
        receive(code);
      });
      $("[data-do=scan]")?.addEventListener("click", async () => {
        stopScan();
        error.textContent = "";
        cameraBox.hidden = false;
        try {
          stopCamera = await scan($("[data-video]"), (code) => {
            stopScan();
            input.value = formatCode(code);
            receive(code);
          });
        } catch {
          stopScan();
          error.textContent = tr("No se pudo usar la cámara. Revisa el permiso o escribe el código.");
        }
      });
      $("[data-do=stop-scan]").addEventListener("click", stopScan);
    },
    onClose() {
      stopWatch();
      stopScan();
    },
  });
}

/** El QR en un canvas (negro sobre blanco siempre, para que la cámara lo lea bien). */
async function drawQR(canvas, text) {
  const qrcode = (await import("../vendor/qrcode.js")).default;
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const cell = 6;
  const margin = 4;
  const size = (qr.getModuleCount() + margin * 2) * cell;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#000";
  for (let r = 0; r < qr.getModuleCount(); r++) {
    for (let c = 0; c < qr.getModuleCount(); c++) {
      if (qr.isDark(r, c)) ctx.fillRect((c + margin) * cell, (r + margin) * cell, cell, cell);
    }
  }
}

/** Cuenta regresiva y aviso en vivo de cuando el otro dispositivo lo recibió. */
function watch(code, ttlSeconds, status) {
  const until = Date.now() + ttlSeconds * 1000;
  const done = (text) => {
    stop();
    status.textContent = tr(text);
    status.dataset.state = text.startsWith("¡") ? "used" : "expired";
  };
  const tick = () => {
    const left = (until - Date.now()) / 1000;
    if (left <= 0) return done("El código venció. Genera otro.");
    status.dataset.state = "waiting";
    status.textContent = msg`Esperando al otro dispositivo… vence en ${clock(left)}`;
  };
  const poll = async () => {
    if (document.hidden) return;
    try {
      if (!(await isWaiting(code))) done((until - Date.now()) / 1000 > 10 ? "¡Listo! El otro dispositivo ya recibió tus datos." : "El código venció. Genera otro.");
    } catch {
      // sin conexión un momento: se reintenta en la próxima vuelta
    }
  };
  const timers = [setInterval(tick, 1000), setInterval(poll, POLL_MS)];
  const stop = () => timers.forEach(clearInterval);
  tick();
  return stop;
}

/**
 * Lee QR con la cámara trasera. Usa el lector del navegador si hay
 * (Android/Chrome); si no (iPhone, Firefox), una librería que se carga solo
 * en ese momento. Devuelve la función para apagar la cámara.
 */
async function scan(video, onCode) {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
  let running = true;
  const stop = () => {
    running = false;
    stream.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  };
  video.srcObject = stream;
  await video.play().catch(() => {});
  let detector = null;
  if ("BarcodeDetector" in window) {
    try {
      if ((await window.BarcodeDetector.getSupportedFormats()).includes("qr_code")) detector = new window.BarcodeDetector({ formats: ["qr_code"] });
    } catch {
      detector = null;
    }
  }
  const jsQR = detector ? null : (await import("../vendor/jsqr.js")).default;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const look = async () => {
    if (!running) return;
    try {
      let text = "";
      if (video.readyState >= 2 && video.videoWidth) {
        if (detector) text = (await detector.detect(video))[0]?.rawValue || "";
        else {
          const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
          canvas.width = Math.round(video.videoWidth * scale);
          canvas.height = Math.round(video.videoHeight * scale);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          text = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, { inversionAttempts: "dontInvert" })?.data || "";
        }
      }
      const code = parseCode(text);
      if (code) return onCode(code);
    } catch {
      // un cuadro que no se pudo leer: se sigue con el próximo
    }
    setTimeout(look, 200);
  };
  look();
  return stop;
}
