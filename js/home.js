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
//   7. The feed: tabs Following / Discover / Popular this week, with
//      "Share a thought" for logged-in people (posts: js/social.js)
// Only the first 2 rows load straight away; the rest load when you
// scroll near them. A book never shows twice on the page, and never one
// you've logged or shelved. A row that's empty or fails just hides.
// ------------------------------------------------------------

const homeStatus = document.getElementById("home-status");
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

// People you muted: their logs stay out of your feed.
let mutedPeople = [];

function withoutMuted(query) {
  return mutedPeople.length ? query.not("user_id", "in", "(" + mutedPeople.join(",") + ")") : query;
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

// Runs `load` unless we already have a recent answer for `key`. Each
// universe (Books, Comics, Manga) remembers its own answers. ROWS_VERSION
// changes when the way rows are filled changes, so nobody keeps seeing
// rows filled the old way.
const ROWS_VERSION = 2;

async function remembered(key, load) {
  key = "v" + ROWS_VERSION + ":" + currentUniverse() + ":" + key;
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
    // Never a book from another universe (when we know its genres).
    if (candidate.book.genres && !bookInUniverse(candidate.book)) continue;
    shownOnPage.add(id);
    picked.push(candidate);
    if (picked.length >= ROW_SIZE) break;
  }
  row.strip.textContent = "";
  if (picked.length === 0) {
    row.section.hidden = true;
    return;
  }
  for (const pick of picked) row.strip.appendChild(makeBookTile(pick.book, pick.note, pick.reason, pick.badge));
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
  // Comics and manga are universes, not taste rows.
  return Object.keys(score).filter((slug) => findGenre(slug) && !findGenre(slug).universe).sort((a, b) => score[b] - score[a]);
}

// Genres ranked by how much they're logged on Reddle, then the usual
// favourites.
async function popularGenres() {
  return remembered("popular-genres", async function () {
    const { data } = await onlyThisUniverse(db
      .from("books_with_stats")
      .select("genres, log_count"))
      .gt("log_count", 0)
      .order("log_count", { ascending: false })
      .limit(300);
    const score = {};
    for (const book of data || []) {
      for (const slug of book.genres || []) score[slug] = (score[slug] || 0) + book.log_count;
    }
    const ranked = Object.keys(score).filter((slug) => findGenre(slug) && !findGenre(slug).universe).sort((a, b) => score[b] - score[a]);
    return [...new Set([...ranked, ...FALLBACK_GENRES])];
  });
}

// 1. For you (logged in). Same rules as before: books people you follow
//    rated 4+, then top-rated Reddle books in your genres.
async function forYouCandidates(profile, followingIds, myBooks, genres) {
  const candidates = [];
  if (followingIds.length > 0) {
    const { data } = await onlyThisUniverse(db
      .from("logs")
      .select("rating, profiles!logs_user_id_fkey(username), books!inner(id, external_id, title, author, cover_url, genres)"), "books.genres")
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
// Comics and manga: top rated on Reddle, then the seed titles of that
// genre (seeds-resolved.json, instant). No slow Open Library search on
// the home page; the genre page has it under "Load more".
function genreCandidates(slug) {
  return remembered("genre:" + slug, async function () {
    const universe = currentUniverse();
    const [topRated, seeds, popular] = await Promise.all([
      fetchTopRatedInGenres([slug], [], ROW_SIZE * 2).catch(() => []),
      universe === "books" ? [] : makeSeedStream(universe, slug).next(ROW_SIZE * 2).catch(() => []),
      universe === "books" ? fetchGenreBooksFromOpenLibrary(slug, ROW_SIZE * 2, 0).catch(() => []) : [],
    ]);
    return [
      ...topRated.map((book) => ({ book: book, note: statsNote(book) })),
      ...seeds.map((book) => ({ book: openLibraryToBook(book) })),
      ...popular.map((book) => ({ book: openLibraryToBook(book) })),
    ];
  });
}

// " comics" / " manga" after a genre's name in those universes.
function universeSuffix() {
  const universe = currentUniverse();
  return universe === "books" ? "" : " " + UNIVERSES[universe].noun;
}

function addGenreRow(slug, titleStart, lazy) {
  const genre = findGenre(slug);
  if (!genre || genre.universe) return; // not one of our genres (never show a broken row)
  addRow(
    { title: titleStart + genre.name + universeSuffix(), titleLink: genreLink(slug), seeAll: genreLink(slug) },
    () => genreCandidates(slug),
    lazy
  );
}

// People are talking about: the 6 books with the most logs, posts and
// comments in the last 7 days (the trending_books_week view).
function talkedAboutCandidates() {
  return remembered("talked-about", async function () {
    const { data, error } = await onlyThisUniverse(db.from("trending_books_week")
      .select("id, external_id, title, author, cover_url, activity, genres"))
      .order("activity", { ascending: false }).order("id", { ascending: true }).limit(6);
    if (error) throw error;
    return data.map((book) => ({ book: book, reason: book.activity + (book.activity === 1 ? " mention" : " mentions") + " this week" }));
  });
}

// 3. Popular this week, topped up with Open Library's trending list
//    (comics and manga: the curated seed list; with 24+ logged books in
//    the universe, Reddle's most logged come before it).
function popularThisWeekCandidates() {
  return remembered("this-week", async function () {
    const universe = currentUniverse();
    const enough = universe !== "books" && (await universeLoggedCount().catch(() => 0)) >= SEED_UNTIL;
    const [reddle, mostLogged, trending] = await Promise.all([
      fetchPopularThisWeek(ROW_SIZE * 2).catch(() => []),
      enough ? fetchMostLoggedOnReddle(ROW_SIZE * 2).catch(() => []) : [],
      fetchTrendingFromOpenLibrary(ROW_SIZE * 2).catch(() => []),
    ]);
    reddle.push(...mostLogged.map((book) => Object.assign({ logs_this_week: 0 }, book)));
    return [
      ...reddle.map((book) => ({ book: book, reason: book.logs_this_week ? book.logs_this_week + (book.logs_this_week === 1 ? " reader" : " readers") + " this week" : statsNote(book) })),
      ...trending.map((book) => ({ book: book, reason: universe === "books" ? "Trending this week" : "A favourite" })),
    ];
  });
}

// 4. New and noteworthy: books someone logged recently. Comics and
//    manga top it up with the newest from Open Library and Google Books.
function newAndNoteworthyCandidates() {
  return remembered("new", async function () {
    const universe = currentUniverse();
    const [recent, newest] = await Promise.all([
      fetchRecentlyLoggedBooks(ROW_SIZE * 2),
      // (one smaller search, and only when you scroll down to this row)
      universe === "books" ? [] : fetchUniverseBooks(universe, null, ROW_SIZE, 0, "newest").catch(() => []),
    ]);
    return [
      ...recent.map((item) => ({ book: item.book, reason: item.username ? "Logged by @" + item.username : "" })),
      ...newest.map((book) => ({ book: openLibraryToBook(book), reason: book.year ? "Out " + book.year : "New" })),
    ];
  });
}

// 4b. Book to screen: books with a film or series coming soon (soonest
//     first), then ones out in the last 12 months (newest first), from
//     the daily Wikidata file (js/screen-data.js). Only books we can
//     open (Open Library id) and only this universe (fillRow checks the
//     genres). Each cover has a small "Film 2026" badge.
function bookToScreenCandidates() {
  return remembered("screen", async function () {
    const data = await loadUpcoming();
    const sources = data.sources || {};
    const seen = new Set();
    const candidates = [];
    for (const [entry, soon] of [...(data.upcoming || []).map((e) => [e, true]), ...(data.recent || []).map((e) => [e, false])]) {
      const source = sources[entry.work];
      if (!source || !source.ol || source.adult || seen.has(source.ol)) continue;
      if (looksAdult([entry.title, source.title])) continue;
      seen.add(source.ol);
      const year = (entry.date || "").slice(0, 4); // announced, no date yet: just "Film"
      candidates.push({
        book: { external_id: source.ol, title: source.title, author: source.author, cover_url: source.cover, genres: source.genres || [] },
        badge: screenKindName(entry.kind).replace(" series", "") + (year ? " " + year : ""),
        reason: (soon ? "Coming: " : "Out: ") + entry.title,
      });
    }
    return candidates;
  });
}

// 4c. Reading news: the 5 newest headlines from other sites for this
//     universe (js/news-data.js), as cards linking to the original
//     articles. Loads when you scroll near it; hidden when there's none.
const HOME_NEWS = 5;

function addNewsRow() {
  const section = el("section", "home-row home-news");
  const head = el("div", "row-head");
  const title = el("h2", "row-title");
  const titleLink = el("a", "", "Reading news");
  titleLink.href = "news.html";
  title.appendChild(titleLink);
  head.appendChild(title);
  const tools = el("div", "row-tools");
  const seeAll = el("a", "see-all", "See all");
  seeAll.href = "news.html";
  tools.appendChild(seeAll);
  head.appendChild(tools);
  section.appendChild(head);
  const list = el("ul", "news-list news-list-compact");
  for (let i = 0; i < 3; i++) list.appendChild(el("li", "news-placeholder"));
  section.appendChild(list);
  rowsBox.appendChild(section);

  whenNearScreen(section, async function () {
    try {
      const data = await loadNews();
      const items = newsForUniverse(data).slice(0, HOME_NEWS);
      list.textContent = "";
      if (items.length === 0) {
        section.hidden = true;
        return;
      }
      items.forEach(function (item) {
        const row = el("li", "news-item");
        row.appendChild(makeNewsCard(item, data.sources));
        list.appendChild(row);
      });
    } catch (error) {
      section.hidden = true;
    }
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
  for (const genre of listedGenres()) {
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

  // People are talking about (the most logged, posted and commented on)
  addRow({ title: "People are talking about" }, talkedAboutCandidates, rows.length >= 2);

  // 3. Popular this week, 4. New and noteworthy
  addRow({ title: "Popular this week", titleLink: "popular.html", seeAll: "popular.html" }, popularThisWeekCandidates, rows.length >= 2);
  addRow({ title: "New and noteworthy" }, newAndNoteworthyCandidates, rows.length >= 2);
  addRow({ title: "Book to screen", titleLink: "screen.html", seeAll: "screen.html" }, bookToScreenCandidates, rows.length >= 2);
  addNewsRow();

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

// ------------------------------------------------------------
// The feed has three tabs (the choice is remembered in this browser):
//   Following: logs and posts from people you follow, and your own
//   Discover:  everyone's logs and posts, except private profiles
//   Popular this week: the most liked and talked about of the last 7 days
// Blocked people and private profiles you aren't approved for are left
// out by the database; muted people are left out here.
// ------------------------------------------------------------

const FEED_TAB_KEY = "reddle-feed-tab";
const FEED_EMPTY_SKELETON = feedList.innerHTML; // the grey loading boxes
let feedFollowingIds = [];
let feedProfile = null;
let feedTab = "discover";

function rememberedTab() {
  try {
    return localStorage.getItem(FEED_TAB_KEY);
  } catch (error) {
    return null;
  }
}

// One kind of thing for showMixedFeed (js/social.js): logs or posts,
// newest first, older than `before`.
// Only this universe: logs of its books, posts made in it.
function inThisUniverseFeed(table, query) {
  return table === "logs" ? onlyThisUniverse(query, "books.genres") : query.eq("universe", currentUniverse());
}

function feedSource(table, select, narrow) {
  if (table === "logs") select = logFieldsWithGenres(select);
  return {
    kind: table === "logs" ? "log" : "post",
    fetch: function (before, count) {
      let query = inThisUniverseFeed(table, withoutMuted(db.from(table).select(select)));
      query = narrow(query);
      if (before) query = query.lt("created_at", before);
      return query.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(count);
    },
  };
}

function followingSources() {
  const ids = feedFollowingIds.concat(feedProfile ? [feedProfile.id] : []);
  return [
    feedSource("logs", LOG_FIELDS, (query) => query.in("user_id", ids)),
    feedSource("posts", POST_FIELDS, (query) => query.in("user_id", ids)),
  ];
}

// Discover leaves out private profiles even when you follow them.
function discoverSources() {
  const logFields = LOG_FIELDS.replace("profiles!logs_user_id_fkey(username, avatar_url)", "profiles!logs_user_id_fkey!inner(username, avatar_url, is_private)");
  const postFields = POST_FIELDS.replace("profiles!posts_user_id_fkey(username, avatar_url)", "profiles!posts_user_id_fkey!inner(username, avatar_url, is_private)");
  return [
    feedSource("logs", logFields, (query) => query.eq("profiles.is_private", false)),
    feedSource("posts", postFields, (query) => query.eq("profiles.is_private", false)),
  ];
}

// The most liked and commented logs (with reviews) and posts of the week.
async function showPopularThisWeekFeed() {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [logs, posts] = await Promise.all([
    inThisUniverseFeed("logs", withoutMuted(db.from("logs").select(logFieldsWithGenres()))).not("review", "is", null).gte("created_at", since)
      .order("created_at", { ascending: false }).limit(150),
    inThisUniverseFeed("posts", withoutMuted(db.from("posts").select(POST_FIELDS))).gte("created_at", since)
      .order("created_at", { ascending: false }).limit(150),
  ]);
  if (logs.error) throw logs.error;
  if (posts.error) throw posts.error;
  const logIds = logs.data.map((log) => log.id);
  const postIds = posts.data.map((post) => post.id);
  const [logLikes, postLikes, logComments, postComments] = await Promise.all([
    logIds.length ? db.from("log_like_counts").select("log_id, like_count").in("log_id", logIds) : { data: [] },
    postIds.length ? db.from("post_like_counts").select("post_id, like_count").in("post_id", postIds) : { data: [] },
    logIds.length ? db.from("comment_counts").select("log_id, comment_count").in("log_id", logIds) : { data: [] },
    postIds.length ? db.from("comment_counts").select("post_id, comment_count").in("post_id", postIds) : { data: [] },
  ]);
  const score = {};
  for (const row of logLikes.data || []) score["log" + row.log_id] = (score["log" + row.log_id] || 0) + row.like_count;
  for (const row of postLikes.data || []) score["post" + row.post_id] = (score["post" + row.post_id] || 0) + row.like_count;
  for (const row of logComments.data || []) score["log" + row.log_id] = (score["log" + row.log_id] || 0) + 2 * row.comment_count;
  for (const row of postComments.data || []) score["post" + row.post_id] = (score["post" + row.post_id] || 0) + 2 * row.comment_count;

  const items = logs.data.map((row) => ({ kind: "log", row: row, score: score["log" + row.id] || 0 }))
    .concat(posts.data.map((row) => ({ kind: "post", row: row, score: score["post" + row.id] || 0 })))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || (a.row.created_at < b.row.created_at ? 1 : -1))
    .slice(0, PAGE_SIZE);

  feedList.textContent = "";
  if (items.length === 0) {
    feedList.appendChild(makeEmptyState("Nothing has been liked or talked about this week yet. Like a review or start a conversation!"));
  }
  for (const item of items) {
    feedList.appendChild(item.kind === "log" ? makeLogCard(item.row, { showUser: true, showBook: true }) : makePostCard(item.row));
  }
  const shownLogs = items.filter((item) => item.kind === "log").map((item) => item.row.id);
  const shownPosts = items.filter((item) => item.kind === "post").map((item) => item.row.id);
  fillLikes(shownLogs);
  fillPostLikes(shownPosts);
  fillCommentCounts("log", shownLogs);
  fillCommentCounts("post", shownPosts);
  const more = el("p", "center feed-more-link");
  const link = el("a", "", "See the most popular books this week \u2192");
  link.href = "popular.html";
  more.appendChild(link);
  feedList.appendChild(more);
}

async function showFeedTab(tab) {
  feedTab = tab;
  try {
    localStorage.setItem(FEED_TAB_KEY, tab);
  } catch (error) {
    // not remembered, that's fine
  }
  document.querySelectorAll(".feed-tab").forEach(function (button) {
    const active = button.dataset.tab === tab;
    button.setAttribute("aria-selected", active ? "true" : "false");
    button.classList.toggle("feed-tab-active", active);
  });
  feedNote.hidden = true;
  feedList.innerHTML = FEED_EMPTY_SKELETON; // our own markup, not user text
  const cardOptions = { showUser: true, showBook: true };

  if (tab === "popular") {
    await showPopularThisWeekFeed();
  } else if (tab === "following") {
    if (feedFollowingIds.length === 0) {
      feedNote.textContent = "You're not following anyone yet. Have a look in Discover and follow some readers.";
      feedNote.hidden = false;
    }
    await showMixedFeed(feedList, followingSources(), "Nothing here yet. Share a thought, or follow some readers from Discover.", cardOptions);
  } else {
    await showMixedFeed(feedList, discoverSources(), "Nothing logged or shared yet. Search for a book you've read and log it!", cardOptions);
  }
  if (feedTab === tab) addSeedSuggestions(tab).catch(() => {});
}

// An empty Comics or Manga feed suggests a few well-known titles from
// the curated seed list (js/universe-seeds.js) to start with.
async function addSeedSuggestions(tab) {
  const universe = currentUniverse();
  if (universe === "books" || !feedList.querySelector(".empty-note")) return;
  const books = await makeSeedStream(universe).next(6);
  if (books.length === 0 || feedTab !== tab || !feedList.querySelector(".empty-note") || feedList.querySelector(".seed-suggestions")) return;
  const box = el("div", "seed-suggestions");
  box.appendChild(el("p", "hint", "Start with these " + UNIVERSES[universe].noun + ":"));
  const row = el("div", "tile-row");
  for (const book of books) row.appendChild(makeBookTile(openLibraryToBook(book)));
  box.appendChild(row);
  feedList.appendChild(box);
}

async function loadFeed(profile, followingIds) {
  feedProfile = profile;
  feedFollowingIds = followingIds;
  mutedPeople = await mutedIds();

  const followingTab = document.querySelector('.feed-tab[data-tab="following"]');
  followingTab.hidden = !profile;
  document.querySelectorAll(".feed-tab").forEach(function (button) {
    button.addEventListener("click", function () {
      showFeedTab(button.dataset.tab).catch((error) => showHomeStatus(explainError(error)));
    });
  });

  // A new post (or answer to the weekly question) shows at the top
  // of the feed straight away.
  function showNewPost(post) {
    if (feedTab === "popular") return;
    const empty = feedList.querySelector(".empty-note");
    if (empty) empty.remove();
    const seeds = feedList.querySelector(".seed-suggestions");
    if (seeds) seeds.remove();
    feedList.prepend(makePostCard(post));
  }

  // This week's question, if the admin set one.
  fetchLatestPrompt().then(function (prompt) {
    if (prompt) document.getElementById("prompt-spot").appendChild(makePromptCard(prompt, { onPosted: showNewPost }));
  }).catch(() => {}); // a nice extra: never break the feed

  // "Share a thought" (logged in)
  if (profile) {
    document.getElementById("composer-spot").appendChild(makePostComposer({ onPosted: showNewPost }));
  }

  // Which tab: the one you chose last time, else Following if you follow
  // anyone, else Discover.
  let tab = rememberedTab();
  if (!["following", "discover", "popular"].includes(tab) || (tab === "following" && !profile)) {
    tab = profile && followingIds.length ? "following" : "discover";
  }
  await showFeedTab(tab);
}


// ------------------------------------------------------------
// Start
// ------------------------------------------------------------

async function loadHome() {
  // Arrived here straight after deleting an account?
  // The goodbye message is shown once: the address is cleaned up straight
  // away (so reloading or bookmarking the page doesn't bring it back) and
  // the message goes away by itself after 10 seconds.
  const arrivedParams = new URLSearchParams(window.location.search);
  if (arrivedParams.get("deleted")) {
    const goodbye = document.getElementById("deleted-message");
    goodbye.hidden = false;
    setTimeout(function () { goodbye.hidden = true; }, 10000);
    arrivedParams.delete("deleted");
    const rest = arrivedParams.toString();
    try {
      window.history.replaceState(null, "", window.location.pathname + (rest ? "?" + rest : "") + window.location.hash);
    } catch (error) {
      // Not allowed (e.g. a local file): the message just stays until you leave the page.
    }
  }

  const { profile } = await authReady;
  if (!db) return; // auth.js already shows the problem at the top of the page

  if (!profile) document.getElementById("welcome").hidden = false;

  // Your books and who you follow, at the same time.
  const [myBooks, followingIds] = profile
    ? await Promise.all([loadMyBooks(profile.id), loadFollowingIds(profile.id)])
    : [{ logs: [], knownIds: [], known: new Set() }, []];
  knownBooks = myBooks.known;

  // Spotlight (admin news for this universe) at the very top.
  fetchLatestSpotlight().then(function (spotlight) {
    if (!spotlight) return;
    document.getElementById("spotlight-spot").appendChild(makeSpotlightCard(spotlight));
    fillCommentCounts("spotlight", [spotlight.id]);
  }).catch(() => {}); // a nice extra: never break the page

  // Book of the week at the top, if the admin chose one.
  fetchLatestPick().then(function (pick) {
    if (pick && pick.books) {
      const card = makePickCard(pick);
      document.getElementById("pick-spot").appendChild(card);
      fillCommentCounts("pick", [pick.id]);
    }
  }).catch(() => {}); // a nice extra: never break the page

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
