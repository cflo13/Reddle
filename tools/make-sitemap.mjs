// ------------------------------------------------------------
// Makes sitemap.xml: the list of Reddle pages for search engines.
// ------------------------------------------------------------
// Run by GitHub every day (.github/workflows/sitemap.yml), so nobody has
// to do anything. It lists:
//   - the main pages (home, genres, popular, about, privacy, terms)
//   - all 31 genre pages (from GENRES in js/sources.js, including comics and manga)
//   - up to 500 books readers have logged on Reddle, most logged first
//     (asked from Supabase with the public key in js/config.js, so it only
//     sees what any visitor sees; private profiles' books aren't counted)
// Book links use book.html?id=..., not book/..., because GitHub Pages
// answers clean addresses with a "not found" code, which search engines
// skip. Profiles aren't listed, on purpose.
// If Supabase can't be reached, the books from the old sitemap are kept.
// ------------------------------------------------------------

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const SITE = "https://reddle.org/";
const MAX_BOOKS = 500;

const config = readFileSync("js/config.js", "utf8");
const supabaseUrl = (process.env.SUPABASE_URL || config.match(/SUPABASE_URL\s*=\s*"([^"]+)"/)[1]).replace(/\/$/, "");
const supabaseKey = config.match(/SUPABASE_KEY\s*=\s*"([^"]+)"/)[1];

const genres = [...readFileSync("js/sources.js", "utf8").matchAll(/\{ slug: "([a-z_]+)"/g)].map((m) => m[1]);

function escapeXml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function loggedBooks() {
  const url = supabaseUrl + "/rest/v1/books_with_stats?select=external_id,log_count" +
    "&log_count=gt.0&order=log_count.desc,id.asc&limit=" + MAX_BOOKS;
  const response = await fetch(url, { headers: { apikey: supabaseKey, Authorization: "Bearer " + supabaseKey } });
  if (!response.ok) throw new Error("Supabase answered " + response.status);
  const rows = await response.json();
  return rows.map((row) => row.external_id).filter((id) => /^(OL\d+W|GB[A-Za-z0-9_-]{6,20})$/.test(id));
}

let books;
try {
  books = await loggedBooks();
  console.log("Books from Supabase:", books.length);
} catch (error) {
  console.log("Couldn't reach Supabase (" + error.message + "); keeping the books from the old sitemap.");
  const old = existsSync("sitemap.xml") ? readFileSync("sitemap.xml", "utf8") : "";
  books = [...old.matchAll(/book\.html\?id=(OL\d+W|GB[A-Za-z0-9_-]{6,20})/g)].map((m) => m[1]);
}

const pages = [
  ["", "daily", "1.0"],
  ["popular.html", "daily", "0.8"],
  ["picks.html", "weekly", "0.6"],
  ["screen.html", "daily", "0.7"],
  ["news.html", "daily", "0.6"],
  ["prompt.html", "weekly", "0.6"],
  ["genres.html", "weekly", "0.8"],
  ...genres.map((slug) => ["genre.html?g=" + slug, "weekly", "0.6"]),
  ...books.map((id) => ["book.html?id=" + id, "weekly", "0.5"]),
  ["about.html", "monthly", "0.3"],
  ["privacy.html", "yearly", "0.2"],
  ["terms.html", "yearly", "0.2"],
  ["deleteaccount.html", "yearly", "0.2"],
];

const xml =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  pages.map(([path, often, priority]) =>
    `  <url><loc>${escapeXml(SITE + path)}</loc><changefreq>${often}</changefreq><priority>${priority}</priority></url>`
  ).join("\n") +
  "\n</urlset>\n";

writeFileSync("sitemap.xml", xml);
console.log("sitemap.xml written with", pages.length, "pages.");
