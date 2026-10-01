// Genera los PNG de la app (favicons, íconos PWA, logo del header) a partir
// de tools/icon-source.png (el ícono de Neko Finanzas de Neko Tools, 1254px)
// usando Chrome/Edge en modo headless. No es parte de la app: se corre a
// mano cuando cambia el ícono.
//
//   node tools/render-icons.js
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = "file:///" + path.join(__dirname, "icon-source.png").split(path.sep).join("/");
const browsers = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
];
const browser = browsers.find((b) => fs.existsSync(b));
if (!browser) throw new Error("No se encontró Chrome ni Edge");

const outputs = [
  { file: "img/icon-512.png", size: 512 },
  { file: "img/icon-192.png", size: 192 },
  { file: "img/apple-touch-icon.png", size: 180, background: "#ffffff", scale: 1.08 },
  { file: "img/logo-header.png", size: 160 },
  { file: "img/favicon-32.png", size: 32 },
  { file: "img/favicon-16.png", size: 16 },
  // Maskable: el sistema recorta el ícono con su propia forma, así que el
  // logo va dentro de la zona segura (80%) sobre fondo lleno.
  { file: "img/icon-maskable-512.png", size: 512, background: "#e0f6f8", scale: 0.86 },
];

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "neko-icons-"));
for (const out of outputs) {
  const scale = out.scale || 1;
  const html = `<!doctype html><html><head><style>
    html,body{margin:0;width:${out.size}px;height:${out.size}px;overflow:hidden;background:${out.background || "transparent"}}
    img{position:absolute;left:${(out.size * (1 - scale)) / 2}px;top:${(out.size * (1 - scale)) / 2}px;width:${out.size * scale}px;height:${out.size * scale}px}
  </style></head><body><img src="${source}"></body></html>`;
  const page = path.join(tmp, "page.html");
  fs.writeFileSync(page, html);
  const target = path.join(root, out.file);
  execFileSync(browser, [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    "--default-background-color=00000000",
    "--allow-file-access-from-files",
    `--window-size=${out.size},${out.size}`,
    `--screenshot=${target}`,
    "file:///" + page.replace(/\\/g, "/"),
  ], { stdio: "ignore" });
  console.log("✓", out.file);
}
fs.rmSync(tmp, { recursive: true, force: true });
