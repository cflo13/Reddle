// ------------------------------------------------------------
// Makes the Book to screen files (screen-data/): films and TV series
// based on books, comics and manga, from Wikidata.
// ------------------------------------------------------------
// Run by GitHub every day (.github/workflows/adaptations.yml), or by
// pressing "Run workflow" on the Actions tab. Visitors never ask
// Wikidata themselves; the site only reads the files this makes (see
// js/screen-data.js for what's in them).
//
// Wikidata (https://www.wikidata.org) is free to reuse (CC0). Its query
// service asks for a User-Agent that says who we are and how to reach
// us, one query at a time, and patience when it says "slow down" (429,
// Retry-After). We send a few small queries instead of one big one (big
// ones run into its 60 second limit).
//
// Then, for the films coming soon or out in the last 12 months, Open
// Library tells us the source book's cover and subjects (for our genres,
// so Comics and Manga only show their own books, and the adult filter).
// Those lookups are remembered in upcoming.json for 30 days.
//
// If Wikidata can't be reached, or answers with much less than last
// time, the old files are kept.
//
// Local test: WIKIDATA=http://localhost:8801/sparql OPEN_LIBRARY=http://localhost:8800 node tools/make-adaptations.mjs
// ------------------------------------------------------------

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import vm from "node:vm";

const OUT = "screen-data";
const WIKIDATA = process.env.WIKIDATA || "https://query.wikidata.org/sparql";
const OPEN_LIBRARY = (process.env.OPEN_LIBRARY || "https://openlibrary.org").replace(/\/$/, "");
const PAUSE_MS = Number(process.env.PAUSE_MS || 1000);
const USER_AGENT = "ReddleBookToScreen/1.0 (https://reddle.org; hello@reddle.org) Node.js";
const TODAY = process.env.TODAY || new Date().toISOString().slice(0, 10);

// Load the site's own rules (genres, adult filter, title matching, the
// file numbering), so everything matches the site exactly.
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
  ["js/sources.js", "js/universe-seeds.js", "js/screen-data.js"].map((file) => readFileSync(file, "utf8")).join("\n") +
    "\nthis.site = { OPEN_LIBRARY_FIELDS, openLibraryDocToBook, looksAdult, sameTitle, sameCreator, screenTitleKey, screenShard, SCREEN_SHARDS };",
  context
);
const site = context.site;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));


// ---------- Wikidata ----------

// Films and series (Wikidata "instance of" values we accept).
const FILM_TYPES = {
  Q11424: "film", Q202866: "film", Q24869: "film", Q20650540: "film", Q506240: "film",
  Q5398426: "tv", Q581714: "tv", Q1259759: "tv", Q63952888: "tv", Q526877: "tv",
};
// Each query runs twice, once for films and once for series (half the
// work each, so they stay under Wikidata's 60 second limit).
const TYPE_GROUPS = ["film", "tv"].map((kind) =>
  "VALUES ?type { " + Object.keys(FILM_TYPES).filter((id) => FILM_TYPES[id] === kind).map((id) => "wd:" + id).join(" ") + " }");

// A film or series with "based on" (P144) something. Only works with an
// author (P50), a creator (P170, comics) or an Open Library id (P648)
// count as written works; that check happens below (asking Wikidata to
// do it made the query too slow). TYPES is replaced by a TYPE_GROUPS line.
const BASED_ON = "TYPES ?film wdt:P31 ?type ; wdt:P144 ?work .";
const ANY_BASED_ON = "TYPES ?film wdt:P31 ?type ; wdt:P144 [] .";

const QUERIES = {
  links: `SELECT DISTINCT ?film ?type ?work WHERE { ${BASED_ON} }`,
  filmLabels: `SELECT DISTINCT ?film ?label ?lang WHERE { ${ANY_BASED_ON} ?film rdfs:label ?label .
    BIND(LANG(?label) AS ?lang) FILTER(?lang IN ("en", "mul")) }`,
  wikipedia: `SELECT DISTINCT ?film ?article WHERE { ${ANY_BASED_ON}
    ?article schema:about ?film ; schema:isPartOf <https://en.wikipedia.org/> }`,
  released: `SELECT ?film ?date ?prec WHERE { ${ANY_BASED_ON}
    ?film p:P577/psv:P577 [ wikibase:timeValue ?date ; wikibase:timePrecision ?prec ] }`,
  started: `SELECT ?film ?date ?prec WHERE { ${ANY_BASED_ON}
    ?film p:P580/psv:P580 [ wikibase:timeValue ?date ; wikibase:timePrecision ?prec ] }`,
  announced: `SELECT ?film ?date ?prec WHERE { ${ANY_BASED_ON}
    ?film p:P6949/psv:P6949 [ wikibase:timeValue ?date ; wikibase:timePrecision ?prec ] }`,
  workLabels: `SELECT DISTINCT ?work ?label ?lang WHERE { ${BASED_ON} ?work rdfs:label ?label .
    BIND(LANG(?label) AS ?lang) FILTER(?lang IN ("en", "mul")) }`,
  workIds: `SELECT DISTINCT ?work ?ol WHERE { ${BASED_ON} ?work wdt:P648 ?ol . }`,
  authors: `SELECT DISTINCT ?work ?label ?lang WHERE { ${BASED_ON}
    ?work wdt:P50|wdt:P170 ?author . ?author rdfs:label ?label . BIND(LANG(?label) AS ?lang) FILTER(?lang IN ("en", "mul")) }`,
};

let wikidataQueries = 0;

// Runs one query (both halves) and returns its rows as plain
// { name: value } objects. Each half is tried up to 5 times (waiting
// longer each time, or as long as Wikidata asks). Throws if one never
// works.
async function ask(name) {
  const rows = [];
  for (const types of TYPE_GROUPS) rows.push(...(await askOnce(name, QUERIES[name].replace("TYPES", types))));
  console.log("Wikidata " + name + ": " + rows.length + " rows");
  return rows;
}

async function askOnce(name, query) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    wikidataQueries++;
    try {
      const response = await fetch(WIKIDATA, {
        method: "POST",
        headers: {
          "User-Agent": USER_AGENT,
          "Accept": "application/sparql-results+json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ query: query }),
        signal: AbortSignal.timeout(75000), // Wikidata stops queries after 60 s anyway
      });
      if (response.ok) {
        // A query that ran out of time sends broken JSON: that throws
        // here and counts as a failed try.
        const data = await response.json();
        await sleep(PAUSE_MS);
        return data.results.bindings.map(function (binding) {
          const row = {};
          for (const key in binding) row[key] = binding[key].value;
          return row;
        });
      }
      const wait = Number(response.headers.get("retry-after")) * 1000 || PAUSE_MS * 10 * attempt;
      console.log("Wikidata " + name + ": answered " + response.status + ", trying again in " + Math.round(wait / 1000) + " s");
      await sleep(wait);
    } catch (error) {
      // A cut-off answer (the 60 second limit) or no internet.
      console.log("Wikidata " + name + ": " + error.message.slice(0, 80) + ", trying again");
      await sleep(PAUSE_MS * 10 * attempt);
    }
  }
  throw new Error("Wikidata didn't answer the " + name + " query");
}

const qid = (link) => String(link).split("/").pop();

// English label first, else the language-neutral one ("mul").
function pickLabels(rows, idField) {
  const labels = new Map();
  for (const row of rows) {
    if (!row.label) continue;
    const id = qid(row[idField]);
    if (row.lang === "en" || !labels.has(id)) labels.set(id, row.label);
  }
  return labels;
}

// The earliest date of each film: { date: "2027-03-05", prec: 11 }.
function earliestDates(rows) {
  const dates = new Map();
  for (const row of rows) {
    const id = qid(row.film);
    const date = String(row.date).replace(/^\+/, "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const old = dates.get(id);
    if (!old || date < old.date) dates.set(id, { date: date, prec: Number(row.prec) });
  }
  return dates;
}

// The last day a date could mean ("2027" with year precision can be any
// day up to 31 December 2027).
function lastPossibleDay(found) {
  if (found.prec >= 11) return found.date;
  if (found.prec === 10) return found.date.slice(0, 8) + "31";
  return found.date.slice(0, 4) + "-12-31";
}

function daysBefore(day, days) {
  const date = new Date(day + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}


// ---------- Open Library (only for coming soon and recent) ----------

let openLibraryRequests = 0;

async function openLibrarySearch(params) {
  const url = OPEN_LIBRARY + "/search.json?limit=10&fields=" + site.OPEN_LIBRARY_FIELDS + "&" + new URLSearchParams(params);
  for (let attempt = 1; attempt <= 2; attempt++) {
    openLibraryRequests++;
    try {
      const response = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(30000) });
      if (response.ok) return (await response.json()).docs || [];
      if (response.status < 500 && response.status !== 429) return [];
    } catch (error) {
      // try once more
    }
    await sleep(PAUSE_MS * 3);
  }
  return null; // couldn't reach it: try again tomorrow
}

// The source book in our shape, from an Open Library search result.
function sourceFromDoc(doc, work) {
  const book = site.openLibraryDocToBook(doc);
  return {
    title: work.title || book.title,
    author: work.authors[0] || (doc.author_name || [])[0] || "",
    ol: /^OL\d+W$/.test(book.externalId) ? book.externalId : work.ol,
    cover: book.coverUrl,
    genres: book.genres,
    adult: site.looksAdult([book.title].concat(book.subjects || [])) || undefined,
    checked: TODAY,
  };
}

// Fills `sources` (by Wikidata work id) for these works: reuses last
// time's answer when it's under 30 days old, otherwise asks Open Library
// (in batches of 20 for works with an Open Library id, one search by
// title and author for the others).
async function lookUpSources(works, oldSources) {
  const sources = {};
  const fresh = daysBefore(TODAY, 30);
  const withId = [];
  const withoutId = [];
  for (const work of works) {
    const old = oldSources[work.id];
    if (old && old.checked >= fresh) sources[work.id] = old;
    else if (work.ol) withId.push(work);
    else withoutId.push(work);
  }

  for (let i = 0; i < withId.length; i += 20) {
    const batch = withId.slice(i, i + 20);
    const docs = await openLibrarySearch({ q: "key:(" + batch.map((work) => '"/works/' + work.ol + '"').join(" OR ") + ")" });
    await sleep(PAUSE_MS);
    for (const work of batch) {
      const doc = (docs || []).find((found) => found.key === "/works/" + work.ol);
      if (doc) sources[work.id] = sourceFromDoc(doc, work);
      else if (docs) sources[work.id] = { title: work.title, author: work.authors[0] || "", ol: work.ol, cover: null, genres: [], checked: TODAY };
    }
  }

  for (const work of withoutId) {
    if (!work.title || !work.authors[0]) continue;
    const docs = await openLibrarySearch({ title: work.title, author: work.authors[0], sort: "editions" });
    await sleep(PAUSE_MS);
    if (!docs) continue;
    const seed = { t: work.title, c: work.authors };
    const doc = docs.find((found) => site.sameTitle(found.title, work.title) &&
      site.sameCreator((found.author_name || []).concat(found.author_alternative_name || []), seed));
    sources[work.id] = doc
      ? sourceFromDoc(doc, work)
      : { title: work.title, author: work.authors[0], ol: null, cover: null, genres: [], checked: TODAY };
  }
  return sources;
}


// ---------- Putting it together ----------

function readJson(file, fallback) {
  try {
    return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : fallback;
  } catch (error) {
    return fallback;
  }
}

async function main() {
  // 1. Ask Wikidata (one query at a time).
  const answers = {};
  for (const name of Object.keys(QUERIES)) answers[name] = await ask(name);

  // 2. Films and series, with their works.
  const filmLabels = pickLabels(answers.filmLabels, "film");
  const workLabels = pickLabels(answers.workLabels, "work");
  // Only real English Wikipedia article links.
  const articles = new Map(answers.wikipedia
    .filter((row) => /^https:\/\/en\.wikipedia\.org\/wiki\/[^\s"<>]+$/.test(row.article))
    .map((row) => [qid(row.film), row.article]));
  const released = earliestDates(answers.released);
  const started = earliestDates(answers.started);
  const announced = earliestDates(answers.announced);

  const workIds = new Map(); // work -> Open Library work ids
  for (const row of answers.workIds) {
    if (!/^OL\d+W$/.test(row.ol)) continue; // editions (OL...M) and authors don't count
    const id = qid(row.work);
    if (!workIds.has(id)) workIds.set(id, new Set());
    workIds.get(id).add(row.ol);
  }
  const workAuthors = new Map();
  for (const row of answers.authors) {
    const id = qid(row.work);
    if (!workAuthors.has(id)) workAuthors.set(id, []);
    const list = workAuthors.get(id);
    // English names first
    if (!list.includes(row.label)) row.lang === "en" ? list.unshift(row.label) : list.push(row.label);
  }

  const films = new Map(); // film id -> { id, title, kind, works: [] }
  for (const row of answers.links) {
    const workId = qid(row.work);
    if (!workAuthors.has(workId) && !(workIds.get(workId) || new Set()).size) continue; // not a written work
    const id = qid(row.film);
    const title = filmLabels.get(id);
    if (!title) continue; // no English name: we couldn't show it
    if (!films.has(id)) films.set(id, { id: id, title: title, kind: "film", works: [] });
    const film = films.get(id);
    if (FILM_TYPES[qid(row.type)] === "tv") film.kind = "tv";
    if (!film.works.includes(workId)) film.works.push(workId);
  }
  for (const film of films.values()) {
    const date = released.get(film.id) || started.get(film.id) || null;
    const start = started.get(film.id);
    film.date = date && start && start.date < date.date ? start : date;
    film.article = articles.get(film.id) || null;
    if (site.looksAdult([film.title])) film.adult = true;
  }

  const work = (id) => ({
    id: id,
    title: workLabels.get(id) || "",
    authors: (workAuthors.get(id) || []).slice(0, 3),
    ol: [...(workIds.get(id) || [])][0] || null,
  });

  // 3. Every film under its book: by Open Library id and by title + author.
  const shards = Array.from({ length: site.SCREEN_SHARDS }, () => ({}));
  let filed = 0;
  const filmsByWork = new Map();
  for (const film of films.values()) {
    if (film.adult) continue;
    const item = {
      q: film.id,
      t: film.title,
      y: film.date ? Number(film.date.date.slice(0, 4)) : null,
      k: film.kind,
      w: film.article || "https://www.wikidata.org/wiki/" + film.id,
    };
    for (const workId of film.works) {
      if (!filmsByWork.has(workId)) filmsByWork.set(workId, []);
      filmsByWork.get(workId).push(item);
    }
  }
  for (const [workId, items] of filmsByWork) {
    const info = work(workId);
    if (site.looksAdult([info.title])) continue;
    const keys = new Set();
    for (const ol of workIds.get(workId) || []) keys.add(ol);
    for (const author of info.authors) {
      const key = site.screenTitleKey(info.title, author);
      if (key) keys.add(key);
    }
    for (const key of keys) {
      const shard = shards[Number(site.screenShard(key))];
      const list = shard[key] || (shard[key] = []);
      for (const item of items) if (!list.some((other) => other.q === item.q)) list.push(item);
      filed++;
    }
  }
  for (const shard of shards) for (const key in shard) shard[key].sort((a, b) => (a.y || 9999) - (b.y || 9999) || a.q.localeCompare(b.q));

  // 4. Coming soon (from today on; then announced in the last 2 years
  //    with no date yet) and the last 12 months.
  const yearAgo = daysBefore(TODAY, 365);
  const twoYearsAgo = daysBefore(TODAY, 730);
  const upcoming = [];
  const recent = [];
  const announcedOnly = [];
  for (const film of films.values()) {
    if (film.adult) continue;
    if (film.date) {
      if (lastPossibleDay(film.date) >= TODAY) upcoming.push(film);
      else if (film.date.date >= yearAgo) recent.push(film);
    } else {
      const when = announced.get(film.id);
      if (when && when.date >= twoYearsAgo) announcedOnly.push(Object.assign(film, { announced: when }));
    }
  }
  // Soonest first, by the last day a date could mean ("2027" after "March 2027").
  upcoming.sort((a, b) => lastPossibleDay(a.date).localeCompare(lastPossibleDay(b.date)) || a.title.localeCompare(b.title));
  announcedOnly.sort((a, b) => b.announced.date.localeCompare(a.announced.date) || a.title.localeCompare(b.title));
  recent.sort((a, b) => b.date.date.localeCompare(a.date.date) || a.title.localeCompare(b.title));

  // Their source books, with covers and genres from Open Library.
  const oldUpcoming = readJson(OUT + "/upcoming.json", {});
  const needed = new Map();
  for (const film of [...upcoming, ...announcedOnly, ...recent]) needed.set(film.works[0], work(film.works[0]));
  const sources = await lookUpSources([...needed.values()], oldUpcoming.sources || {});

  function entry(film) {
    const source = sources[film.works[0]];
    if (!source || source.adult) return null;
    return {
      q: film.id,
      title: film.title,
      kind: film.kind,
      date: film.date ? film.date.date : null,
      prec: film.date ? film.date.prec : null,
      announced: film.announced ? film.announced.date : undefined,
      wiki: film.article || "https://www.wikidata.org/wiki/" + film.id,
      work: film.works[0],
    };
  }
  const result = {
    upcoming: [...upcoming, ...announcedOnly].map(entry).filter(Boolean),
    recent: recent.map(entry).filter(Boolean),
    sources: sources,
  };

  // 5. Sanity check: much less than last time means Wikidata had a bad
  //    day. Keep the old files then.
  const oldCount = Number(oldUpcoming.filmCount || 0);
  console.log("Films and series based on written works: " + films.size + " (last time " + (oldCount || "none") + ")");
  console.log("Filed under books: " + filed + " keys in " + site.SCREEN_SHARDS + " files; " +
    [...filmsByWork.keys()].filter((id) => (workIds.get(id) || new Set()).size > 0).length + " works with an Open Library id");
  console.log("Coming soon: " + upcoming.length + " dated, " + announcedOnly.length + " announced; last 12 months: " + recent.length);
  console.log("Open Library requests: " + openLibraryRequests);
  if (films.size < 1000 || (oldCount && films.size < oldCount * 0.7)) {
    console.log("That's far fewer than expected; keeping the old files.");
    return;
  }

  // 6. Write only the files that changed (so a quiet day makes no commit).
  if (!existsSync(OUT)) mkdirSync(OUT);
  let changed = 0;
  function save(name, data, compareWithout) {
    const file = OUT + "/" + name;
    const old = readJson(file, null);
    const strip = (value) => (value && compareWithout ? Object.assign({}, value, { made: null }) : value);
    if (JSON.stringify(strip(old)) === JSON.stringify(strip(data))) return;
    writeFileSync(file, JSON.stringify(data) + "\n");
    changed++;
  }
  // Keys in a fixed order, so the files only change when the data does.
  const sorted = (shard) => Object.fromEntries(Object.keys(shard).sort().map((key) => [key, shard[key]]));
  shards.forEach((shard, number) => save("adaptations-" + String(number).padStart(2, "0") + ".json", sorted(shard), false));
  save("upcoming.json", Object.assign({ made: TODAY, filmCount: films.size }, result), true);
  // Old files from a different number of files: remove them.
  for (const name of readdirSync(OUT)) {
    const number = (name.match(/^adaptations-(\d+)\.json$/) || [])[1];
    if (number && Number(number) >= site.SCREEN_SHARDS) writeFileSync(OUT + "/" + name, "{}\n");
  }
  console.log(changed ? "Wrote " + changed + " changed files." : "No change.");
}

main().catch(function (error) {
  // Wikidata unreachable (or something unexpected): keep the old files.
  console.log("Couldn't make the files: " + error.message + ". Keeping the old ones.");
});
