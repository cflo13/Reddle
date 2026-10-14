// ------------------------------------------------------------
// Book to screen: films and TV series based on books, comics and manga
// ------------------------------------------------------------
// The data comes from Wikidata (free, CC0). Visitors never ask Wikidata
// themselves: every day GitHub runs tools/make-adaptations.mjs
// (.github/workflows/adaptations.yml), which saves small files in
// screen-data/:
//
//   screen-data/adaptations-00.json ... -63.json
//       Every film or series, filed under its book. A book is found by
//       its Open Library work id ("OL45804W") or, as a fallback, by its
//       exact title and author ("t:thehobbit|jrrtolkien"). The keys are
//       spread over 64 small files (screenShard()), so a book page only
//       downloads one or two of them.
//       Each item: { q: Wikidata id, t: title, y: year, k: "film" | "tv",
//                    w: Wikipedia link (or null) }
//   screen-data/upcoming.json
//       { made, upcoming: [...], recent: [...] }: releases from today on
//       (soonest first; then announced ones without a date) and the last
//       12 months (newest first). Each has its source book
//       { title, author, ol, cover, genres }.
//
// Text only: no posters, no logos. This file is also loaded by the
// GitHub script, so the keys and the file numbers always match.
// Loaded with js/books.js, after js/universe-seeds.js (plainWords).
// ------------------------------------------------------------

const SCREEN_SHARDS = 64;
const SCREEN_FOLDER = "screen-data/";

// The site version (from this script's own ?v=), so a new version
// fetches the files fresh; the service worker keeps a copy and refreshes
// it in the background (so the daily updates arrive too).
const SCREEN_VERSION = (function () {
  try {
    return new URL(document.currentScript.src).searchParams.get("v") || "";
  } catch (error) {
    return "";
  }
})();

// "The Hobbit" by "J. R. R. Tolkien" -> "t:thehobbit|jrrtolkien".
function screenTitleKey(title, author) {
  const a = plainWords(title, true);
  const b = plainWords(author, true);
  return a && b ? "t:" + a + "|" + b : null;
}

// Which of the 64 files a key lives in: "00" to "63" (FNV-1a hash).
function screenShard(key) {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return String(hash % SCREEN_SHARDS).padStart(2, "0");
}

function screenFile(name) {
  return SCREEN_FOLDER + name + (SCREEN_VERSION ? "?v=" + SCREEN_VERSION : "");
}

const screenShardFiles = new Map(); // one download per file per page

function loadScreenShard(number) {
  if (!screenShardFiles.has(number)) {
    screenShardFiles.set(number, fetch(screenFile("adaptations-" + number + ".json"))
      .then((response) => (response.ok ? response.json() : {}))
      .catch(() => ({})));
  }
  return screenShardFiles.get(number);
}

let upcomingFile = null;

function loadUpcoming() {
  if (!upcomingFile) {
    upcomingFile = fetch(screenFile("upcoming.json"))
      .then((response) => (response.ok ? response.json() : {}))
      .catch(() => ({}));
  }
  return upcomingFile;
}

// The films and series based on this book: by its Open Library work id
// first, otherwise by exact title and author. Oldest first.
// `book` needs external_id, title and author.
async function findAdaptations(book) {
  const byId = /^OL\d+W$/.test(book.external_id || "") ? book.external_id : null;
  const byTitle = screenTitleKey(book.title, String(book.author || "").split(",")[0]);
  let items = [];
  if (byId) items = (await loadScreenShard(screenShard(byId)))[byId] || [];
  if (items.length === 0 && byTitle) items = (await loadScreenShard(screenShard(byTitle)))[byTitle] || [];
  return items.slice().sort((a, b) => (a.y || 9999) - (b.y || 9999));
}

// "Film" or "TV series".
function screenKindName(kind) {
  return kind === "tv" ? "TV series" : "Film";
}

const SCREEN_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// A date as precise as Wikidata knows it: "5 March 2027", "March 2027"
// or "2027". `precision` is Wikidata's: 11 day, 10 month, 9 year.
function screenDateText(date, precision) {
  if (!date) return "";
  const [year, month, day] = date.split("-").map(Number);
  if (precision >= 11) return day + " " + SCREEN_MONTHS[month - 1] + " " + year;
  if (precision === 10) return SCREEN_MONTHS[month - 1] + " " + year;
  return String(year);
}

// Only links to Wikipedia articles or Wikidata pages (the data is
// public, so we never trust a link we didn't expect).
function safeScreenLink(link) {
  return /^https:\/\/[a-z-]+\.wikipedia\.org\/wiki\/[^\s"<>]+$/.test(link || "") ||
    /^https:\/\/www\.wikidata\.org\/wiki\/Q\d+$/.test(link || "")
    ? link
    : null;
}

// One film or series as a line of text: "The Hobbit: An Unexpected
// Journey · 2012 · Film", the title linking to its Wikipedia article.
function makeScreenLine(item) {
  const line = el("li", "screen-item");
  const link = safeScreenLink(item.w);
  const title = link ? el("a", "screen-title", item.t) : el("span", "screen-title", item.t);
  if (link) {
    title.href = link;
    title.target = "_blank";
    title.rel = "noopener noreferrer";
  }
  line.appendChild(title);
  const facts = [item.y, screenKindName(item.k)].filter(Boolean).join(" · ");
  line.appendChild(el("span", "screen-facts", " · " + facts));
  return line;
}
