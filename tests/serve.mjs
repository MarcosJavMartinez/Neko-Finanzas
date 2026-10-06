// Servidor estático mínimo para probar la app (node tests/serve.mjs [puerto]).
// Además sirve, desde memoria, la página de prueba que arma el runner
// (/__test.html y /__t.js), así no se escriben archivos en el proyecto.

import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

export const virtualFiles = new Map();

export function startServer(port = 5173) {
  const server = http.createServer(async (req, res) => {
    let path = decodeURIComponent(req.url.split("?")[0]);
    if (virtualFiles.has(path)) {
      res.writeHead(200, { "Content-Type": TYPES[extname(path)] || "text/plain" });
      return res.end(virtualFiles.get(path));
    }
    if (path.endsWith("/")) path += "index.html";
    const file = normalize(join(ROOT, path));
    if (!file.startsWith(normalize(ROOT + sep)) && file !== normalize(ROOT)) {
      res.writeHead(403);
      return res.end();
    }
    try {
      const data = await readFile(file);
      res.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream" });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end("not found");
    }
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

// Uso directo: node tests/serve.mjs 5173
if (process.argv[1] && fileURLToPath(import.meta.url) === normalize(process.argv[1])) {
  const port = Number(process.argv[2]) || 5173;
  await startServer(port);
  console.log(`Neko Finanzas en http://localhost:${port}`);
}
