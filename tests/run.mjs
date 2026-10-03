// Corre todas las pruebas de Neko Finanzas:  node tests/run.mjs
//
//   node tests/run.mjs            → todo
//   node tests/run.mjs --fast     → solo lógica (sin navegador, segundos)
//   node tests/run.mjs --only=x   → lógica + solo las pruebas de navegador que digan "x"
//
// 1) Lógica (node): unitarias, propiedades y operaciones al azar sobre el store.
// 2) Navegador (Chrome headless, tiempo virtual): flujos reales sobre la app.
// 3) Navegador en tiempo real (DevTools): service worker sin conexión e
//    imagen de fondo en IndexedDB, que con tiempo virtual se quedan colgados.
//
// Chrome: se busca en las rutas de siempre, o se indica con CHROME=/ruta.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { startServer, virtualFiles } from "./serve.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PORT = 5199;
const BASE = `http://localhost:${PORT}`;
const FAST = process.argv.includes("--fast");
// --only=texto: corre solo las pruebas de navegador cuyo nombre o archivo lo contengan.
const ONLY = (process.argv.find((a) => a.startsWith("--only=")) || "").slice(7).toLowerCase();
const wanted = (...names) => !ONLY || names.some((n) => n.toLowerCase().includes(ONLY));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const record = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✔" : "✘"} ${name}${detail ? `\n    ${detail.replace(/\n/g, "\n    ")}` : ""}`);
};

/** Una salida falla si menciona errores, fallas o marcas ✗. */
function looksBad(text) {
  return /✗|FALLAS|ERROR|Uncaught|[1-9]\d* fallidas|errores: (?!ninguno)|raros: (?!ninguno|0\b)/.test(text);
}

// ---------------------------------------------------------------------------
// 1) Lógica
// ---------------------------------------------------------------------------

for (const [name, file] of [
  ["Unitarias", "unit.test.mjs"],
  ["Propiedades", "props.test.mjs"],
  ["Store: operaciones al azar", "store.test.mjs"],
]) {
  const r = spawnSync(process.execPath, [join(HERE, file)], { encoding: "utf8", timeout: 300000 });
  const out = `${r.stdout}${r.stderr}`.trim();
  const lines = out.split("\n");
  record(name, r.status === 0 && !looksBad(out), looksBad(out) || r.status ? out : lines[0]);
}

if (FAST) finish();

// ---------------------------------------------------------------------------
// 2) Navegador (tiempo virtual)
// ---------------------------------------------------------------------------

const CHROME =
  process.env.CHROME ||
  [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].find((p) => existsSync(p));

if (!CHROME) {
  record("Navegador", false, "No encontré Chrome. Indicalo con CHROME=/ruta/a/chrome");
  finish();
}

const server = await startServer(PORT);

/**
 * Carga la app con la prueba inyectada, en Chrome de verdad (tiempo real:
 * IndexedDB y el service worker no andan con tiempo virtual).
 * `onboarding: true` deja que aparezca el tutorial de la primera vez (las
 * demás pruebas lo dan por visto). `pre` corre antes que la app.
 */
async function runBrowserTest(file, { query = "", onboarding = false, pre = "" } = {}) {
  // showSaveFilePicker se apaga: abriría un diálogo del sistema que nadie puede contestar.
  const head = `<script>window.showSaveFilePicker=undefined;try{sessionStorage.setItem("nekoFinanzas.splash","1");localStorage.setItem("nekoFinanzas.theme","light");${onboarding ? "" : 'localStorage.setItem("nekoFinanzas.onboardingSeen","1");'}${pre}}catch(e){}</script>`;
  const html = readFileSync(join(ROOT, "index.html"), "utf8")
    .replace("<head>", `<head>${head}`)
    .replace(
      "</body>",
      `<script type="module">
const src = await (await fetch("/__t.js")).text();
// La app carga los datos de forma asíncrona (IndexedDB): se espera a que dibuje.
for (let i = 0; i < 100 && !document.querySelector("#view")?.dataset.screen; i++) await new Promise((r) => setTimeout(r, 100));
await new Promise((r) => setTimeout(r, 800));
try { await new Function("f", src)({ contentWindow: window }); } catch (e) { console.log("CHECK ERROR " + ((e && e.stack) || e)); }
console.log("CHECK __FIN__");
</script></body>`
    );
  virtualFiles.set("/__test.html", html);
  virtualFiles.set("/__t.js", readFileSync(join(HERE, "browser", file), "utf8"));
  return withDevTools(async ({ send, on }) => {
    const lines = [];
    let done;
    const finished = new Promise((resolve) => (done = resolve));
    on("Runtime.consoleAPICalled", (p) => {
      const text = p.args.map((a) => a.value ?? a.description ?? "").join(" ");
      if (!text.startsWith("CHECK ")) return;
      if (text === "CHECK __FIN__") done();
      else lines.push(text.slice(6));
    });
    on("Runtime.exceptionThrown", (p) => lines.push("Uncaught " + (p.exceptionDetails.exception?.description || p.exceptionDetails.text)));
    await send("Runtime.enable");
    await send("Page.navigate", { url: `${BASE}/__test.html${query}#/inicio` });
    await Promise.race([finished, sleep(240000)]);
    return lines.join("\n");
  });
}

for (const [name, file, opts] of [
  ["Backup, recordatorio y CSV", "backup-csv.js"],
  ["Tutorial, ocultar montos, compartir, resumen", "onboarding-extras.js", { onboarding: true, query: "?ob" }],
  ["Datos de ejemplo, deshacer, foco, pestañas", "demo-safety.js"],
  ["Apariencia: paletas, fondo, animaciones", "appearance.js"],
  ["Accesibilidad y 10.000 movimientos", "a11y.js"],
  ["Calendario, configuración, asistente, colores", "quick-wins.js"],
  ["Cuentas y transferencias", "accounts.js"],
  ["Tarjeta de crédito y cuotas", "credit-card.js"],
  ["Préstamos", "loans.js"],
  ["Avisos de vencimientos", "reminders.js"],
  ["Recorrido completo de un usuario nuevo", "journey.js"],
  ["Cuestionario de inicio", "setup-wizard.js"],
  ["Ingresos: cobro parcial y extras", "income.js"],
  ["Sobres: súper reservado y gustos por día", "envelopes.js"],
  [
    "Datos: IndexedDB, copias automáticas, iPhone, pestañas",
    "storage.js",
    { pre: 'localStorage.setItem("nekoFinanzas.data.v1",JSON.stringify({transactions:[{id:"t-legado",type:"expense",amount:777,currency:"ARS",date:"2026-09-01",categoryId:"exp-otros",description:"Dato viejo",createdAt:"2026-09-01"}],categories:[],settings:{createdAt:"2026-08-01T00:00:00Z"}}));' },
  ],
  ["Toques al azar (semilla 1)", "monkey.js", { query: "?seed=1" }],
  ["Toques al azar (semilla 2)", "monkey.js", { query: "?seed=2" }],
  ["Toques al azar (semilla 3)", "monkey.js", { query: "?seed=3" }],
]) {
  if (!wanted(name, file)) continue;
  let out = await runBrowserTest(file, opts);
  // Chrome headless a veces no arranca a tiempo: un reintento antes de fallar.
  if (!out) out = await runBrowserTest(file, opts);
  const bad = !out || looksBad(out);
  // Con --only se muestra todo el detalle; si no, solo la última línea.
  record(name, !bad, bad ? out || "(sin resultados: Chrome no respondió)" : ONLY ? out : out.split("\n").slice(-1)[0]);
}

// ---------------------------------------------------------------------------
// 3) Navegador en tiempo real (DevTools)
// ---------------------------------------------------------------------------

async function withDevTools(fn) {
  const port = 9300 + Math.floor(Math.random() * 500);
  const profile = mkdtempSync(join(tmpdir(), "nf-cdp-"));
  const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--window-size=500,900", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
  let ws;
  let nextId = 1;
  const pending = new Map();
  const handlers = new Map();
  const on = (method, fn) => handlers.set(method, [...(handlers.get(method) || []), fn]);
  try {
    for (let i = 0; i < 40 && !ws; i++) {
      try {
        const page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page");
        if (page) {
          ws = new WebSocket(page.webSocketDebuggerUrl);
          await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
          ws.onmessage = (e) => {
            const msg = JSON.parse(e.data);
            if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
            if (msg.method) (handlers.get(msg.method) || []).forEach((fn) => fn(msg.params));
          };
        }
      } catch { ws = null; }
      if (!ws) await sleep(250);
    }
    if (!ws) throw new Error("no se pudo conectar a Chrome");
    const send = (method, params = {}) => new Promise((r) => { const id = nextId++; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
    const evaluate = async (expression) => {
      const res = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (res.result?.exceptionDetails) throw new Error(res.result.exceptionDetails.exception?.description || "error al evaluar");
      return res.result?.result?.value;
    };
    await send("Page.enable");
    await send("Network.enable");
    // Lo que la app "descarga" durante una prueba (backups, planillas, imágenes)
    // va a la carpeta temporal del perfil, no a la carpeta Descargas de la persona.
    await send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: profile });
    // Permiso de notificaciones (los avisos igual vienen apagados hasta que se prenden).
    await send("Browser.grantPermissions", { permissions: ["notifications"], origin: BASE });
    return await fn({ send, evaluate, on });
  } finally {
    try { ws?.close(); } catch {}
    chrome.kill();
    await sleep(500);
    try { rmSync(profile, { recursive: true, force: true }); } catch {}
  }
}

if (wanted("Sin conexión", "offline")) try {
  const out = await withDevTools(async ({ send, evaluate, on }) => {
    // Privacidad: la app no tiene que pedir nada a otros servidores.
    const external = new Set();
    on("Network.requestWillBeSent", (p) => {
      const u = p.request.url;
      if (/^https?:/.test(u) && !u.startsWith(BASE)) external.add(new URL(u).hostname);
    });
    await send("Page.navigate", { url: `${BASE}/#/inicio` });
    await sleep(8000); // que el service worker se instale y guarde todo
    const sw = await evaluate(`(async () => {
      const names = await caches.keys();
      const count = names.length ? (await (await caches.open(names[0])).keys()).length : 0;
      return { controlled: !!navigator.serviceWorker.controller, cache: names[0], count };
    })()`);
    await send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await send("Page.reload", { ignoreCache: false });
    await sleep(4000);
    const flow = await evaluate(`(async () => {
      const hero = document.querySelector(".hero-amount")?.textContent || null;
      location.hash = "#/reportes";
      await new Promise((r) => setTimeout(r, 600));
      const store = await import("/js/core/store.js");
      const before = store.getState().transactions.length;
      store.addTransaction({ type: "expense", amount: 123, currency: "ARS", date: new Date().toISOString().slice(0, 10), categoryId: "exp-otros" });
      const storage = await import("/js/core/storage.js");
      await storage.flush();
      const saved = (await storage.loadData()).transactions.length;
      return { online: navigator.onLine, hero, screen: document.querySelector("#view").dataset.screen, saved: saved - before, fonts: document.fonts.check("700 16px Outfit") && document.fonts.check("400 16px Inter") };
    })()`);
    return { sw, flow, external: [...external] };
  });
  const ok = out.sw.controlled && out.sw.count > 40 && !out.flow.online && out.flow.hero && out.flow.screen === "reportes" && out.flow.saved === 1 && out.flow.fonts && !out.external.length;
  record("Sin conexión (service worker real)", ok, `${out.sw.cache}: ${out.sw.count} archivos · sin red: inicio ${out.flow.hero}, navega y guarda · fuentes sin red=${out.flow.fonts} · pedidos externos: ${out.external.join(", ") || "ninguno"}`);
} catch (error) {
  record("Sin conexión (service worker real)", false, error.message);
}

// El navegador despierta al service worker en segundo plano (como en Android
// con la app instalada): tiene que mostrar los avisos pendientes él solo.
if (wanted("Avisos en segundo plano", "reminders")) try {
  const out = await withDevTools(async ({ send, evaluate, on }) => {
    let registrationId = "";
    on("ServiceWorker.workerRegistrationUpdated", (p) => {
      const reg = p.registrations.find((r) => r.scopeURL.startsWith(BASE));
      if (reg) registrationId = reg.registrationId;
    });
    await send("ServiceWorker.enable");
    await send("Page.navigate", { url: `${BASE}/#/inicio` });
    await sleep(6000);
    const setup = await evaluate(`(async () => {
      localStorage.setItem("nekoFinanzas.onboardingSeen", "1");
      const store = await import("/js/core/store.js");
      const R = await import("/js/ui/reminders.js");
      const db = await import("/js/core/db.js");
      await navigator.serviceWorker.ready;
      const result = await R.enableReminders(store.getState());
      // Chrome sin ventana no lista las notificaciones: se mira el registro de
      // avisos ya mostrados que lleva la app.
      const record = await db.withStore("assets", "readonly", (s) => s.get("reminders"));
      const first = Object.keys(record.shown || {}).length;
      // Como si todavía no se hubiera avisado nada (la app estuvo cerrada).
      await db.withStore("assets", "readwrite", (s) => s.put({ ...record, shown: {} }, "reminders"));
      return { result, first, pending: 0 };
    })()`);
    await send("ServiceWorker.dispatchPeriodicSyncEvent", { origin: BASE, registrationId, tag: "neko-vencimientos" });
    await sleep(2500);
    const shownTags = `(async () => { const db = await import("/js/core/db.js"); const r = await db.withStore("assets", "readonly", (s) => s.get("reminders")); return Object.keys(r?.shown || {}); })()`;
    const woke = await evaluate(shownTags);
    // Con los avisos apagados, despertar no muestra nada.
    await evaluate(`(async () => { const store = await import("/js/core/store.js"); const R = await import("/js/ui/reminders.js"); await R.disableReminders(store.getState()); })()`);
    await send("ServiceWorker.dispatchPeriodicSyncEvent", { origin: BASE, registrationId, tag: "neko-vencimientos" });
    await sleep(1500);
    const off = (await evaluate(shownTags)).length;
    return { setup, woke, off, registrationId: !!registrationId };
  });
  const ok = out.setup.result === "granted" && out.setup.first > 0 && out.setup.pending === 0 && out.woke.length === out.setup.first && out.off === 0;
  record("Avisos en segundo plano (service worker)", ok, `al despertar el service worker avisa ${out.woke.length} de ${out.setup.first} pendientes · con los avisos apagados: ${out.off}`);
} catch (error) {
  record("Avisos en segundo plano (service worker)", false, error.message);
}

if (wanted("Imagen de fondo", "background")) try {
  const out = await withDevTools(async ({ send, evaluate }) => {
    await send("Page.navigate", { url: `${BASE}/#/ajustes` });
    await sleep(4000);
    const first = await evaluate(`(async () => {
      localStorage.setItem("nekoFinanzas.onboardingSeen", "1");
      const bg = await import("/js/ui/background.js");
      const c = document.createElement("canvas"); c.width = 2400; c.height = 1600;
      c.getContext("2d").fillRect(0, 0, 2400, 1600);
      const blob = await new Promise((r) => c.toBlob(r, "image/png"));
      await bg.setCustomImage(new File([blob], "foto.png", { type: "image/png" }));
      const rejected = [];
      for (const [name, type, body] of [["x.svg", "image/svg+xml", "<svg onload=alert(1)>"], ["x.png", "image/png", "no soy imagen"], ["x.html", "text/html", "<script>"]]) {
        try { await bg.setCustomImage(new File([body], name, { type })); } catch { rejected.push(name); }
      }
      return { bg: document.documentElement.dataset.bg, rejected };
    })()`);
    await send("Page.reload");
    await sleep(3500);
    const second = await evaluate(`(async () => {
      const bg = await import("/js/ui/background.js");
      const after = document.documentElement.dataset.bg;
      await bg.removeCustomImage();
      return { after, removed: document.documentElement.dataset.bg, still: await bg.hasCustomImage() };
    })()`);
    return { first, second };
  });
  const ok = out.first.bg === "custom" && out.first.rejected.length === 3 && out.second.after === "custom" && out.second.removed === "pattern" && !out.second.still;
  record("Imagen de fondo propia (IndexedDB real)", ok, `guardada, sigue tras recargar, se quita · rechaza: ${out.first.rejected.join(", ")}`);
} catch (error) {
  record("Imagen de fondo propia (IndexedDB real)", false, error.message);
}

server.close();
finish();

function finish() {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} grupos de pruebas OK${failed.length ? ` · fallaron: ${failed.map((f) => f.name).join(", ")}` : ""}`);
  process.exit(failed.length ? 1 : 0);
}
