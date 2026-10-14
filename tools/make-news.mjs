// ------------------------------------------------------------
// Makes news-data/news.json: headlines about books, comics and manga
// from a few chosen sites' public feeds (links only).
// ------------------------------------------------------------
// Run by GitHub once a day (.github/workflows/news.yml), or by pressing
// "Run workflow" on the Actions tab. Visitors never contact the news
// sites for headlines; the site only reads news-data/news.json.
//
// Per item we keep ONLY: the headline, which source, the date, the link
// and (where the source allows it, see `images`) the web address of the
// feed's own thumbnail. Never article text, summaries or picture files.
//
// Each source was checked in October 2026 (terms of use, robots.txt):
// see SOURCES. Feeds are fetched at most once a run (once a day), with a
// User-Agent naming reddle.org and hello@reddle.org, and only when the
// site's robots.txt allows it.
//
// Rules: newest 60 per universe, nothing older than 30 days, duplicates
// (same link, or a near identical headline) removed, adult items and off
// topic items dropped. If a feed fails, that source's old items stay.
//
// Local test: NEWS_FEEDS=http://localhost:8803 node tools/make-news.mjs
// (every feed and robots.txt address is then asked from that server).
// ------------------------------------------------------------

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import vm from "node:vm";

const OUT_DIR = "news-data";
const OUT = OUT_DIR + "/news.json";
const USER_AGENT = "ReddleNews/1.0 (+https://reddle.org; hello@reddle.org)";
const NOW = process.env.NOW ? new Date(process.env.NOW) : new Date();
const MAX_AGE_DAYS = 30;
const PER_UNIVERSE = 60;
const TEST_SERVER = process.env.NEWS_FEEDS || ""; // stand-in feeds for testing
// Testing only: turn thumbnails on for these sources (comma separated ids).
const TEST_IMAGES = (process.env.NEWS_IMAGES || "").split(",").filter(Boolean);

// The sources. `universes`: which universes its items may go to.
// `topic`:
//   "always": everything they publish is about this universe's world
//             (keywords may still move an item to another universe);
//   "keywords": a mixed site (games, toys, culture...): an item needs a
//             books, comics or manga keyword, otherwise it's dropped.
// `images`: may we show the feed's own thumbnails? Only when the terms
// clearly allow it. None of them did (October 2026), so all false; the
// cards show a plain tile with the source's first letter instead.
const SOURCES = [
  // Books
  { id: "lithub", name: "Literary Hub", site: "https://lithub.com", feed: "https://lithub.com/feed/", universe: "books", universes: ["books", "comics"], topic: "always", images: false },
  { id: "electric", name: "Electric Literature", site: "https://electricliterature.com", feed: "https://electricliterature.com/feed/", universe: "books", universes: ["books", "comics"], topic: "always", images: false },
  { id: "conversation", name: "The Conversation", site: "https://theconversation.com", feed: "https://theconversation.com/us/arts/articles.atom", universe: "books", universes: ["books"], topic: "keywords", images: false },
  // Comics
  { id: "beat", name: "The Beat", site: "https://www.comicsbeat.com", feed: "https://www.comicsbeat.com/feed/", universe: "comics", universes: ["manga", "comics"], topic: "keywords", images: false },
  { id: "tcj", name: "The Comics Journal", site: "https://www.tcj.com", feed: "https://www.tcj.com/feed/", universe: "comics", universes: ["manga", "comics"], topic: "always", images: false },
  // Manga
  { id: "ann", name: "Anime News Network", site: "https://www.animenewsnetwork.com", feed: "https://www.animenewsnetwork.com/news/rss.xml", universe: "manga", universes: ["manga", "comics", "books"], topic: "keywords", images: false },
  { id: "animecorner", name: "Anime Corner", site: "https://animecorner.me", feed: "https://animecorner.me/feed/", universe: "manga", universes: ["manga", "comics", "books"], topic: "keywords", images: false },
  { id: "otakuusa", name: "Otaku USA", site: "https://otakuusamagazine.com", feed: "https://otakuusamagazine.com/feed/", universe: "manga", universes: ["manga", "comics", "books"], topic: "keywords", images: false },
];

// Keywords (whole words, headline and the feed's categories).
const MANGA_WORDS = /\b(manga|mangaka|manhwa|manhua|webtoons?|shonen|sh[oō]nen|shojo|sh[oō]jo|seinen|josei|(?:tv |anime )?anime (?:adaptation|film|series|season)|gets (?:tv )?anime|anime (?:announced|green-lit|greenlit)|tv anime)\b/i;
const COMICS_WORDS = /\b(comics?|comic books?|graphic novels?|cartoonists?|webcomics?|superheroes|superhero|bandes? dessin[ée]es?)\b|#\d+\b/i; // "#1" = a comic issue
const BOOK_WORDS = /\b(books?|novels?|novella|novelists?|authors?|writers?|poets?|poetry|poems?|literary|literature|publish(?:er|ers|ing|ed)?|memoirs?|librar(?:y|ies|ians?)|bookstores?|bookshops?|bestsell(?:er|ers|ing)|fiction|nonfiction|light novels?|booker|pulitzer|nobel|banned books?|book bans?|adapted from)\b/i;

// The site's own adult filter (js/sources.js), so the rules match.
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
vm.runInContext(readFileSync("js/sources.js", "utf8") + "\nthis.site = { looksAdult };", context);
const looksAdult = context.site.looksAdult;


// ---------- Fetching (politely) ----------

// In tests, every address goes to the stand-in server instead.
function address(url) {
  if (!TEST_SERVER) return url;
  const original = new URL(url);
  return TEST_SERVER.replace(/\/$/, "") + "/" + original.hostname + original.pathname + original.search;
}

async function getText(url) {
  const response = await fetch(address(url), {
    headers: { "User-Agent": USER_AGENT, "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, text/plain, */*" },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error("answered " + response.status);
  return response.text();
}

// May we fetch this path, by the site's robots.txt? Rules for "*" and for
// us ("ReddleNews"); the longest matching rule wins, Allow on a tie. No
// robots.txt (or none found) means allowed.
async function robotsAllow(url) {
  const target = new URL(url);
  let text = "";
  try {
    text = await getText(target.origin + "/robots.txt");
  } catch (error) {
    return true;
  }
  const rules = [];
  let agents = [];
  let inRules = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const match = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!match) continue;
    const field = match[1].toLowerCase();
    const value = match[2].trim();
    if (field === "user-agent") {
      if (inRules) { agents = []; inRules = false; }
      agents.push(value.toLowerCase());
    } else if (field === "allow" || field === "disallow") {
      inRules = true;
      if (agents.some((agent) => agent === "*" || agent.startsWith("reddlenews")) && value) {
        rules.push({ allow: field === "allow", path: value, mine: agents.some((agent) => agent.startsWith("reddlenews")) });
      }
    }
  }
  const path = target.pathname + target.search;
  // Rules naming us replace the "*" ones.
  const mine = rules.some((rule) => rule.mine) ? rules.filter((rule) => rule.mine) : rules;
  let best = null;
  for (const rule of mine) {
    const pattern = new RegExp("^" + rule.path.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"));
    if (!pattern.test(path)) continue;
    if (!best || rule.path.length > best.path.length || (rule.path.length === best.path.length && rule.allow)) best = rule;
  }
  return !best || best.allow;
}


// ---------- Reading RSS and Atom ----------

function decode(text) {
  return String(text || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function tag(block, name) {
  const match = block.match(new RegExp("<" + name + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + name + ">", "i"));
  return match ? match[1] : "";
}

function attribute(element, name) {
  const match = element.match(new RegExp("\\s" + name + "\\s*=\\s*[\"']([^\"']*)[\"']", "i"));
  return match ? decode(match[1]) : "";
}

// The feed's own thumbnail, if it gives one: media:thumbnail, an image
// media:content, or an image enclosure. https only.
function thumbnail(block) {
  const candidates = [];
  for (const element of block.match(/<media:thumbnail\b[^>]*>/gi) || []) candidates.push(attribute(element, "url"));
  for (const element of block.match(/<media:content\b[^>]*>/gi) || []) {
    const type = attribute(element, "type");
    const medium = attribute(element, "medium");
    if (medium === "image" || type.startsWith("image/") || (!type && /\.(jpe?g|png|webp|gif)(\?|$)/i.test(attribute(element, "url")))) candidates.push(attribute(element, "url"));
  }
  for (const element of block.match(/<enclosure\b[^>]*>/gi) || []) {
    if (attribute(element, "type").startsWith("image/")) candidates.push(attribute(element, "url"));
  }
  return candidates.find((url) => /^https:\/\/[^\s"<>]+$/.test(url)) || null;
}

function parseFeed(xml) {
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) || xml.match(/<entry\b[\s\S]*?<\/entry>/gi) || [];
  return blocks.map(function (block) {
    let link = decode(tag(block, "link"));
    if (!link) {
      const links = block.match(/<link\b[^>]*>/gi) || [];
      const alternate = links.find((element) => !/rel=["'](?!alternate)/i.test(element)) || links[0] || "";
      link = attribute(alternate, "href");
    }
    const date = decode(tag(block, "pubDate") || tag(block, "published") || tag(block, "updated") || tag(block, "dc:date"));
    const categories = (block.match(/<category\b[^>]*?(?:\/>|>[\s\S]*?<\/category>)/gi) || [])
      .map((element) => decode(element.replace(/^<category\b[^>]*?(\/>|>)/i, "").replace(/<\/category>$/i, "")) || attribute(element, "term"));
    return { title: decode(tag(block, "title")), link: link, date: date, categories: categories, image: thumbnail(block) };
  });
}


// ---------- Filtering ----------

// "books", "comics", "manga", or null (off topic).
// Keywords first (manga, then comics, then books), but only universes
// the source covers; then the source's own universe for "always" sites.
function universeOf(item, source) {
  const text = [item.title].concat(item.categories).join(" \u00b7 ");
  const words = { manga: MANGA_WORDS, comics: COMICS_WORDS, books: BOOK_WORDS };
  for (const universe of ["manga", "comics", "books"]) {
    if (source.universes.includes(universe) && words[universe].test(text)) return universe;
  }
  return source.topic === "always" ? source.universe : null;
}

// Same link: without tracking parameters, "www.", "https" or a trailing slash.
function linkKey(link) {
  try {
    const url = new URL(link);
    for (const name of [...url.searchParams.keys()]) if (/^(utm_|fbclid|gclid|ref$)/i.test(name)) url.searchParams.delete(name);
    return url.hostname.replace(/^www\./, "") + url.pathname.replace(/\/+$/, "") + (url.search || "");
  } catch (error) {
    return link;
  }
}

function headlineWords(title) {
  return String(title).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
}

// Near identical: the same words, or 90% of them shared (5+ words).
function sameHeadline(a, b) {
  const x = headlineWords(a);
  const y = headlineWords(b);
  if (x.join(" ") === y.join(" ")) return true;
  if (x.length < 5 || y.length < 5) return false;
  const setX = new Set(x);
  const setY = new Set(y);
  const shared = [...setX].filter((word) => setY.has(word)).length;
  return shared / Math.max(setX.size, setY.size) >= 0.9;
}


// ---------- Putting it together ----------

function readOld() {
  try {
    return existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};
  } catch (error) {
    return {};
  }
}

async function main() {
  const old = readOld();
  const oldItems = Array.isArray(old.items) ? old.items : [];
  const oldest = new Date(NOW.getTime() - MAX_AGE_DAYS * 864e5);
  const fresh = [];
  const report = {};

  for (const source of SOURCES) {
    const counts = { fetched: 0, kept: 0, dropped_adult: 0, dropped_topic: 0, dropped_old: 0, status: "ok" };
    report[source.id] = counts;
    try {
      if (!(await robotsAllow(source.feed))) throw new Error("robots.txt doesn't allow the feed");
      const items = parseFeed(await getText(source.feed));
      if (items.length === 0) throw new Error("no items in the feed");
      for (const item of items) {
        counts.fetched++;
        if (!item.title || !/^https?:\/\//.test(item.link)) continue;
        if (looksAdult([item.title].concat(item.categories))) { counts.dropped_adult++; continue; }
        const universe = universeOf(item, source);
        if (!universe) { counts.dropped_topic++; continue; }
        const when = new Date(item.date);
        const date = isNaN(when) ? NOW : when > NOW ? NOW : when;
        if (date < oldest) { counts.dropped_old++; continue; }
        fresh.push({
          t: item.title.slice(0, 220),
          s: source.id,
          d: date.toISOString(),
          u: item.link.replace(/^http:\/\//, "https://"),
          i: source.images || TEST_IMAGES.includes(source.id) ? item.image : null,
          v: universe,
        });
        counts.kept++;
      }
    } catch (error) {
      counts.status = "failed (" + error.message + "): kept its old items";
    }
    // This source's earlier items stay until they're 30 days old (a feed
    // only shows its latest few). A failed feed keeps them all.
    for (const item of oldItems) {
      if (item.s === source.id && new Date(item.d) >= oldest) fresh.push(Object.assign({}, item, { i: source.images || TEST_IMAGES.includes(source.id) ? item.i : null }));
    }
  }

  // Newest first, then duplicates out (the first, newest, copy stays).
  fresh.sort((a, b) => b.d.localeCompare(a.d) || a.u.localeCompare(b.u));
  const kept = [];
  const seenLinks = new Set();
  for (const item of fresh) {
    const key = linkKey(item.u);
    if (seenLinks.has(key)) continue;
    if (kept.some((other) => other.v === item.v && sameHeadline(other.t, item.t))) continue;
    seenLinks.add(key);
    kept.push(item);
  }
  // Newest 60 per universe.
  const perUniverse = { books: 0, comics: 0, manga: 0 };
  const items = kept.filter((item) => ++perUniverse[item.v] <= PER_UNIVERSE);

  // The log: what each source gave, and the totals.
  for (const source of SOURCES) {
    const counts = report[source.id];
    const inFile = items.filter((item) => item.s === source.id).length;
    console.log(source.name + ": " + counts.status + " | in feed " + counts.fetched + ", new kept " + counts.kept +
      ", off topic " + counts.dropped_topic + ", adult " + counts.dropped_adult + ", too old " + counts.dropped_old + " | in the file now " + inFile);
  }
  const byUniverse = { books: 0, comics: 0, manga: 0 };
  items.forEach((item) => byUniverse[item.v]++);
  console.log("Items per universe: " + JSON.stringify(byUniverse));

  if (items.length === 0 && oldItems.length > 0) {
    console.log("Nothing at all came back; keeping the old file.");
    return;
  }
  const data = {
    made: NOW.toISOString().slice(0, 10),
    sources: Object.fromEntries(SOURCES.map((source) => [source.id, { name: source.name, site: source.site }])),
    items: items,
  };
  if (JSON.stringify(old.items) === JSON.stringify(data.items) && JSON.stringify(old.sources) === JSON.stringify(data.sources)) {
    console.log("No change.");
    return;
  }
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR);
  writeFileSync(OUT, JSON.stringify(data) + "\n");
  console.log("Wrote " + OUT + ".");
}

main().catch(function (error) {
  console.log("Couldn't make the news file: " + error.message + ". Keeping the old one.");
});
