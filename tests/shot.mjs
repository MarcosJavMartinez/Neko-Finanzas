// Captura de pantalla de la app en un teléfono simulado (390 px de ancho).
//
//   node tests/shot.mjs inicio salida.png [alto] [js-antes]
//
// La ruta va sin "#/" (Git Bash en Windows convierte "#/algo" en una ruta de disco).
//
// `js-antes` corre en la página ya cargada (por ejemplo, para abrir una hoja)
// y puede devolver una promesa. Usa Chrome en tiempo real.

import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "./serve.mjs";

const [rawRoute = "inicio", out = "captura.png", height = "844", prep = ""] = process.argv.slice(2);
const route = `#/${rawRoute.replace(/^.*#\/?/, "")}`;
const CHROME =
  process.env.CHROME ||
  ["C:/Program Files/Google/Chrome/Application/chrome.exe", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find((p) => existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 5198;
const server = await startServer(PORT);
const debugPort = 9200 + Math.floor(Math.random() * 90);
const profile = mkdtempSync(join(tmpdir(), "nf-shot-"));
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });

let ws;
let id = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise((r) => { const n = ++id; pending.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;

try {
  for (let i = 0; i < 40 && !ws; i++) {
    try {
      const page = (await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json()).find((t) => t.type === "page");
      ws = new WebSocket(page.webSocketDebuggerUrl);
      await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
      ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
    } catch { ws = null; await sleep(250); }
  }
  await send("Page.enable");
  // Región del dispositivo simulado: Argentina, o la que diga REGION (por ejemplo REGION=en-US).
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `try{Object.defineProperty(Navigator.prototype,"language",{get:()=>"${process.env.REGION || "es-AR"}"});Object.defineProperty(Navigator.prototype,"languages",{get:()=>["${process.env.REGION || "es-AR"}"]});}catch(e){}` });
  // Las descargas van a la carpeta temporal, no a Descargas.
  await send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: profile });
  // Ancho del teléfono simulado: 390 px, o el que diga ANCHO (por ejemplo ANCHO=320).
  await send("Emulation.setDeviceMetricsOverride", { width: Number(process.env.ANCHO) || 390, height: Number(height), deviceScaleFactor: 1, mobile: true });
  // Primera carga: sin splash ni tutorial, tema claro (salvo que el js-antes diga otra cosa).
  await send("Page.navigate", { url: `http://localhost:${PORT}/` });
  await sleep(1500);
  await evaluate(`sessionStorage.setItem("nekoFinanzas.splash","1"); localStorage.setItem("nekoFinanzas.onboardingSeen","1"); localStorage.setItem("nekoFinanzas.setupOffered","1"); localStorage.setItem("nekoFinanzas.theme", localStorage.getItem("nekoFinanzas.theme") || "light");`);
  // Con ?captura la URL cambia y la página se recarga de verdad (no solo el #).
  await send("Page.navigate", { url: `http://localhost:${PORT}/?captura${route}` });
  await sleep(2500);
  if (prep) {
    await evaluate(`(async () => { ${prep} })()`);
    await sleep(Number(process.env.ESPERA || 1200)); // ESPERA=5000 si el js-antes recarga la página
  }
  const shot = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(out, Buffer.from(shot.result.data, "base64"));
  console.log("captura:", out);
} catch (error) {
  console.log("ERROR", error.message);
} finally {
  try { ws?.close(); } catch {}
  chrome.kill();
  server.close();
  await sleep(400);
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
}
