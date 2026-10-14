// ------------------------------------------------------------
// Makes seeds-resolved.json: the curated comics and manga titles
// (js/universe-seeds.js), each matched to one real Open Library book.
// ------------------------------------------------------------
// Run by GitHub once a week (.github/workflows/seeds.yml), or by pressing
// "Run workflow" on the Actions tab. For every seed title it asks Open
// Library (title + creator, and title alone), and of the results that pass
// the SAME rules as the site (the title matches in whole words, the
// creator matches, and our strict comics/manga rules in js/sources.js put
// it in that universe) keeps the best one: the exact title or volume 1
// first, never a spin-off (anime guides, cookbooks, film books) if a real
// volume passed too. The site then reads this one file instead of
// searching for each title (which made Comics and Manga pages slow).
//
// Saved per book: external_id, title, author, cover_url, isbns, genres.
// Never descriptions. Google Books isn't used here: its terms don't allow
// keeping copies of its data, and this file is a stored copy.
// Titles that don't match are skipped and listed in the log. If Open
// Library can't be reached, the old file is kept.
//
// Local test: OPEN_LIBRARY=http://localhost:8800 node tools/resolve-seeds.mjs
// ------------------------------------------------------------

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import vm from "node:vm";

const OUT = "seeds-resolved.json";
const OPEN_LIBRARY = (process.env.OPEN_LIBRARY || "https://openlibrary.org").replace(/\/$/, "");
const PAUSE_MS = Number(process.env.PAUSE_MS || 700); // be polite: about one request a second
const USER_AGENT = "Reddle seed lists (https://reddle.org; hello@reddle.org)";

// Load the site's own rules and lists, so the matching is identical.
const context = {
  console,
  URL,
  document: { documentElement: { getAttribute: () => "books" }, querySelectorAll: () => [], currentScript: null },
  UNIVERSES: { books: { noun: "books" }, comics: { noun: "comics" }, manga: { noun: "manga" } },
  currentUniverse: () => "books",
  sessionStorage: { getItem: () => null, setItem: () => {} },
  GOOGLE_BOOKS_KEY: "",
};
vm.createContext(context);
vm.runInContext(
  readFileSync("js/sources.js", "utf8") + "\n" + readFileSync("js/universe-seeds.js", "utf8") +
    "\nthis.site = { UNIVERSE_SEEDS, OPEN_LIBRARY_FIELDS, openLibraryDocToBook, fitsUniverse, sameTitle, sameCreator, plainWords };",
  context
);
const site = context.site;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let requests = 0;
let failures = 0;

// One Open Library search; null when the request failed (tried twice).
async function search(params) {
  const url = OPEN_LIBRARY + "/search.json?limit=10&sort=editions&fields=" + site.OPEN_LIBRARY_FIELDS + "&" + new URLSearchParams(params);
  for (let attempt = 1; attempt <= 2; attempt++) {
    requests++;
    try {
      const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
      if (response.ok) return await response.json();
      if (response.status < 500 && response.status !== 429) return { docs: [] };
    } catch (error) {
      // network trouble: wait and try once more
    }
    await sleep(PAUSE_MS * 4);
  }
  failures++;
  return null;
}

// Books about a series rather than the series itself.
const SPIN_OFF = /\b(anime|animanga|ani manga|cinemanga|profiles?|guide|guidebook|companion|art of|artbook|art book|kitchen|cook ?book|abridged|coloring|colouring|sticker|friends and foes|thank you|making of|novel|novelization|film|movie)\b/;

// How good a match is: higher is better. The exact title (or volume 1)
// beats a later volume; a spin-off is never picked.
function score(title, seed) {
  const found = site.plainWords(title);
  const wanted = site.plainWords(seed.t);
  const rest = (found.startsWith(wanted) ? found.slice(wanted.length).trim() : found)
    .replace(/\bone\b/g, "1").replace(/\btwo\b/g, "2").replace(/\bthree\b/g, "3");
  if (SPIN_OFF.test(rest)) return -10;
  if (found === wanted) return 5;
  const number = rest.match(/(?:^|\b)(?:vol(?:ume)?|book|tome|part|no)?\s*0*(\d+)\b/);
  if (!number) return 3; // a subtitle, a deluxe or complete edition
  if (number[1] === "1") return 4;
  return 1 - Math.min(Number(number[1]), 999) / 1000; // later volumes, lower numbers first
}

// The best result that passes every rule, in our saved shape, or null.
function pick(docs, seed, universe) {
  let best = null;
  for (const doc of docs) {
    const book = site.openLibraryDocToBook(doc);
    const names = (doc.author_name || []).concat(doc.author_alternative_name || []);
    if (!/^OL\d+W$/.test(book.externalId)) continue;
    if (!site.sameTitle(book.title, seed.t) || !site.sameCreator(names, seed)) continue;
    if (!site.fitsUniverse(book, universe)) continue;
    const points = score(book.title, seed) + (book.coverId ? 0.5 : 0);
    if (points < 0) continue; // a spin-off
    if (best && best.points >= points) continue; // ties: Open Library's order (most editions) wins
    best = {
      points,
      book: {
        external_id: book.externalId,
        title: book.title,
        author: (doc.author_name || [])[0] || seed.c[0],
        cover_url: book.coverId ? "https://covers.openlibrary.org/b/id/" + book.coverId + "-M.jpg?default=false" : null,
        isbns: (book.isbns || []).slice(0, 2),
        // the site's genres for this book, plus the seed's own genres
        genres: [...new Set([...book.genres, ...seed.g])],
        seed: seed.t,
      },
    };
  }
  return best && best.book;
}

const result = {};
const missed = {};
for (const universe of ["comics", "manga"]) {
  result[universe] = [];
  missed[universe] = [];
  for (const seed of site.UNIVERSE_SEEDS[universe]) {
    // Both searches: some creators are only filed under another spelling
    // or script, and the title alone often finds volume 1.
    const docs = [];
    for (const params of [{ title: seed.t, author: seed.c[0] }, { title: seed.t }]) {
      const data = await search(params);
      docs.push(...((data && data.docs) || []));
      await sleep(PAUSE_MS);
    }
    const found = pick(docs, seed, universe);
    if (found && !result[universe].some((other) => other.external_id === found.external_id)) {
      result[universe].push(found);
    } else if (!found) {
      missed[universe].push(seed.t + " (" + seed.c[0] + ")");
    }
  }
}

console.log("Open Library requests:", requests, "| failed:", failures);
for (const universe of ["comics", "manga"]) {
  console.log(universe + ": " + result[universe].length + " of " + site.UNIVERSE_SEEDS[universe].length + " matched");
  if (missed[universe].length) console.log("  not matched (skipped): " + missed[universe].join("; "));
}

// Open Library unreachable (most requests failed): keep the old file.
if (failures > requests / 4 || (result.comics.length === 0 && result.manga.length === 0)) {
  console.log("Open Library didn't answer well enough; keeping the old " + OUT + ".");
  process.exit(0);
}

// Only write when the books changed (so the weekly run doesn't commit
// just because the date moved).
const old = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};
const same = JSON.stringify({ comics: old.comics, manga: old.manga }) === JSON.stringify({ comics: result.comics, manga: result.manga });
if (same) {
  console.log("No change.");
} else {
  writeFileSync(OUT, JSON.stringify({ made: new Date().toISOString().slice(0, 10), comics: result.comics, manga: result.manga }, null, 1) + "\n");
  console.log("Wrote " + OUT + ".");
}
