// ------------------------------------------------------------
// Shared book helpers: Open Library, saving books, stars, log cards.
// ------------------------------------------------------------
// Load this after js/auth.js on pages that show books.
//
// Where book information comes from:
//   We use Open Library (openlibrary.org). It's free and needs no key.
//   A book's "external id" is its Open Library work id, like "OL45804W".
//   The first time anyone logs a book, we save a copy in our own
//   `books` table, and logs point at that copy.
// ------------------------------------------------------------


// ---------- Open Library ----------

const OPEN_LIBRARY = "https://openlibrary.org";

// Book ids: Open Library work ids (OL45804W) or Google Books ids
// ("GB" + Google's volume id, see js/sources.js).
function isValidBookId(id) {
  return /^OL\d+W$/.test(id) || isGoogleBookId(id);
}

// "/works/OL45804W" -> "OL45804W"
function workIdFromKey(key) {
  return key.split("/").pop();
}

function coverUrlFromId(coverId, size) {
  // size: "S" small, "M" medium, "L" large.
  // "default=false" makes Open Library answer "not found" for a missing
  // cover (instead of a blank picture), so we can try somewhere else.
  return "https://covers.openlibrary.org/b/id/" + coverId + "-" + size + ".jpg?default=false";
}


// ---------- Covers from elsewhere (Google Books) ----------
//
// When Open Library has no cover, we ask Google Books: first by ISBN
// (exact), then by title and author. Answers are remembered for this
// browser tab, so the same book isn't looked up twice.

const coverLookups = new Map();

// (cleanGoogleCover() is in js/sources.js.)

async function askGoogleBooks(query) {
  const url =
    "https://www.googleapis.com/books/v1/volumes?maxResults=3" +
    "&fields=items(volumeInfo(title,imageLinks))" +
    "&q=" + encodeURIComponent(query);
  const data = await googleJson(url); // js/sources.js (adds the key, if any)
  const items = (data && data.items) || [];
  for (const item of items) {
    const links = item.volumeInfo && item.volumeInfo.imageLinks;
    if (links && (links.thumbnail || links.smallThumbnail)) {
      return cleanGoogleCover(links.thumbnail || links.smallThumbnail);
    }
  }
  return null;
}

// Returns a cover link, or null if nobody has one.
// `book` has any of: isbns (a list), title, author.
function findCoverElsewhere(book) {
  const key = (book.isbns || []).join(",") + "|" + (book.title || "") + "|" + (book.author || "");
  if (!coverLookups.has(key)) {
    coverLookups.set(key, (async function () {
      for (const isbn of book.isbns || []) {
        const found = await askGoogleBooks("isbn:" + isbn);
        if (found) return found;
      }
      if (book.title && book.author) {
        return await askGoogleBooks('intitle:"' + book.title + '" inauthor:"' + book.author + '"');
      }
      return null;
    })().catch(() => null));
  }
  return coverLookups.get(key);
}

// fetch() for Open Library. If Open Library can't be reached, the error
// says so in plain words (instead of blaming Reddle).
async function fetchOpenLibrary(url) {
  try {
    return await fetch(url);
  } catch (error) {
    throw new Error(
      "We couldn't reach Open Library, where our book information comes from. " +
        "Check your internet connection and try again in a minute."
    );
  }
}

// Searches the current universe (js/sources.js): Open Library for
// books, Open Library and Google Books for comics and manga. Returns a
// list of { externalId, title, author, coverUrl, year, isbns, genres }.
async function searchBooks(query) {
  return searchUniverseBooks(query, 20);
}

// Fetches one book's details from Open Library, in the same shape as a row
// of our `books` table (without the id). Returns null if it doesn't exist.
async function fetchBookFromOpenLibrary(externalId) {
  const workResponse = await fetchOpenLibrary(OPEN_LIBRARY + "/works/" + externalId + ".json");
  if (workResponse.status === 404) return null;
  if (!workResponse.ok) throw new Error("Open Library isn't answering right now (error " + workResponse.status + "). Try again in a minute.");
  const work = await workResponse.json();

  // The author's name and the ISBN live in other places, so ask for those
  // at the same time. If either fails we just leave it empty.
  const authorKey =
    work.authors && work.authors[0] && work.authors[0].author
      ? work.authors[0].author.key
      : null;

  // (The author's other names, e.g. in Japanese, help spot manga.)
  const [authorRecord, editions] = await Promise.all([
    authorKey ? fetchJson(OPEN_LIBRARY + authorKey + ".json") : null,
    fetchJson(OPEN_LIBRARY + "/works/" + externalId + "/editions.json?limit=20"),
  ]);
  const author = authorRecord && authorRecord.name;
  const authorNames = authorRecord ? [authorRecord.name].concat(authorRecord.alternate_names || []) : [];
  const isbn = findIsbn(editions);
  const pageCount = findPageCount(editions);

  // The description is sometimes plain text, sometimes { value: "text" }.
  let description = work.description || "";
  if (typeof description === "object") description = description.value || "";
  // Some descriptions end with a "----------" line followed by notes and
  // links. Keep only the part before it.
  description = description.split(/\n\s*-{3,}/)[0];

  // The cover: the book's own, else another edition's, else Google Books.
  const coverId =
    (work.covers || []).find((id) => id > 0) ||
    findEditionCoverId(editions);
  const coverUrl = coverId
    ? coverUrlFromId(coverId, "L")
    : await findCoverElsewhere({ isbns: isbn ? [isbn] : [], title: work.title, author: author });

  return {
    external_id: externalId,
    title: work.title,
    author: author || null,
    cover_url: coverUrl || null,
    description: description.trim() || null,
    isbn: isbn || null,
    genres: genresFromSubjects(work.subjects, authorNames),
    page_count: pageCount,
  };
}

// The usual number of pages across a book's editions (the middle value,
// so one odd edition doesn't skew it), or null if none say.
function findPageCount(editions) {
  if (!editions || !editions.entries) return null;
  const counts = editions.entries
    .map((edition) => Number(edition.number_of_pages))
    .filter((pages) => pages >= 1 && pages <= 50000)
    .sort((a, b) => a - b);
  return counts.length ? counts[Math.floor(counts.length / 2)] : null;
}

// Just the page count, for books saved before we kept it.
async function fetchPageCount(externalId) {
  return findPageCount(await fetchJson(OPEN_LIBRARY + "/works/" + externalId + "/editions.json?limit=20"));
}

// Fetches JSON, or gives null if anything goes wrong.
async function fetchJson(url) {
  try {
    const response = await fetch(url);
    return response.ok ? await response.json() : null;
  } catch (error) {
    return null;
  }
}

// The first cover found on any edition of the book, or null.
function findEditionCoverId(editions) {
  if (!editions || !editions.entries) return null;
  for (const edition of editions.entries) {
    const id = (edition.covers || []).find((coverId) => coverId > 0);
    if (id) return id;
  }
  return null;
}

// Picks the first ISBN from a list of editions (13-digit ones preferred).
function findIsbn(editions) {
  if (!editions || !editions.entries) return null;
  for (const edition of editions.entries) {
    if (edition.isbn_13 && edition.isbn_13[0]) return edition.isbn_13[0];
  }
  for (const edition of editions.entries) {
    if (edition.isbn_10 && edition.isbn_10[0]) return edition.isbn_10[0];
  }
  return null;
}


// ---------- Genres ----------
//
// GENRES, findGenre(), genreLink() and genresFromSubjects() live in
// js/sources.js (every page needs them for the universes).

// Small genre tags (links) for a book page.
function makeGenreTags(slugs) {
  const tags = el("p", "genre-tags");
  for (const slug of slugs) {
    const genre = findGenre(slug);
    if (!genre) continue;
    const tag = el("a", "genre-tag", genre.name);
    tag.href = genreLink(slug);
    tags.appendChild(tag);
  }
  return tags;
}

// Popular books in a genre, from Open Library's subject pages.
// Returns [{ externalId, title, author, coverUrl }].
async function fetchGenreBooksFromOpenLibrary(slug, limit, offset) {
  const genre = findGenre(slug);
  if (!genre) return [];
  // Comics and manga: that genre within comics or manga (js/sources.js).
  const universe = currentUniverse();
  if (genre.universe) return fetchUniverseBooks(genre.universe, null, limit, offset || 0, "popular");
  if (universe !== "books") return fetchUniverseBooks(universe, slug, limit, offset || 0, "popular");
  const url =
    OPEN_LIBRARY + "/subjects/" + genre.subject + ".json" +
    "?limit=" + (limit || 24) + "&offset=" + (offset || 0);
  const response = await fetchOpenLibrary(url);
  if (!response.ok) throw new Error("Open Library isn't answering right now (error " + response.status + "). Try again in a minute.");
  const data = await response.json();
  // Books universe: leave out comics, manga and anything adult.
  return (data.works || []).map(function (work) {
    return {
      externalId: workIdFromKey(work.key),
      title: work.title,
      author: work.authors && work.authors[0] ? work.authors[0].name : "",
      coverUrl: work.cover_id ? coverUrlFromId(work.cover_id, "M") : null,
      coverId: work.cover_id || null,
      genres: genresFromSubjects(work.subject || [], (work.authors || []).map((person) => person.name)),
      subjects: work.subject || [],
    };
  }).filter((book) => fitsUniverse(book, "books"));
}


// ---------- Popular and top-rated lists ----------

// Books on Reddle in any of these genres that readers rated highly (an
// average of 3.5 stars or more), best first, then most logged. Leaves out
// any book whose id is in `excludeIds`.
async function fetchTopRatedInGenres(genres, excludeIds, limit) {
  if (!genres || genres.length === 0) return [];
  const { data, error } = await onlyThisUniverse(db
    .from("books_with_stats")
    .select("id, external_id, title, author, cover_url, genres, log_count, avg_rating")
    .overlaps("genres", genres)) // shares at least one genre
    .gte("avg_rating", 3.5)
    .order("avg_rating", { ascending: false, nullsFirst: false })
    .order("log_count", { ascending: false })
    .limit(limit + excludeIds.length);
  if (error) throw error;
  const skip = new Set(excludeIds);
  return data.filter((book) => !skip.has(book.id)).slice(0, limit);
}

// The most logged books on Reddle (in this universe).
async function fetchMostLoggedOnReddle(limit) {
  const { data, error } = await onlyThisUniverse(db
    .from("books_with_stats")
    .select("id, external_id, title, author, cover_url, genres, log_count, avg_rating"))
    .gt("log_count", 0)
    .order("log_count", { ascending: false })
    .order("avg_rating", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

// The books logged most on Reddle in the last 7 days (then best rated),
// in this universe.
async function fetchPopularThisWeek(limit) {
  const { data, error } = await onlyThisUniverse(db
    .from("books_with_stats")
    .select("id, external_id, title, author, cover_url, genres, log_count, avg_rating, logs_this_week"))
    .gt("logs_this_week", 0)
    .order("logs_this_week", { ascending: false })
    .order("avg_rating", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

// Books someone logged recently, newest first, each book once, with
// the username of whoever logged it (in this universe).
async function fetchRecentlyLoggedBooks(limit) {
  const { data, error } = await onlyThisUniverse(db
    .from("logs")
    .select("created_at, profiles!logs_user_id_fkey(username), books!inner(id, external_id, title, author, cover_url, genres)"), "books.genres")
    .order("created_at", { ascending: false })
    .limit(limit * 4);
  if (error) throw error;
  const seen = new Set();
  const books = [];
  for (const log of data) {
    if (!log.books || seen.has(log.books.external_id)) continue;
    seen.add(log.books.external_id);
    books.push({ book: log.books, username: log.profiles ? log.profiles.username : "" });
  }
  return books.slice(0, limit);
}

// How many books of this universe Reddle readers have logged (comics
// and manga lists lean on the curated seed lists until there are 24).
const SEED_UNTIL = 24;

async function universeLoggedCount() {
  const { count } = await onlyThisUniverse(db.from("books_with_stats").select("id", { count: "exact", head: true })).gt("log_count", 0);
  return count || 0;
}

// What's popular on Open Library this week. Comics and manga: the
// curated seed list instead (js/universe-seeds.js), because Open
// Library's "popular comics" are mostly classics with one comic edition.
// Returns our tile shape.
async function fetchTrendingFromOpenLibrary(limit) {
  const universe = currentUniverse();
  if (universe !== "books") {
    const found = await makeSeedStream(universe).next(limit);
    return found.map(openLibraryToBook);
  }
  const response = await fetchOpenLibrary(OPEN_LIBRARY + "/trending/weekly.json?limit=" + limit);
  if (!response.ok) return [];
  const data = await response.json();
  return (data.works || [])
    .filter((work) => !looksAdult([work.title].concat(work.subject || [])))
    .filter((work) => !work.subject || bookInUniverse({ genres: genresFromSubjects(work.subject) }, "books"))
    .map((work) => ({
      external_id: workIdFromKey(work.key),
      title: work.title,
      author: work.author_name ? work.author_name[0] : "",
      cover_url: work.cover_i ? coverUrlFromId(work.cover_i, "M") : null,
    }));
}


// ---------- Our own books table ----------

// Gets our saved copy of a book, or null if nobody has logged it yet.
async function getSavedBook(externalId) {
  const { data, error } = await db
    .from("books")
    .select("*")
    .eq("external_id", externalId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Saves a copy of the book if we don't have one yet, and returns our row
// (with its id). `book` is what fetchBookFromOpenLibrary returned.
async function saveBookIfNeeded(book) {
  const existing = await getSavedBook(book.external_id);
  if (existing) return existing;

  const { data, error } = await db.from("books").insert(book).select().single();
  if (!error) return data;

  // 23505 = someone else saved it a moment ago. Just use theirs.
  if (error.code === "23505") return await getSavedBook(book.external_id);
  throw error;
}

// bookLink() (the link to a book page) lives in js/auth.js, next to
// profileLink() and authorLink(), because the header search uses it on
// every page.


// ---------- Stars ----------

// 3.5 -> "★★★½". Empty rating -> "".
function starsText(rating) {
  if (!rating) return "";
  const whole = Math.floor(rating);
  return "★".repeat(whole) + (rating - whole === 0.5 ? "½" : "");
}


// ---------- Covers ----------

// A book cover image, or a plain box with the title when there's no cover.
//
// If there's no cover link, or the picture doesn't load, we look for one
// elsewhere (findCoverElsewhere) and swap it in when found. The plain box
// with the title is only for books nobody has a cover for.
// `book` can also have `isbn` / `isbns` and `author`, which help that search.
function makeCover(book, sizeClass) {
  const titleBox = el("div", "cover cover-missing " + sizeClass, book.title);

  function lookElsewhere(current) {
    const isbns = book.isbns || (book.isbn ? [book.isbn] : []);
    findCoverElsewhere({ isbns: isbns, title: book.title, author: book.author }).then(function (link) {
      if (link && link !== book.cover_url && current.isConnected) {
        current.replaceWith(makeImage(link, false));
      } else if (current !== titleBox && current.isConnected) {
        current.replaceWith(titleBox);
      }
    });
  }

  function makeImage(link, canRetry) {
    const img = el("img", "cover " + sizeClass);
    img.alt = book.title;
    img.loading = "lazy";
    img.decoding = "async";
    // A broken or tiny (blank placeholder) picture counts as no cover.
    img.addEventListener("error", function () {
      if (canRetry) lookElsewhere(img);
      else if (img.isConnected) img.replaceWith(titleBox);
    });
    img.addEventListener("load", function () {
      if (img.naturalWidth < 10) img.dispatchEvent(new Event("error"));
    });
    img.src = link;
    return img;
  }

  if (book.cover_url) return makeImage(book.cover_url, true);
  lookElsewhere(titleBox);
  return titleBox;
}


// A cover that links to the book page, with the title shown on hover.
// Used for the shelves on the profile page.
function makeCoverLink(book) {
  const link = el("a", "cover-link");
  link.href = bookLink(book.external_id);
  link.title = book.author ? book.title + " by " + book.author : book.title;
  link.appendChild(makeCover(book, "cover-medium"));
  return link;
}


// A book as a tile: cover, title, author, and an optional small note
// underneath (like "★ 4.2 · 12 logs"). `book` needs external_id, title,
// author and cover_url. Used on genre pages and for recommendations.
// `reason` (optional) is a grey line underneath, like "Because you like Fantasy".
function makeBookTile(book, note, reason) {
  const tile = el("a", "book-tile");
  tile.href = bookLink(book.external_id);
  tile.appendChild(makeCover(book, "cover-medium"));
  tile.appendChild(el("span", "book-tile-title", book.title));
  if (book.author) tile.appendChild(el("span", "book-tile-author", book.author));
  if (note) tile.appendChild(el("span", "book-tile-note", note));
  if (reason) tile.appendChild(el("span", "book-tile-reason", reason));
  return tile;
}

// "★ 4.2 · 12 logs" for a row of books_with_stats.
function statsNote(book) {
  const parts = [];
  if (book.avg_rating) parts.push("\u2605 " + Number(book.avg_rating).toFixed(1));
  if (book.log_count) parts.push(book.log_count + (book.log_count === 1 ? " log" : " logs"));
  return parts.join(" \u00b7 ");
}

// Turns a book from Open Library lists ({ externalId, title, author,
// coverUrl }) into the shape our tiles use.
function openLibraryToBook(book) {
  return { external_id: book.externalId, title: book.title, author: book.author, cover_url: book.coverUrl, isbns: book.isbns, genres: book.genres };
}


// ---------- Rating breakdown (book page) ----------

// A small bar chart: how many ratings at each half star from 0.5 to 5.
// `ratings` is a list of numbers.
function makeRatingChart(ratings) {
  const steps = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];
  const counts = steps.map((step) => ratings.filter((rating) => rating === step).length);
  const most = Math.max(1, ...counts);
  const chart = el("div", "rating-chart");
  chart.setAttribute("role", "img");
  chart.setAttribute("aria-label", "Ratings: " + steps.map((step, i) => step + " stars, " + counts[i]).join("; "));
  const bars = el("div", "rating-bars");
  steps.forEach(function (step, i) {
    const bar = el("span", "rating-bar");
    bar.style.height = Math.max(3, Math.round((counts[i] / most) * 100)) + "%";
    bar.title = step + " \u2605: " + counts[i] + (counts[i] === 1 ? " rating" : " ratings");
    if (counts[i] === 0) bar.classList.add("rating-bar-empty");
    bars.appendChild(bar);
  });
  const ends = el("div", "rating-ends");
  ends.append(el("span", "", "\u00bd\u2605"), el("span", "", "5\u2605"));
  chart.append(bars, ends);
  return chart;
}


// ---------- Log cards (feed, book page, profile) ----------

// ---------- Share a review as a picture (js/share-card.js) ----------

function makeReviewImageButton(log) {
  const button = el("button", "link-button", "Share as image");
  button.type = "button";
  button.addEventListener("click", async function () {
    button.disabled = true;
    button.textContent = "Making picture...";
    try {
      const canvas = await makeReviewCard(log);
      const result = await shareCanvas(canvas, cardFileName("my-review", log.books && log.books.title), "My review on Reddle");
      button.textContent = result === "downloaded" ? "Picture saved" : "Share as image";
    } catch (error) {
      window.alert(friendlyError(error, "Couldn't make the picture. "));
      button.textContent = "Share as image";
    } finally {
      button.disabled = false;
      setTimeout(() => (button.textContent = "Share as image"), 2500);
    }
  });
  return button;
}


// ---------- Likes (supabase/step17-likes.sql) ----------
//
// A heart with a count on every log card. One like per person per log;
// press again to take it back. Logged out, the heart leads to Log in.
// You can't like your own log (the heart just shows the count).

function makeLikeButton(log) {
  const button = el("button", "like-button");
  button.type = "button";
  button.dataset.logId = log.id;
  button.dataset.count = "0";
  button.setAttribute("aria-pressed", "false");
  button.appendChild(el("span", "like-heart", "\u2665"));
  button.appendChild(el("span", "like-count", ""));
  const isMine = currentUserId && log.user_id === currentUserId;
  if (isMine) {
    button.disabled = true;
    button.title = "Likes on your log";
  } else {
    button.title = currentUserId ? "Like" : "Log in to like";
    button.addEventListener("click", () => toggleLike(button));
  }
  updateLikeLabel(button);
  return button;
}

function updateLikeLabel(button) {
  const count = Number(button.dataset.count);
  const liked = button.getAttribute("aria-pressed") === "true";
  button.querySelector(".like-count").textContent = count > 0 ? String(count) : "";
  button.setAttribute("aria-label", (liked ? "Unlike" : "Like") + " (" + count + (count === 1 ? " like)" : " likes)"));
}

// Fills in the counts (and your own likes) for logs just put on the page.
async function fillLikes(logIds) {
  if (!db || logIds.length === 0) return;
  const [counts, mine] = await Promise.all([
    db.from("log_like_counts").select("log_id, like_count").in("log_id", logIds),
    currentUserId
      ? db.from("likes").select("log_id").eq("user_id", currentUserId).in("log_id", logIds)
      : Promise.resolve({ data: [] }),
  ]);
  const countFor = {};
  for (const row of counts.data || []) countFor[row.log_id] = row.like_count;
  const likedByMe = new Set((mine.data || []).map((row) => row.log_id));
  for (const id of logIds) {
    document.querySelectorAll('.like-button[data-log-id="' + id + '"]').forEach(function (button) {
      button.dataset.count = String(countFor[id] || 0);
      button.setAttribute("aria-pressed", likedByMe.has(id) ? "true" : "false");
      updateLikeLabel(button);
    });
  }
}

async function toggleLike(button) {
  if (!currentUserId) {
    rememberReturnPage(window.location.href);
    window.location.href = "login.html";
    return;
  }
  const logId = Number(button.dataset.logId);
  const wasLiked = button.getAttribute("aria-pressed") === "true";
  const before = Number(button.dataset.count);

  // Change it on screen straight away; undo if the database says no.
  button.disabled = true;
  button.setAttribute("aria-pressed", wasLiked ? "false" : "true");
  button.dataset.count = String(Math.max(0, before + (wasLiked ? -1 : 1)));
  updateLikeLabel(button);

  const { error } = wasLiked
    ? await db.from("likes").delete().eq("user_id", currentUserId).eq("log_id", logId)
    : await db.from("likes").insert({ log_id: logId });
  button.disabled = false;

  if (error && error.code !== "23505") { // 23505 = already liked, fine
    button.setAttribute("aria-pressed", wasLiked ? "true" : "false");
    button.dataset.count = String(before);
    updateLikeLabel(button);
    window.alert(friendlyError(error, "Couldn't save your like. "));
  }
}


// Turns a date like "2026-10-12" into "12 Oct 2026".
function formatDate(dateText) {
  if (!dateText) return "";
  const date = new Date(dateText + "T00:00:00");
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

// What every query for log cards asks for: the log, plus the person who
// wrote it and the book (Supabase joins them in for us).
const LOG_FIELDS =
  "id, rating, review, spoiler, reread_count, reread_dates, date_read, created_at, user_id, book_id, " +
  "profiles!logs_user_id_fkey(username, avatar_url), " +
  "books(external_id, title, author, cover_url)";

// LOG_FIELDS with the book's genres, joined with books!inner so a
// "books.genres" filter (onlyThisUniverse) leaves out logs of books
// from other universes.
function logFieldsWithGenres(fields) {
  return (fields || LOG_FIELDS).replace("books(external_id, title, author, cover_url)", "books!inner(external_id, title, author, cover_url, genres)");
}

// "Read 3 times" (a reread count of 2 means three reads in total).
function rereadText(rereadCount) {
  return "\u21bb Read " + (rereadCount + 1) + " times";
}

// The review text. Spoiler reviews stay hidden behind a button.
function makeReview(log, className) {
  const text = el("p", className || "log-review", log.review);
  if (!log.spoiler) return text;
  const box = el("div", "spoiler-box");
  const button = el("button", "button button-secondary spoiler-button", "Show spoiler");
  button.type = "button";
  button.setAttribute("aria-expanded", "false");
  text.hidden = true;
  button.addEventListener("click", function () {
    const show = text.hidden;
    text.hidden = !show;
    button.textContent = show ? "Hide spoiler" : "Show spoiler";
    button.setAttribute("aria-expanded", String(show));
  });
  box.append(el("span", "spoiler-note", "This review contains spoilers."), button, text);
  return box;
}

// One log as a card.
//   showBook: show the cover and title (feed and profile)
//   showUser: show who wrote it (feed and book page)
function makeLogCard(log, options) {
  const card = el("article", "log-card");

  if (options.showBook) {
    const coverLink = el("a", "log-cover");
    coverLink.href = bookLink(log.books.external_id);
    coverLink.appendChild(makeCover(log.books, "cover-small"));
    card.appendChild(coverLink);
  }

  const body = el("div", "log-body");

  // Top line: "@username" and/or "Book title, Author"
  const top = el("p", "log-top");
  if (options.showUser) {
    const userLink = el("a", "log-user");
    userLink.href = profileLink(log.profiles.username);
    userLink.appendChild(makeAvatar(log.profiles, "avatar-tiny"));
    userLink.appendChild(el("span", "", "@" + log.profiles.username));
    top.appendChild(userLink);
  }
  if (options.showBook) {
    const titleLink = el("a", "log-title", log.books.title);
    titleLink.href = bookLink(log.books.external_id);
    top.appendChild(titleLink);
    if (log.books.author) top.appendChild(el("span", "muted", log.books.author));
  }
  body.appendChild(top);

  // Stars and date
  const meta = el("p", "log-meta");
  if (log.rating) meta.appendChild(el("span", "stars", starsText(log.rating)));
  if (log.date_read) meta.appendChild(el("span", "muted", "Read " + formatDate(log.date_read)));
  if (log.reread_count > 0) meta.appendChild(el("span", "reread-badge", rereadText(log.reread_count)));
  body.appendChild(meta);

  if (log.review) body.appendChild(makeReview(log));

  // Heart (likes) on every log, and a Report button for reviews by
  // other people (when logged in).
  const actions = el("p", "log-actions");
  actions.appendChild(makeLikeButton(log));
  if (log.review) {
    const report = makeReportButton("log", log.id, log.user_id);
    if (report) actions.appendChild(report);
    if (currentUserId && log.user_id === currentUserId && typeof makeReviewCard === "function") {
      actions.appendChild(makeReviewImageButton(log));
    }
  }
  // Comments on the review (js/social.js), when there's a review.
  let thread = null;
  if (log.review && typeof makeCommentArea === "function") {
    const comments = makeCommentArea("log", log.id);
    // Right after the heart, like on post cards (Report stays last).
    const heart = actions.querySelector(".like-button");
    if (heart) heart.after(comments.button);
    else actions.appendChild(comments.button);
    thread = comments.thread;
  }
  body.appendChild(actions);
  if (thread) body.appendChild(thread);

  card.appendChild(body);
  return card;
}

// Fills `container` with log cards, or shows `emptyText` if there are none.
function showLogList(container, logs, options, emptyText) {
  container.textContent = "";
  if (logs.length === 0) {
    container.appendChild(el("p", "muted", emptyText));
    return;
  }
  for (const log of logs) container.appendChild(makeLogCard(log, options));
  fillLikes(logs.map((log) => log.id));
  if (typeof fillCommentCounts === "function") fillCommentCounts("log", logs.map((log) => log.id));
}


// ---------- Long lists, a page at a time ----------

// How many log cards to show at once before the "Load more" button.
const PAGE_SIZE = 20;

// Shows log cards PAGE_SIZE at a time, with a "Load more" button
// underneath while there are more.
//
// `makeQuery(from, to)` returns a Supabase query for rows number `from`
// to `to` (counting from 0), for example:
//   (from, to) => db.from("logs").select(LOG_FIELDS).eq(...).order(...).range(from, to)
// We ask for one extra row each time; if it comes back, there's more.
async function showPagedLogs(container, makeQuery, options, emptyText) {
  // The grey loading boxes stay until the first page arrives.
  let shown = 0;

  const moreButton = el("button", "button button-secondary load-more", "Load more");
  moreButton.type = "button";

  async function loadNextPage() {
    moreButton.disabled = true;
    moreButton.textContent = "Loading...";

    const { data, error } = await makeQuery(shown, shown + PAGE_SIZE);
    moreButton.remove();
    if (shown === 0) container.textContent = ""; // first page: clear the loading boxes

    if (error) {
      const problem = el("p", "status status-error", friendlyError(error, "Couldn't load these. "));
      container.appendChild(problem);
      return;
    }
    if (shown === 0 && data.length === 0) {
      container.appendChild(el("p", "muted", emptyText));
      return;
    }

    const page = data.slice(0, PAGE_SIZE);
    for (const log of page) container.appendChild(makeLogCard(log, options));
    fillLikes(page.map((log) => log.id));
    if (typeof fillCommentCounts === "function") fillCommentCounts("log", page.map((log) => log.id));
    shown += Math.min(data.length, PAGE_SIZE);

    if (data.length > PAGE_SIZE) {
      moreButton.disabled = false;
      moreButton.textContent = "Load more";
      container.appendChild(moreButton);
    }
  }

  moreButton.addEventListener("click", loadNextPage);
  await loadNextPage();
}
