// Corre todas las pruebas de Neko Finanzas:  node tests/run.mjs
//
//   node tests/run.mjs            → todo
//   node tests/run.mjs --fast     → solo lógica (sin navegador, segundos)
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
 * Carga la app con la prueba inyectada. `onboarding: true` deja que aparezca
 * el tutorial de la primera vez (las demás pruebas lo dan por visto).
 */
async function runBrowserTest(file, { query = "", onboarding = false } = {}) {
  const pre = `<script>try{sessionStorage.setItem("nekoFinanzas.splash","1");localStorage.setItem("nekoFinanzas.theme","light");${onboarding ? "" : 'localStorage.setItem("nekoFinanzas.onboardingSeen","1");'}}catch(e){}</script>`;
  const html = readFileSync(join(ROOT, "index.html"), "utf8")
    .replace("<head>", `<head>${pre}`)
    .replace(
      "</body>",
      `<script type="module">
const src = await (await fetch("/__t.js")).text();
setTimeout(() => { const f = { contentWindow: window }; new Function("f", src)(f); }, 1500);
</script></body>`
    );
  virtualFiles.set("/__test.html", html);
  virtualFiles.set("/__t.js", readFileSync(join(HERE, "browser", file), "utf8"));
  const profile = mkdtempSync(join(tmpdir(), "nf-test-"));
  // spawn (no spawnSync): el servidor corre en este mismo proceso y tiene
  // que poder responderle a Chrome mientras tanto.
  const stderr = await new Promise((resolve) => {
    let err = "";
    const child = spawn(
      CHROME,
      ["--headless=new", "--disable-gpu", "--window-size=500,900", "--virtual-time-budget=90000", "--enable-logging=stderr", "--v=0",
        `--user-data-dir=${profile}`, "--dump-dom", `${BASE}/__test.html${query}#/inicio`],
      { stdio: ["ignore", "ignore", "pipe"] }
    );
    const timer = setTimeout(() => child.kill(), 240000);
    child.stderr.on("data", (d) => (err += d));
    child.on("close", () => {
      clearTimeout(timer);
      resolve(err);
    });
  });
  await sleep(300);
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
  return stderr
    .split("\n")
    .filter((l) => /CHECK|Uncaught/.test(l))
    .map((l) => (l.match(/"(CHECK [\s\S]*|Uncaught[\s\S]*)", source/) || [, l])[1].replace(/^CHECK /, ""))
    .join("\n");
}

for (const [name, file, opts] of [
  ["Backup, recordatorio y CSV", "backup-csv.js"],
  ["Tutorial, ocultar montos, compartir, resumen", "onboarding-extras.js", { onboarding: true, query: "?ob" }],
  ["Datos de ejemplo, deshacer, foco, pestañas", "demo-safety.js"],
  ["Apariencia: paletas, fondo, animaciones", "appearance.js"],
  ["Accesibilidad y 10.000 movimientos", "a11y.js"],
  ["Toques al azar (semilla 1)", "monkey.js", { query: "?seed=1" }],
  ["Toques al azar (semilla 2)", "monkey.js", { query: "?seed=2" }],
  ["Toques al azar (semilla 3)", "monkey.js", { query: "?seed=3" }],
]) {
  let out = await runBrowserTest(file, opts);
  // Chrome headless a veces no arranca a tiempo: un reintento antes de fallar.
  if (!out) out = await runBrowserTest(file, opts);
  const bad = !out || looksBad(out);
  record(name, !bad, bad ? out || "(sin resultados: Chrome no respondió)" : out.split("\n").slice(-1)[0]);
}

// ---------------------------------------------------------------------------
// 3) Navegador en tiempo real (DevTools)
// ---------------------------------------------------------------------------

async function withDevTools(fn) {
  const port = 9300 + Math.floor(Math.random() * 500);
  const profile = mkdtempSync(join(tmpdir(), "nf-cdp-"));
  const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
  let ws;
  let nextId = 1;
  const pending = new Map();
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
    return await fn({ send, evaluate });
  } finally {
    try { ws?.close(); } catch {}
    chrome.kill();
    await sleep(500);
    try { rmSync(profile, { recursive: true, force: true }); } catch {}
  }
}

try {
  const out = await withDevTools(async ({ send, evaluate }) => {
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
      const saved = JSON.parse(localStorage.getItem("nekoFinanzas.data.v1")).transactions.length;
      return { online: navigator.onLine, hero, screen: document.querySelector("#view").dataset.screen, saved: saved - before };
    })()`);
    return { sw, flow };
  });
  const ok = out.sw.controlled && out.sw.count > 40 && !out.flow.online && out.flow.hero && out.flow.screen === "reportes" && out.flow.saved === 1;
  record("Sin conexión (service worker real)", ok, `${out.sw.cache}: ${out.sw.count} archivos · sin red: inicio ${out.flow.hero}, navega y guarda`);
} catch (error) {
  record("Sin conexión (service worker real)", false, error.message);
}

try {
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
