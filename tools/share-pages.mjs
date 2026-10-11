// Páginas para compartir la app en cada idioma: /en/, /pt/, /tr/, /ru/, /ja/, /ar/, /en-gb/.
//
//   node tools/share-pages.mjs
//
// WhatsApp, Telegram y las redes arman la vista previa de un enlace leyendo la
// página tal cual, sin ejecutarla, así que no ven las traducciones de la app.
// Cada una de estas páginas trae el título y la descripción ya escritos en su
// idioma y lleva a la app, que se abre en ese idioma (?lang=…).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://neko-finanzas.vercel.app";

const PAGES = {
  en: { lang: "en", locale: "en_US", title: "Your money, clear", open: "Open Neko Finanzas", free: "No account, no ads, free." },
  "en-gb": { lang: "en-GB", app: "en-GB", locale: "en_GB", title: "Your money, clear", open: "Open Neko Finanzas", free: "No account, no ads, free." },
  pt: { lang: "pt-BR", locale: "pt_BR", title: "Seu dinheiro, com clareza", open: "Abrir o Neko Finanzas", free: "Sem conta, sem anúncios, grátis." },
  tr: { lang: "tr", locale: "tr_TR", title: "Paran, açık ve net", open: "Neko Finanzas'ı aç", free: "Hesap yok, reklam yok, ücretsiz." },
  ru: { lang: "ru", locale: "ru_RU", title: "Ваши деньги — наглядно", open: "Открыть Neko Finanzas", free: "Без учётной записи, без рекламы, бесплатно." },
  ja: { lang: "ja", locale: "ja_JP", title: "あなたのお金を、わかりやすく", open: "Neko Finanzas を開く", free: "アカウント不要、広告なし、無料。" },
  ar: { lang: "ar", locale: "ar_EG", dir: "rtl", title: "أموالك، بوضوح", open: "افتح Neko Finanzas", free: "بلا حساب، بلا إعلانات، مجانًا." },
};

const esc = (text) => text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

for (const [slug, page] of Object.entries(PAGES)) {
  const code = page.app || slug;
  // La descripción es la misma que se ve al instalar (manifest del idioma).
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, `manifest.${code}.json`), "utf8"));
  const description = `${manifest.description} ${page.free}`;
  const target = `/?lang=${code}`;
  const html = `<!doctype html>
<html lang="${page.lang}"${page.dir ? ` dir="${page.dir}"` : ""}>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Neko Finanzas — ${esc(page.title)}</title>
<meta name="description" content="${esc(description)}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Neko Finanzas" />
<meta property="og:title" content="Neko Finanzas — ${esc(page.title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:url" content="${SITE}/${slug}/" />
<meta property="og:locale" content="${page.locale}" />
<meta property="og:image" content="${SITE}/img/icon-512.png" />
<meta property="og:image:width" content="512" />
<meta property="og:image:height" content="512" />
<meta name="twitter:card" content="summary" />
<meta name="theme-color" content="#0898ba" />
<link rel="icon" type="image/png" sizes="32x32" href="/img/favicon-32.png" />
<link rel="canonical" href="${SITE}/" />
<meta http-equiv="refresh" content="0; url=${target}" />
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f5f3ee; color: #1d2b33; font-family: system-ui, sans-serif; text-align: center; padding: 24px; box-sizing: border-box; }
  img { width: 96px; height: 96px; border-radius: 24px; }
  h1 { font-size: 1.5rem; margin: 16px 0 8px; }
  p { max-width: 34rem; line-height: 1.5; margin: 0 auto 20px; }
  a { display: inline-block; padding: 12px 22px; border-radius: 999px; background: #0898ba; color: #fff; font-weight: 700; text-decoration: none; }
</style>
</head>
<body>
<main>
  <img src="/img/icon-192.png" alt="" />
  <h1>Neko Finanzas</h1>
  <p>${esc(description)}</p>
  <a href="${target}">${esc(page.open)}</a>
</main>
</body>
</html>
`;
  fs.mkdirSync(path.join(ROOT, slug), { recursive: true });
  fs.writeFileSync(path.join(ROOT, slug, "index.html"), html);
}
console.log("páginas:", Object.keys(PAGES).join(", "));
