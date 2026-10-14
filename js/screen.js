// ------------------------------------------------------------
// Book to screen: screen.html
// ------------------------------------------------------------
// Three tabs (the choice is in the address: screen.html#best, #news):
//   Coming soon: films and series from today on, soonest first, each
//     with the book it's based on (from screen-data/upcoming.json, made
//     every day from Wikidata; see js/screen-data.js).
//   Best adaptations: "Our picks" (the admin's list, screen_picks), then
//     books with a film or series, by their average rating on Reddle
//     (3 ratings or more).
//   News: headlines from other sites about this universe (js/news-data.js).
// Both show only this universe: Comics and Manga only comics and manga
// sources, Books only books (by the book's genres). 24 at a time with
// Load more. Text only: no posters, no logos.
// ------------------------------------------------------------

const SCREEN_PAGE = 24;
const MIN_RATINGS = 3;

const soonList = document.getElementById("soon-list");
const soonMore = document.getElementById("more-soon");
const bestBox = document.getElementById("best-books");
const bestMore = document.getElementById("more-best");


// ---------- Tabs ----------

const SCREEN_TABS = ["soon", "best", "news"];

function showScreenTab(name) {
  if (!SCREEN_TABS.includes(name)) name = "soon";
  for (const tab of SCREEN_TABS) {
    document.getElementById("screen-" + tab).hidden = tab !== name;
    const button = document.getElementById("tab-" + tab);
    button.classList.toggle("feed-tab-active", tab === name);
    button.setAttribute("aria-selected", tab === name ? "true" : "false");
  }
  history.replaceState(null, "", name === "soon" ? location.pathname + location.search : "#" + name);
  if (name === "best") loadBestOnce();
  if (name === "news") loadScreenNewsOnce();
}

// News: this universe's headlines from other sites (js/news-data.js).
let screenNewsStarted = false;
function loadScreenNewsOnce() {
  if (screenNewsStarted) return;
  screenNewsStarted = true;
  showNewsList(document.getElementById("screen-news-list"), document.getElementById("more-screen-news"), SCREEN_PAGE, newsEmptyText())
    .catch(() => {});
}


// ---------- Coming soon ----------

// "18 December 2026", "2027", or "Date to be announced".
function releaseWhen(entry) {
  if (entry.date) return screenDateText(entry.date, entry.prec);
  return "Date to be announced";
}

// The book a film is based on: our book page when we know its Open
// Library id, otherwise an Open Library search.
function sourceLink(source) {
  if (source.ol) return { href: bookLink(source.ol), outside: false };
  const query = new URLSearchParams({ title: source.title, author: source.author || "" });
  return { href: "https://openlibrary.org/search?" + query, outside: true };
}

function makeReleaseRow(entry, source) {
  const row = el("li", "release");
  const book = { title: source.title, author: source.author, cover_url: source.cover };
  const where = sourceLink(source);

  const coverLink = el("a", "release-cover");
  coverLink.href = where.href;
  coverLink.setAttribute("aria-label", source.title);
  if (where.outside) {
    coverLink.target = "_blank";
    coverLink.rel = "noopener noreferrer";
  }
  coverLink.appendChild(makeCover(book, "cover-small"));
  row.appendChild(coverLink);

  const text = el("div", "release-text");
  const link = safeScreenLink(entry.wiki);
  const title = el(link ? "a" : "span", "release-title", entry.title);
  if (link) {
    title.href = link;
    title.target = "_blank";
    title.rel = "noopener noreferrer";
  }
  text.appendChild(title);
  text.appendChild(el("p", "release-when", screenKindName(entry.kind) + " · " + releaseWhen(entry)));

  const based = el("p", "release-source", "Based on ");
  const bookName = el("a", "", source.title);
  bookName.href = where.href;
  if (where.outside) {
    bookName.target = "_blank";
    bookName.rel = "noopener noreferrer";
  }
  based.appendChild(bookName);
  if (source.author) based.appendChild(document.createTextNode(" by " + source.author));
  text.appendChild(based);
  row.appendChild(text);
  return row;
}

// The coming soon list for this universe: { entry, source } pairs.
function upcomingHere(data) {
  const sources = data.sources || {};
  return (data.upcoming || [])
    .map((entry) => ({ entry: entry, source: sources[entry.work] }))
    .filter((pair) => pair.source && !pair.source.adult)
    .filter((pair) => bookInUniverse({ genres: pair.source.genres || [] }))
    .filter((pair) => !looksAdult([pair.entry.title, pair.source.title]));
}

async function loadSoon() {
  const all = upcomingHere(await loadUpcoming());
  soonList.textContent = "";
  if (all.length === 0) {
    const noun = UNIVERSES[currentUniverse()].noun;
    soonList.appendChild(makeEmptyState("No films or series based on " + noun + " are announced right now. Have a look at the best adaptations instead."));
    return;
  }
  let shown = 0;
  function nextPage() {
    all.slice(shown, shown + SCREEN_PAGE).forEach((pair) => soonList.appendChild(makeReleaseRow(pair.entry, pair.source)));
    shown += SCREEN_PAGE;
    soonMore.hidden = shown >= all.length;
  }
  soonMore.addEventListener("click", nextPage);
  nextPage();
}


// ---------- Best adaptations ----------

// "Film 2021" (the first film or series of a book).
function firstAdaptationText(items) {
  const first = items[0];
  return first ? screenKindName(first.k) + (first.y ? " " + first.y : "") : "";
}

// Our picks: the admin's list for this universe, newest first.
async function loadOurPicks() {
  const { data, error } = await db.from("screen_picks")
    .select("id, note, books!inner(id, external_id, title, author, cover_url, isbn, genres)")
    .eq("universe", currentUniverse())
    .order("created_at", { ascending: false })
    .limit(SCREEN_PAGE);
  if (error || !data || data.length === 0) return [];
  const list = document.getElementById("our-picks-list");
  list.textContent = "";
  for (const pick of data) {
    const book = pick.books;
    const row = el("li", "release");
    const coverLink = el("a", "release-cover");
    coverLink.href = bookLink(book.external_id);
    coverLink.setAttribute("aria-label", book.title);
    coverLink.appendChild(makeCover(book, "cover-small"));
    row.appendChild(coverLink);

    const text = el("div", "release-text");
    const title = el("a", "release-title", book.title);
    title.href = bookLink(book.external_id);
    text.appendChild(title);
    if (book.author) text.appendChild(el("p", "release-when", "by " + book.author));
    if (pick.note) text.appendChild(el("p", "release-note", pick.note));
    const screens = el("ul", "screen-list");
    text.appendChild(screens);
    row.appendChild(text);
    list.appendChild(row);
    findAdaptations(book).then((items) => items.slice(0, 3).forEach((item) => screens.appendChild(makeScreenLine(item))));
  }
  document.getElementById("our-picks").hidden = false;
  return data.map((pick) => pick.books.external_id);
}

// Books with 3+ ratings, best first, that have a film or series. Reads
// Reddle 100 books at a time and keeps those with a match; extra
// matches wait in `waiting` for the next page.
function bestSource(skipIds) {
  const BATCH = 100;
  let offset = 0;
  let readAll = !db;
  const waiting = [];
  return {
    get finished() {
      return readAll && waiting.length === 0;
    },
    async next(count) {
      while (waiting.length < count && !readAll) {
        const { data, error } = await onlyThisUniverse(db
          .from("books_with_stats")
          .select("id, external_id, title, author, cover_url, isbn, genres, avg_rating, rating_count, log_count"))
          .gte("rating_count", MIN_RATINGS)
          .order("avg_rating", { ascending: false, nullsFirst: false })
          .order("rating_count", { ascending: false })
          .order("id", { ascending: true })
          .range(offset, offset + BATCH - 1);
        if (error) throw error;
        offset += data.length;
        if (data.length < BATCH) readAll = true;
        const checked = await Promise.all(data.map(async (book) => ({ book: book, items: await findAdaptations(book) })));
        for (const found of checked) {
          if (found.items.length === 0 || skipIds.has(found.book.external_id)) continue;
          if (looksAdult([found.book.title])) continue;
          waiting.push(found);
        }
      }
      return waiting.splice(0, count);
    },
  };
}

function ratingNote(book) {
  return "★ " + Number(book.avg_rating).toFixed(1) + " · " + book.rating_count + " ratings";
}

let bestStarted = false;

async function loadBestOnce() {
  if (bestStarted) return;
  bestStarted = true;
  const pickIds = new Set(await loadOurPicks().catch(() => []));
  const source = bestSource(pickIds);
  let first = true;

  async function nextPage() {
    bestMore.disabled = true;
    try {
      const page = await source.next(SCREEN_PAGE);
      if (first) {
        bestBox.textContent = "";
        first = false;
        if (page.length === 0) {
          const box = makeEmptyState("Nothing here yet. When books with a film or series get " + MIN_RATINGS + " or more ratings on Reddle, the best rated show up here.");
          box.classList.add("tile-grid-wide");
          bestBox.appendChild(box);
        }
      }
      page.forEach((found) => bestBox.appendChild(makeBookTile(found.book, ratingNote(found.book), firstAdaptationText(found.items))));
      bestMore.hidden = source.finished;
    } catch (error) {
      bestBox.textContent = "";
      bestBox.appendChild(el("p", "status status-error tile-grid-wide", friendlyError(error, "The list didn't load. ")));
    } finally {
      bestMore.disabled = false;
    }
  }
  bestMore.addEventListener("click", nextPage);
  await nextPage();
}


// ---------- Start ----------

async function loadScreenPage() {
  await authReady;
  document.getElementById("tab-soon").addEventListener("click", () => showScreenTab("soon"));
  document.getElementById("tab-best").addEventListener("click", () => showScreenTab("best"));
  document.getElementById("tab-news").addEventListener("click", () => showScreenTab("news"));
  showScreenTab(location.hash.slice(1));
  // A link to screen.html#best from this page only changes the hash.
  window.addEventListener("hashchange", () => showScreenTab(location.hash.slice(1)));
  await loadSoon();
}

loadScreenPage().catch(function (error) {
  console.error(error);
  soonList.textContent = "";
  soonList.appendChild(el("li", "status status-error", friendlyError(error, "This page didn't load. ")));
});
