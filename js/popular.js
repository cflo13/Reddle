// ------------------------------------------------------------
// Popular this week: popular.html
// ------------------------------------------------------------
// The books logged most on Reddle in the last 7 days (best rated first
// when tied), from the books_with_stats view (logs_this_week). When
// Reddle runs out, the list carries on, so the page is never empty:
//   Books:  Open Library's weekly trending list
//   Comics and Manga: Reddle's most logged ever (once there are 24
//     logged books in the universe), then the curated seed list
//     (js/universe-seeds.js, a new order every day)
// 24 at a time, with Load more. Works for logged-out visitors too.
// ------------------------------------------------------------

const POPULAR_PAGE = 24;

const popularBox = document.getElementById("popular-books");
const popularMore = document.getElementById("more-popular");
const shownIds = new Set(); // never show the same book twice

// A source gives pages of { book, note, reason } until it runs out.
// Reddle's pages ask for one extra row to know whether there are more.
function reddleSource(narrow, noteOf) {
  let shown = 0;
  return {
    finished: !db,
    async next(count) {
      const query = onlyShownGenres(onlyThisUniverse(db
        .from("books_with_stats")
        .select("id, external_id, title, author, cover_url, genres, log_count, avg_rating, logs_this_week")));
      const { data, error } = await narrow(query)
        .order("id", { ascending: true }) // same order every time, so pages never repeat
        .range(shown, shown + count);
      if (error) throw error;
      if (data.length <= count) this.finished = true;
      const page = data.slice(0, count);
      shown += page.length;
      return page.map((book) => ({ book: book, note: noteOf(book) }));
    },
  };
}

function weekNote(book) {
  const parts = [];
  if (book.avg_rating) parts.push("★ " + Number(book.avg_rating).toFixed(1));
  parts.push(book.logs_this_week + (book.logs_this_week === 1 ? " log" : " logs") + " this week");
  return parts.join(" · ");
}

// This week on Reddle.
function thisWeekSource() {
  return reddleSource(
    (query) => query.gt("logs_this_week", 0)
      .order("logs_this_week", { ascending: false })
      .order("avg_rating", { ascending: false, nullsFirst: false }),
    weekNote
  );
}

// Reddle's most logged ever (comics and manga, once there are enough).
function allTimeSource() {
  return reddleSource(
    (query) => query.gt("log_count", 0)
      .order("log_count", { ascending: false })
      .order("avg_rating", { ascending: false, nullsFirst: false }),
    statsNote
  );
}

// Open Library's trending list (books), fetched once.
function trendingSource() {
  let list = null;
  let shown = 0;
  return {
    finished: false,
    async next(count) {
      if (list === null) list = await fetchTrendingFromOpenLibrary(100).catch(() => []);
      const page = list.slice(shown, shown + count);
      shown += page.length;
      if (shown >= list.length) this.finished = true;
      return page.map((book) => ({ book: book, note: "", reason: "Trending on Open Library" }));
    },
  };
}

// The curated seed list (comics and manga).
function seedSource(universe) {
  const stream = makeSeedStream(universe);
  return {
    finished: false,
    async next(count) {
      const books = await stream.next(count);
      if (stream.finished()) this.finished = true;
      return books.map((book) => ({ book: openLibraryToBook(book), note: "", reason: "A " + UNIVERSES[universe].noun.replace(/s$/, "") + " favourite" }));
    },
  };
}

let sources = null;

// Reddle's most logged ever, only once the universe has 24+ logged
// books (the count is asked at the same time as the first page).
function allTimeWhenEnough(enoughPromise) {
  const allTime = allTimeSource();
  return {
    finished: false,
    async next(count) {
      if (!(await enoughPromise)) {
        this.finished = true;
        return [];
      }
      const items = await allTime.next(count);
      this.finished = allTime.finished;
      return items;
    },
  };
}

function buildSources() {
  const universe = currentUniverse();
  if (universe === "books") return [thisWeekSource(), trendingSource()];
  loadResolvedSeeds(); // (usually already on its way: the page head preloads it)
  const enough = db ? universeLoggedCount().then((count) => count >= SEED_UNTIL).catch(() => false) : Promise.resolve(false);
  return [thisWeekSource(), allTimeWhenEnough(enough), seedSource(universe)];
}

async function loadMorePopular() {
  popularMore.disabled = true;
  const firstLoad = shownIds.size === 0;
  try {
    if (!sources) sources = buildSources();
    let added = 0;
    for (const source of sources) {
      while (added < POPULAR_PAGE && !source.finished) {
        const items = await source.next(POPULAR_PAGE - added);
        if (firstLoad && added === 0 && popularBox.querySelector(".skeleton, .tile-placeholder, .sk-tile")) popularBox.textContent = "";
        for (const item of items) {
          if (!item.book || shownIds.has(item.book.external_id)) continue;
          shownIds.add(item.book.external_id);
          popularBox.appendChild(makeBookTile(item.book, item.note, item.reason));
          added++;
        }
        if (items.length === 0) break;
      }
      if (added >= POPULAR_PAGE) break;
    }

    if (shownIds.size === 0) {
      popularBox.textContent = "";
      popularBox.appendChild(el("p", "muted", "Nothing popular this week yet. Log a book to start the list!"));
    }
    popularMore.hidden = sources.every((source) => source.finished);
  } catch (error) {
    if (firstLoad) popularBox.textContent = "";
    popularBox.appendChild(el("p", "status status-error", friendlyError(error, "Couldn't load the popular books. ")));
  } finally {
    popularMore.disabled = false;
  }
}

popularMore.addEventListener("click", loadMorePopular);

(async function () {
  // Comics and manga: say so at the top.
  const universe = currentUniverse();
  if (universe !== "books") {
    const noun = UNIVERSES[universe].noun;
    document.getElementById("popular-title").textContent = "Popular " + noun + " this week";
    document.getElementById("popular-hint").textContent = "The " + noun + " Reddle readers logged most in the last 7 days, best rated first. Then well-known " + noun + " to start with, in a new order every day.";
  }
  await authReady;
  loadMorePopular();
})();
