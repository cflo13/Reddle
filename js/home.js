// ------------------------------------------------------------
// Home page
// ------------------------------------------------------------
// A stack of book rows, then the feed:
//   1. For you                     (logged in)
//   2. Because you like [Genre]    (up to 3, logged in)
//   3. Popular this week
//   4. New and noteworthy
//   5. Browse by genre             (genre buttons)
//   6. 3 more genre rows           (popular genres you don't already have a row for)
//   7. The feed: people you follow, or everyone
// Only the first 2 rows load straight away; the rest load when you
// scroll near them. A book never shows twice on the page, and never one
// you've logged or shelved. A row that's empty or fails just hides.
// ------------------------------------------------------------

const homeStatus = document.getElementById("home-status");
const feedHeading = document.getElementById("feed-heading");
const feedNote = document.getElementById("feed-note");
const feedList = document.getElementById("feed");

function showHomeStatus(text) {
  homeStatus.textContent = text;
  homeStatus.hidden = !text;
}

// Explains the most common setup problems in plain words.
function explainError(error) {
  if (error.code === "42P01" || error.code === "PGRST205") {
    return "The database tables are missing. Run supabase/schema.sql in the Supabase SQL Editor.";
  }
  return friendlyError(error, "Could not load. ");
}

// A page of the latest logs from everyone (rows `from` to `to`).
function everyoneQuery(from, to) {
  return db
    .from("logs")
    .select(LOG_FIELDS)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false }) // keeps the order stable between pages
    .range(from, to);
}

// Who does `userId` follow? Returns a list of user ids.
async function loadFollowingIds(userId) {
  const { data: follows, error } = await db
    .from("follows")
    .select("following_id")
    .eq("follower_id", userId);
  if (error) throw error;
  return follows.map((row) => row.following_id);
}

// A page of the latest logs from the people in `ids`.
function followingQuery(ids) {
  return (from, to) =>
    db
      .from("logs")
      .select(LOG_FIELDS)
      .in("user_id", ids) // "user_id is one of these ids"
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to);
}

// ------------------------------------------------------------
// Remembering results for this visit
// ------------------------------------------------------------
// Rows keep what they found in sessionStorage (this browser tab only)
// for 10 minutes, so coming back to the home page doesn't search
// everything again. If the browser blocks it, rows just load normally.

const CACHE_MINUTES = 10;

function cacheGet(key) {
  try {
    const saved = JSON.parse(sessionStorage.getItem("reddle:" + key));
    if (saved && Date.now() - saved.time < CACHE_MINUTES * 60 * 1000) return saved.value;
  } catch (error) {}
  return null;
}

function cacheSet(key, value) {
  try {
    sessionStorage.setItem("reddle:" + key, JSON.stringify({ time: Date.now(), value: value }));
  } catch (error) {}
}

// Runs `load` unless we already have a recent answer for `key`.
async function remembered(key, load) {
  const saved = cacheGet(key);
  if (saved) return saved;
  const value = await load();
  cacheSet(key, value);
  return value;
}


// ------------------------------------------------------------
// Loading things only when they're about to be seen
// ------------------------------------------------------------

// Calls `run` once, when `element` comes within about a screen of view.
function whenNearScreen(element, run) {
  if (!("IntersectionObserver" in window)) return run();
  const watcher = new IntersectionObserver(function (entries) {
    if (entries.some((entry) => entry.isIntersecting)) {
      watcher.disconnect();
      run();
    }
  }, { rootMargin: "600px 0px" });
  watcher.observe(element);
}


// ------------------------------------------------------------
// Rows
// ------------------------------------------------------------

const ROW_SIZE = 12;
const rowsBox = document.getElementById("home-rows");
const rows = [];                 // every row, top to bottom
const shownOnPage = new Set();   // books already in a row (external ids)
let knownBooks = new Set();      // books you've logged or shelved

// Builds an empty row: heading (optionally a link), "See all", arrows
// (desktop only), and a strip with grey placeholders while it loads.
function makeRowSection(options) {
  const section = el("section", "home-row");
  const head = el("div", "row-head");

  const title = el("h2", "row-title");
  if (options.titleLink) {
    const link = el("a", "", options.title);
    link.href = options.titleLink;
    title.appendChild(link);
  } else {
    title.textContent = options.title;
  }
  head.appendChild(title);

  const tools = el("div", "row-tools");
  if (options.seeAll) {
    const seeAll = el("a", "see-all", "See all");
    seeAll.href = options.seeAll;
    tools.appendChild(seeAll);
  }
  const back = el("button", "row-arrow", "‹");
  const forward = el("button", "row-arrow", "›");
  back.type = forward.type = "button";
  back.setAttribute("aria-label", "Scroll " + options.title + " left");
  forward.setAttribute("aria-label", "Scroll " + options.title + " right");
  tools.append(back, forward);
  head.appendChild(tools);
  section.appendChild(head);

  if (options.note) {
    const note = el("p", "hint");
    note.innerHTML = options.note; // our own text, never user text
    section.appendChild(note);
  }

  const strip = el("div", "tile-row");
  for (let i = 0; i < 6; i++) strip.appendChild(el("div", "tile-placeholder"));
  section.appendChild(strip);

  // Arrows scroll most of a screen's width.
  const smooth = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  back.addEventListener("click", () => strip.scrollBy({ left: -strip.clientWidth * 0.85, behavior: smooth }));
  forward.addEventListener("click", () => strip.scrollBy({ left: strip.clientWidth * 0.85, behavior: smooth }));

  return { section: section, strip: strip };
}

// Puts the books in a row: skips books you know and books already on the
// page, keeps up to ROW_SIZE. An empty row hides.
// `candidates` is a list of { book, note, reason }.
function fillRow(row, candidates) {
  const picked = [];
  for (const candidate of candidates || []) {
    const id = candidate.book && candidate.book.external_id;
    if (!id || knownBooks.has(id) || shownOnPage.has(id)) continue;
    shownOnPage.add(id);
    picked.push(candidate);
    if (picked.length >= ROW_SIZE) break;
  }
  row.strip.textContent = "";
  if (picked.length === 0) {
    row.section.hidden = true;
    return;
  }
  for (const pick of picked) row.strip.appendChild(makeBookTile(pick.book, pick.note, pick.reason));
  // No arrows when everything already fits on screen.
  row.section.classList.toggle("row-fits", row.strip.scrollWidth <= row.strip.clientWidth + 2);
}

// Starts loading row number `index`. Rows fill in page order (a row
// waits for the one above it), so the top rows get first pick of books.
function startRow(index) {
  const row = rows[index];
  if (row.done) return row.done;
  const above = index > 0 ? startRow(index - 1) : Promise.resolve();
  const loading = Promise.resolve()
    .then(row.load)
    .catch(function (error) {
      console.error("A home row didn't load:", error);
      return [];
    });
  row.done = Promise.all([above, loading])
    .then((results) => fillRow(row, results[1]))
    .catch(() => (row.section.hidden = true));
  return row.done;
}

// Adds a row at the bottom of the stack. `load` returns its candidates.
// `lazy` rows wait until you scroll near them.
function addRow(options, load, lazy) {
  const row = Object.assign(makeRowSection(options), { load: load, done: null });
  rows.push(row);
  rowsBox.appendChild(row.section);
  const index = rows.length - 1;
  if (lazy) whenNearScreen(row.section, () => startRow(index));
  else startRow(index);
}


// ------------------------------------------------------------
// What goes in the rows
// ------------------------------------------------------------

// Popular genres to fill rows with when we don't know your taste.
const FALLBACK_GENRES = ["fantasy", "mystery", "romance", "science_fiction", "thriller", "literary_fiction", "classics", "historical_fiction", "horror", "young_adult"];

// Your logs and shelves (to leave them out of rows, and to work out
// your taste).
async function loadMyBooks(userId) {
  const [logsResult, shelvesResult] = await Promise.all([
    db.from("logs").select("book_id, rating, books(external_id, genres)").eq("user_id", userId),
    db.from("shelves").select("book_id, books(external_id)").eq("user_id", userId),
  ]);
  if (logsResult.error) throw logsResult.error;
  const logs = logsResult.data;
  const shelves = shelvesResult.data || [];
  return {
    logs: logs,
    knownIds: [...logs, ...shelves].map((row) => row.book_id),
    known: new Set([...logs, ...shelves].map((row) => row.books && row.books.external_id).filter(Boolean)),
  };
}

// Your genres, best first: favourites count 2, each book you rated 4+
// adds 1 to its genres.
function tasteGenres(profile, myLogs) {
  const score = {};
  for (const slug of profile.favorite_genres || []) score[slug] = (score[slug] || 0) + 2;
  for (const log of myLogs) {
    if (Number(log.rating) >= 4 && log.books) {
      for (const slug of log.books.genres || []) score[slug] = (score[slug] || 0) + 1;
    }
  }
  return Object.keys(score).filter(findGenre).sort((a, b) => score[b] - score[a]);
}

// Genres ranked by how much they're logged on Reddle, then the usual
// favourites.
async function popularGenres() {
  return remembered("popular-genres", async function () {
    const { data } = await db
      .from("books_with_stats")
      .select("genres, log_count")
      .gt("log_count", 0)
      .order("log_count", { ascending: false })
      .limit(300);
    const score = {};
    for (const book of data || []) {
      for (const slug of book.genres || []) score[slug] = (score[slug] || 0) + book.log_count;
    }
    const ranked = Object.keys(score).sort((a, b) => score[b] - score[a]);
    return [...new Set([...ranked, ...FALLBACK_GENRES])];
  });
}

// 1. For you (logged in). Same rules as before: books people you follow
//    rated 4+, then top-rated Reddle books in your genres.
async function forYouCandidates(profile, followingIds, myBooks, genres) {
  const candidates = [];
  if (followingIds.length > 0) {
    const { data } = await db
      .from("logs")
      .select("rating, profiles(username), books(id, external_id, title, author, cover_url)")
      .in("user_id", followingIds)
      .gte("rating", 4)
      .order("rating", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(60);
    for (const log of data || []) {
      if (log.books) candidates.push({ book: log.books, reason: "★ " + Number(log.rating) + " from @" + log.profiles.username });
    }
  }
  const topRated = await fetchTopRatedInGenres(genres.slice(0, 4), myBooks.knownIds, ROW_SIZE);
  for (const book of topRated) {
    const shared = (book.genres || []).find((slug) => genres.includes(slug));
    candidates.push({ book: book, reason: shared ? "Because you like " + findGenre(shared).name : "Highly rated" });
  }
  return candidates;
}

// 2 and 6. A genre: top rated on Reddle, then popular on Open Library.
function genreCandidates(slug) {
  return remembered("genre:" + slug, async function () {
    const [topRated, popular] = await Promise.all([
      fetchTopRatedInGenres([slug], [], ROW_SIZE * 2).catch(() => []),
      fetchGenreBooksFromOpenLibrary(slug, ROW_SIZE * 2, 0).catch(() => []),
    ]);
    return [
      ...topRated.map((book) => ({ book: book, note: statsNote(book) })),
      ...popular.map((book) => ({ book: openLibraryToBook(book) })),
    ];
  });
}

function addGenreRow(slug, titleStart, lazy) {
  const genre = findGenre(slug);
  addRow(
    { title: titleStart + genre.name, titleLink: genreLink(slug), seeAll: genreLink(slug) },
    () => genreCandidates(slug),
    lazy
  );
}

// 3. Popular this week, topped up with Open Library's trending list.
function popularThisWeekCandidates() {
  return remembered("this-week", async function () {
    const [reddle, trending] = await Promise.all([
      fetchPopularThisWeek(ROW_SIZE * 2).catch(() => []),
      fetchTrendingFromOpenLibrary(ROW_SIZE * 2).catch(() => []),
    ]);
    return [
      ...reddle.map((book) => ({ book: book, reason: book.logs_this_week + (book.logs_this_week === 1 ? " reader" : " readers") + " this week" })),
      ...trending.map((book) => ({ book: book, reason: "Trending this week" })),
    ];
  });
}

// 4. New and noteworthy: books someone logged recently.
function newAndNoteworthyCandidates() {
  return remembered("new", async function () {
    const recent = await fetchRecentlyLoggedBooks(ROW_SIZE * 2);
    return recent.map((item) => ({ book: item.book, reason: item.username ? "Logged by @" + item.username : "" }));
  });
}

// 5. Genre buttons (not a row of books).
function addGenreButtons() {
  const section = el("section", "home-row");
  const head = el("div", "row-head");
  head.appendChild(el("h2", "row-title", "Browse by genre"));
  const tools = el("div", "row-tools");
  const seeAll = el("a", "see-all", "See all");
  seeAll.href = "genres.html";
  tools.appendChild(seeAll);
  head.appendChild(tools);
  section.appendChild(head);

  const pills = el("div", "genre-pills");
  for (const genre of GENRES) {
    const pill = el("a", "genre-pill", genre.name);
    pill.href = genreLink(genre.slug);
    pills.appendChild(pill);
  }
  section.appendChild(pills);
  rowsBox.appendChild(section);
}

// Builds every row, top to bottom.
function buildRows(profile, myBooks, followingIds) {
  const taste = profile ? tasteGenres(profile, myBooks.logs) : [];
  const tasteRows = taste.slice(0, 3);

  // 1. For you (logged in only)
  if (profile) {
    if (taste.length > 0 || followingIds.length > 0) {
      addRow(
        { title: "For you" },
        () => remembered("for-you:" + profile.id, () => forYouCandidates(profile, followingIds, myBooks, taste)),
        false
      );
    } else {
      // Nothing to go on yet: a nudge instead of a row.
      const nudge = el("p", "hint home-nudge");
      nudge.innerHTML = 'Rate a few books or <a href="welcome.html?redo=1">pick your favourite genres</a> to get suggestions just for you.';
      rowsBox.appendChild(nudge);
    }
  }

  // 2. Because you like [Genre] (the second row loads straight away too)
  tasteRows.forEach((slug) => addGenreRow(slug, "Because you like ", rows.length >= 2));

  // 3. Popular this week, 4. New and noteworthy
  addRow({ title: "Popular this week", titleLink: "popular.html", seeAll: "popular.html" }, popularThisWeekCandidates, rows.length >= 2);
  addRow({ title: "New and noteworthy" }, newAndNoteworthyCandidates, rows.length >= 2);

  // 5. Genre buttons
  addGenreButtons();

  // 6. Three more genre rows. Which genres is a small lookup, so it also
  //    waits until you scroll down here.
  const moreSpot = el("div", "home-more");
  rowsBox.appendChild(moreSpot);
  whenNearScreen(moreSpot, async function () {
    const genres = (await popularGenres().catch(() => FALLBACK_GENRES)).filter((slug) => !tasteRows.includes(slug));
    genres.slice(0, 3).forEach((slug) => addGenreRow(slug, "Popular in ", true));
  });
}


// ------------------------------------------------------------
// The feed (below the rows)
// ------------------------------------------------------------

async function loadFeed(profile, followingIds) {
  const cardOptions = { showUser: true, showBook: true };

  if (!profile) {
    feedHeading.textContent = "Recent activity";
    await showPagedLogs(feedList, everyoneQuery, cardOptions, "Nothing logged yet.");
    return;
  }

  if (followingIds.length === 0) {
    feedHeading.textContent = "Recent activity from everyone";
    feedNote.innerHTML =
      "You're not following anyone yet. Click a name below, or " +
      '<a href="search.html">search</a> for people and books.';
    feedNote.hidden = false;
    await showPagedLogs(feedList, everyoneQuery, cardOptions,
      "Nothing logged yet. Search for a book you've read and log it!");
    return;
  }

  feedHeading.textContent = "From people you follow";
  await showPagedLogs(feedList, followingQuery(followingIds), cardOptions,
    "The people you follow haven't logged anything yet.");
}


// ------------------------------------------------------------
// Start
// ------------------------------------------------------------

async function loadHome() {
  // Arrived here straight after deleting an account?
  if (new URLSearchParams(window.location.search).get("deleted")) {
    document.getElementById("deleted-message").hidden = false;
  }

  const { profile } = await authReady;
  if (!db) return; // auth.js already shows the problem at the top of the page

  if (!profile) document.getElementById("welcome").hidden = false;

  // Your books and who you follow, at the same time.
  const [myBooks, followingIds] = profile
    ? await Promise.all([loadMyBooks(profile.id), loadFollowingIds(profile.id)])
    : [{ logs: [], knownIds: [], known: new Set() }, []];
  knownBooks = myBooks.known;

  buildRows(profile, myBooks, followingIds);

  // The feed loads when you scroll near it.
  whenNearScreen(document.getElementById("feed-section"), function () {
    loadFeed(profile, followingIds).catch((error) => showHomeStatus(explainError(error)));
  });
}

loadHome().catch(function (error) {
  console.error(error);
  showHomeStatus(explainError(error));
});
