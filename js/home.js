// ------------------------------------------------------------
// Home page
// ------------------------------------------------------------
// Logged out: a welcome message and recent activity from everyone.
// Logged in:  your feed, the latest logs from the people you follow.
//             If you don't follow anyone yet, recent activity from
//             everyone instead, so you can find people to follow.
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

async function loadHome() {
  // Arrived here straight after deleting an account?
  if (new URLSearchParams(window.location.search).get("deleted")) {
    document.getElementById("deleted-message").hidden = false;
  }

  const { profile } = await authReady;

  if (!db) {
    return; // auth.js already shows the problem at the top of the page
    return;
  }

  const cardOptions = { showUser: true, showBook: true };

  // Logged out: show the welcome box, popular books and everyone's activity.
  if (!profile) {
    document.getElementById("welcome").hidden = false;
    loadForYou(null, []);
    feedHeading.textContent = "Recent activity";
    await showPagedLogs(feedList, everyoneQuery, cardOptions, "Nothing logged yet.");
    return;
  }

  // Logged in.
  const ids = await loadFollowingIds(profile.id);
  loadForYou(profile, ids); // suggestions load alongside the feed

  if (ids.length === 0) {
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
  await showPagedLogs(feedList, followingQuery(ids), cardOptions,
    "The people you follow haven't logged anything yet.");
}

loadHome().catch(function (error) {
  console.error(error);
  showHomeStatus(explainError(error));
});


// ------------------------------------------------------------
// "For you": book suggestions at the top of the home page
// ------------------------------------------------------------
// Logged in, in this order:
//   1. books people you follow rated 4 stars or more
//   2. top-rated Reddle books in your favourite genres and the genres of
//      books you rated 4 or more
//   3. popular Open Library books in those genres (to fill up)
// Never books you've logged or put on a shelf.
// Logged out (or nothing to go on yet): the most logged books on Reddle,
// topped up with what's trending on Open Library.
// ------------------------------------------------------------

const FOR_YOU_SIZE = 12;

// Your genres, best first: favourites count 2, each book you rated 4+
// adds 1 to its genres. Returns up to 4 slugs.
function tasteGenres(profile, myLogs) {
  const score = {};
  for (const slug of profile.favorite_genres || []) score[slug] = (score[slug] || 0) + 2;
  for (const log of myLogs) {
    if (Number(log.rating) >= 4 && log.books) {
      for (const slug of log.books.genres || []) score[slug] = (score[slug] || 0) + 1;
    }
  }
  return Object.keys(score).sort((a, b) => score[b] - score[a]).slice(0, 4);
}

async function suggestionsFor(profile, followingIds) {
  // Everything you've logged or shelved, so we can leave it out.
  const [logsResult, shelvesResult] = await Promise.all([
    db.from("logs").select("book_id, rating, books(external_id, genres)").eq("user_id", profile.id),
    db.from("shelves").select("book_id, books(external_id)").eq("user_id", profile.id),
  ]);
  if (logsResult.error) throw logsResult.error;
  const myLogs = logsResult.data;
  const myShelves = shelvesResult.data || [];
  const knownIds = [...myLogs, ...myShelves].map((row) => row.book_id);
  const knownExternal = new Set([...myLogs, ...myShelves].map((row) => row.books && row.books.external_id));

  const picks = [];
  const pickedExternal = new Set();
  function add(book, reason) {
    if (picks.length >= FOR_YOU_SIZE) return;
    if (knownExternal.has(book.external_id) || pickedExternal.has(book.external_id)) return;
    pickedExternal.add(book.external_id);
    picks.push({ book: book, reason: reason });
  }

  // 1. Loved by people you follow
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
      if (log.books) add(log.books, "★ " + Number(log.rating) + " from @" + log.profiles.username);
    }
  }

  // 2. Top rated on Reddle in your genres
  const genres = tasteGenres(profile, myLogs);
  const topRated = await fetchTopRatedInGenres(genres, knownIds, FOR_YOU_SIZE);
  for (const book of topRated) {
    const shared = (book.genres || []).find((slug) => genres.includes(slug));
    add(book, shared ? "Because you like " + findGenre(shared).name : "Highly rated");
  }

  // 3. Popular on Open Library in your top genres, taking turns between
  //    genres so you get a mix.
  if (picks.length < FOR_YOU_SIZE && genres.length > 0) {
    const lists = await Promise.all(
      genres.map((slug) => fetchGenreBooksFromOpenLibrary(slug, FOR_YOU_SIZE, 0).catch(() => []))
    );
    for (let i = 0; i < FOR_YOU_SIZE; i++) {
      lists.forEach(function (list, g) {
        if (list[i]) add(openLibraryToBook(list[i]), "Popular in " + findGenre(genres[g]).name);
      });
    }
  }

  return { picks: picks, hasTaste: genres.length > 0 || followingIds.length > 0 };
}

// Popular books for everyone: most logged on Reddle, then trending on
// Open Library.
async function popularPicks(excludeExternal) {
  const picks = [];
  const seen = new Set(excludeExternal || []);
  for (const book of await fetchMostLoggedOnReddle(FOR_YOU_SIZE)) {
    if (!seen.has(book.external_id)) {
      seen.add(book.external_id);
      picks.push({ book: book, reason: book.log_count + (book.log_count === 1 ? " reader" : " readers") });
    }
  }
  if (picks.length < FOR_YOU_SIZE) {
    const trending = await fetchTrendingFromOpenLibrary(FOR_YOU_SIZE).catch(() => []);
    for (const book of trending) {
      if (picks.length >= FOR_YOU_SIZE) break;
      if (!seen.has(book.external_id)) {
        seen.add(book.external_id);
        picks.push({ book: book, reason: "Trending this week" });
      }
    }
  }
  return picks;
}

function showPicks(heading, note, picks) {
  if (picks.length === 0) return;
  document.getElementById("for-you-heading").textContent = heading;
  const noteBox = document.getElementById("for-you-note");
  noteBox.hidden = !note;
  if (note) noteBox.innerHTML = note; // our own text with a link, never user text
  const row = document.getElementById("for-you-books");
  row.textContent = "";
  for (const pick of picks) row.appendChild(makeBookTile(pick.book, "", pick.reason));
  document.getElementById("for-you").hidden = false;
}

// Called by loadHome(). Suggestions are a bonus: if anything fails, the
// section just stays hidden and the feed still works.
async function loadForYou(profile, followingIds) {
  try {
    if (!profile) {
      showPicks("Popular books", "", await popularPicks());
      return;
    }
    const result = await suggestionsFor(profile, followingIds);
    if (result.picks.length > 0) {
      showPicks("For you", "", result.picks);
    } else {
      showPicks(
        "Popular books",
        result.hasTaste ? "" : 'Rate a few books or <a href="welcome.html?redo=1">pick your favourite genres</a> to get suggestions just for you.',
        await popularPicks()
      );
    }
  } catch (error) {
    console.error("Suggestions didn't load:", error);
  }
}
