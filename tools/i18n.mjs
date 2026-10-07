// Textos de la app y sus traducciones.
//
//   node tools/i18n.mjs            → resumen: claves del código y qué le falta a cada idioma
//   node tools/i18n.mjs keys       → todas las claves (JSON), para traducir
//   node tools/i18n.mjs missing en → claves que le faltan a un idioma (JSON)
//   node tools/i18n.mjs loose      → textos armados con variables que no llevan la etiqueta msg
//
// Lee el código con un lector mínimo de JavaScript (strings, templates y
// comentarios) y parte los templates `html` igual que la app (js/core/i18n.js).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { LANGUAGES, translateSource } from "../js/core/i18n.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKIP = new Set(["js/i18n", "js/vendor"]);

export function sourceFiles(dir = "js") {
  const out = [];
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (!SKIP.has(rel)) out.push(...sourceFiles(rel));
    } else if (entry.name.endsWith(".js")) out.push(rel);
  }
  return out;
}

const REGEX_BEFORE = new Set(["return", "typeof", "case", "in", "of", "delete", "void", "throw", "new", "else", "do"]);
const cook = (raw, quote) => {
  try {
    return Function(`return ${quote}${raw}${quote}`)();
  } catch (error) {
    return raw;
  }
};

/** Devuelve los literales del archivo: { kind: "str" | "tpl", tag, strings, line }. */
export function scan(src) {
  const items = [];
  let i = 0;
  let line = 1;
  let prev = ""; // último token significativo (símbolo o identificador)
  let prevEnd = -1;

  const step = (n = 1) => {
    for (let k = 0; k < n; k++) if (src[i++] === "\n") line++;
  };

  function template(tag) {
    const startLine = line;
    const pos = i;
    const raws = [];
    let raw = "";
    step(); // `
    while (i < src.length && src[i] !== "`") {
      if (src[i] === "\\") {
        raw += src[i] + src[i + 1];
        step(2);
      } else if (src[i] === "$" && src[i + 1] === "{") {
        raws.push(raw);
        raw = "";
        step(2);
        code(true);
        step(); // }
      } else {
        raw += src[i];
        step();
      }
    }
    raws.push(raw);
    step(); // `
    items.push({ kind: "tpl", tag, strings: raws.map((r) => cook(r, "`")), line: startLine, pos });
  }

  function code(untilBrace) {
    let depth = 0;
    while (i < src.length) {
      const ch = src[i];
      const two = src.slice(i, i + 2);
      if (two === "//") {
        while (i < src.length && src[i] !== "\n") step();
      } else if (two === "/*") {
        while (i < src.length && src.slice(i, i + 2) !== "*/") step();
        step(2);
      } else if (ch === '"' || ch === "'") {
        const startLine = line;
        let raw = "";
        step();
        while (i < src.length && src[i] !== ch) {
          if (src[i] === "\\") {
            raw += src[i] + src[i + 1];
            step(2);
          } else {
            raw += src[i];
            step();
          }
        }
        step();
        items.push({ kind: "str", tag: "", strings: [cook(raw, ch)], line: startLine });
        prev = "str";
        prevEnd = i;
      } else if (ch === "`") {
        const tag = /^[A-Za-z_$][\w$]*$/.test(prev) && prevEnd === i ? prev : "";
        template(tag);
        prev = "str";
        prevEnd = i;
      } else if (ch === "/" && (prev === "" || REGEX_BEFORE.has(prev) || /^[(,=:[!&|?{};+\-*%<>~^]$/.test(prev))) {
        step();
        let inClass = false;
        while (i < src.length && (src[i] !== "/" || inClass) && src[i] !== "\n") {
          if (src[i] === "\\") step();
          else if (src[i] === "[") inClass = true;
          else if (src[i] === "]") inClass = false;
          step();
        }
        step();
        while (/[a-z]/.test(src[i] || "")) step();
        prev = "regex";
        prevEnd = i;
      } else if (/[A-Za-z_$]/.test(ch)) {
        const start = i;
        while (/[\w$]/.test(src[i] || "")) step();
        prev = src.slice(start, i);
        prevEnd = i;
      } else if (/\s/.test(ch)) {
        step();
      } else {
        if (ch === "{") depth++;
        else if (ch === "}") {
          if (depth === 0 && untilBrace) return;
          depth--;
        }
        prev = /\d/.test(ch) ? "num" : ch;
        prevEnd = i + 1;
        step();
      }
    }
  }

  code(false);
  return items;
}

const SPANISH = /[áéíóúñÁÉÍÓÚÑ¿¡]/;
const WORDS = /^[\p{L}\d ,.:;()%…·¿?¡!«»“”"'/+-]+$/u;
/** ¿Parece un texto para mostrar (y no un selector, una clase o un id)? */
export function looksLikeText(text) {
  if (!/\p{L}{2}/u.test(text) || /^\s*$/.test(text)) return false;
  if (/^(\.{0,2}\/|#\/|https?:|data:|\.)/.test(text) || /\.(js|json|png|webp|css)$/.test(text)) return false;
  if (/[_=<>{}\[\]\\@#*|]/.test(text)) return false;
  if (SPANISH.test(text)) return true;
  if (!WORDS.test(text)) return false;
  if (/^[A-ZÁÉÍÓÚ][a-záéíóúñ]/.test(text) && !/[a-z][A-Z]/.test(text)) return true;
  // minúsculas: solo frases (con espacio) sin palabras con guiones, puntos ni dígitos pegados
  return / /.test(text.trim()) && text.trim().split(/\s+/).every((w) => /^[\p{L}]+[,.:;…]?$/u.test(w) || /^[\d%]+$/.test(w));
}

export function collect() {
  const keys = new Map(); // clave → [dónde]
  const maybe = new Map(); // textos sueltos que parecen texto
  const loose = []; // templates con variables y sin etiqueta
  const add = (map, key, where) => map.set(key, [...(map.get(key) || []), where]);
  for (const file of sourceFiles()) {
    for (const item of scan(fs.readFileSync(path.join(ROOT, file), "utf8"))) {
      const where = `${file}:${item.line}`;
      if (item.kind === "tpl" && item.tag === "html") {
        translateSource(item.strings, (key) => (add(keys, key, where), null));
      } else if (item.kind === "tpl" && item.tag === "msg") {
        add(keys, item.strings.reduce((out, s, k) => `${out}{${k - 1}}${s}`), where);
      } else if (item.strings.length === 1) {
        if (looksLikeText(item.strings[0])) add(maybe, item.strings[0], where);
      } else if (!item.tag && looksLikeText(item.strings.join(" "))) {
        loose.push({ where, text: item.strings.reduce((out, s, k) => `${out}{${k - 1}}${s}`) });
      }
    }
  }
  // Textos fijos de index.html (pestañas, etiquetas): se traducen al arrancar.
  const page = fs.readFileSync(path.join(ROOT, "index.html"), "utf8").replace(/^[\s\S]*<body[^>]*>/, "").replace(/<(script|style)[\s\S]*?<\/\1>/g, "");
  translateSource([page], (key) => (add(keys, key, "index.html"), null));
  return { keys, maybe, loose };
}

async function dictionary(code) {
  const file = path.join(ROOT, "js/i18n", `${code}.js`);
  if (!fs.existsSync(file)) return null;
  return (await import(pathToFileURL(file).href)).default;
}

/** Textos que no se traducen: los que están en este archivo (uno por línea). */
function ignored() {
  const file = path.join(ROOT, "tools/i18n-ignore.txt");
  return new Set(fs.existsSync(file) ? fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean) : []);
}

export async function report() {
  const { keys, maybe, loose } = collect();
  const skip = ignored();
  const all = new Map([...keys, ...[...maybe].filter(([k]) => !keys.has(k))].filter(([k]) => !skip.has(k)));
  const missing = {};
  const unused = {};
  for (const code of Object.keys(LANGUAGES)) {
    if (code === "es") continue;
    const entries = await dictionary(code);
    missing[code] = entries ? [...all.keys()].filter((k) => !(k in entries)) : null;
    unused[code] = entries ? Object.keys(entries).filter((k) => !all.has(k)) : [];
  }
  return { all, keys, maybe, loose, missing, unused };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, arg] = process.argv.slice(2);
  const r = await report();
  if (mode === "keys") console.log(JSON.stringify([...r.all.keys()], null, 0));
  else if (mode === "where") for (const [k, w] of r.all) console.log(`${w[0]}\t${JSON.stringify(k)}`);
  else if (mode === "missing") console.log(JSON.stringify(r.missing[arg] || [...r.all.keys()], null, 0));
  else if (mode === "unused") console.log(JSON.stringify(r.unused[arg] || [], null, 0));
  else if (mode === "loose") for (const l of r.loose) console.log(`${l.where}\t${l.text}`);
  else {
    console.log(`claves: ${r.all.size} (templates ${r.keys.size}, textos sueltos ${[...r.all.keys()].filter((k) => !r.keys.has(k)).length})`);
    console.log(`textos con variables sin etiqueta msg: ${r.loose.length}`);
    for (const code of Object.keys(r.missing)) console.log(`${code}: ${r.missing[code] ? `faltan ${r.missing[code].length}, sobran ${r.unused[code].length}` : "sin diccionario"}`);
  }
}
