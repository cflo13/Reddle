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

// Open Library work ids look like OL45804W.
function isValidBookId(id) {
  return /^OL\d+W$/.test(id);
}

// "/works/OL45804W" -> "OL45804W"
function workIdFromKey(key) {
  return key.split("/").pop();
}

function coverUrlFromId(coverId, size) {
  // size: "S" small, "M" medium, "L" large
  return "https://covers.openlibrary.org/b/id/" + coverId + "-" + size + ".jpg";
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

// Searches Open Library. Returns a list of
// { externalId, title, author, coverUrl, year }.
async function searchBooks(query) {
  const url =
    OPEN_LIBRARY + "/search.json?limit=20" +
    "&fields=key,title,author_name,cover_i,first_publish_year" +
    "&q=" + encodeURIComponent(query);

  const response = await fetchOpenLibrary(url);
  if (!response.ok) throw new Error("Open Library isn't answering right now (error " + response.status + "). Try again in a minute.");
  const data = await response.json();

  return data.docs.map(function (doc) {
    return {
      externalId: workIdFromKey(doc.key),
      title: doc.title,
      author: doc.author_name ? doc.author_name.join(", ") : "",
      coverUrl: doc.cover_i ? coverUrlFromId(doc.cover_i, "M") : null,
      year: doc.first_publish_year || null,
    };
  });
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

  const [author, isbn] = await Promise.all([
    authorKey ? fetchJson(OPEN_LIBRARY + authorKey + ".json").then((a) => a && a.name) : null,
    fetchJson(OPEN_LIBRARY + "/works/" + externalId + "/editions.json?limit=20").then(findIsbn),
  ]);

  // The description is sometimes plain text, sometimes { value: "text" }.
  let description = work.description || "";
  if (typeof description === "object") description = description.value || "";
  // Some descriptions end with a "----------" line followed by notes and
  // links. Keep only the part before it.
  description = description.split(/\n\s*-{3,}/)[0];

  const coverId = work.covers ? work.covers.find((id) => id > 0) : null;

  return {
    external_id: externalId,
    title: work.title,
    author: author || null,
    cover_url: coverId ? coverUrlFromId(coverId, "L") : null,
    description: description.trim() || null,
    isbn: isbn || null,
    genres: genresFromSubjects(work.subjects),
  };
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
// Open Library tags each book with many "subjects" ("Dune (Imaginary
// place)", "Fiction", "Space warfare"...). We turn those into a short list
// of genres by looking for keywords.
//
//   slug:     the short name we save in the database (books.genres)
//   name:     what people see
//   subject:  the matching Open Library subject page, used for
//             "Popular on Open Library" lists
//   words:    keywords to look for in a book's subjects
//   nonfiction: only for books that aren't fiction (so a novel set in
//             WW2 is Historical fiction, not History)
//
// If you add or rename a genre here, update the list in
// supabase/step14-genres.sql too (the database only accepts these slugs).
const GENRES = [
  { slug: "fantasy", name: "Fantasy", subject: "fantasy", words: ["fantasy", "fantasy fiction", "magic", "dragons", "wizards", "elves"] },
  { slug: "science_fiction", name: "Science fiction", subject: "science_fiction", words: ["science fiction", "sci-fi", "space opera", "time travel", "space warfare", "robots"] },
  { slug: "mystery", name: "Mystery", subject: "mystery_and_detective_stories", words: ["mystery", "mystery fiction", "detective", "detective and mystery stories", "private investigators", "murder"] },
  { slug: "thriller", name: "Thriller", subject: "thrillers", words: ["thriller", "thrillers", "suspense", "espionage", "spy stories"] },
  { slug: "romance", name: "Romance", subject: "romance", words: ["romance", "love stories", "romantic"] },
  { slug: "horror", name: "Horror", subject: "horror", words: ["horror", "ghost stories", "ghosts", "vampires", "haunted houses", "zombies"] },
  { slug: "historical_fiction", name: "Historical fiction", subject: "historical_fiction", words: ["historical fiction", "history, fiction"] },
  { slug: "literary_fiction", name: "Literary fiction", subject: "literary_fiction", words: ["literary fiction", "psychological fiction", "domestic fiction", "family life", "coming of age"] },
  { slug: "classics", name: "Classics", subject: "classic_literature", words: ["classic literature", "classics", "english literature", "american literature"] },
  { slug: "young_adult", name: "Young adult", subject: "young_adult_fiction", words: ["young adult", "young adult fiction", "teenagers", "high schools"] },
  { slug: "children", name: "Children's", subject: "juvenile_fiction", words: ["juvenile fiction", "juvenile literature", "children's stories", "picture books", "children's fiction"] },
  { slug: "dystopian", name: "Dystopian", subject: "dystopias", words: ["dystopia", "dystopias", "dystopian", "totalitarianism"] },
  { slug: "adventure", name: "Adventure", subject: "adventure", words: ["adventure", "adventure stories", "adventure and adventurers", "voyages and travels"] },
  { slug: "humour", name: "Humour", subject: "humor", words: ["humor", "humour", "humorous fiction", "humorous stories", "satire"] },
  { slug: "short_stories", name: "Short stories", subject: "short_stories", words: ["short stories"] },
  { slug: "poetry", name: "Poetry", subject: "poetry", words: ["poetry", "poems"] },
  { slug: "graphic_novels", name: "Graphic novels & comics", subject: "comics", words: ["graphic novels", "comic books", "comics", "manga", "comic books, strips"] },
  { slug: "biography", name: "Biography & memoir", subject: "biography", words: ["biography", "autobiography", "memoir", "memoirs"], nonfiction: true },
  { slug: "history", name: "History", subject: "history", words: ["history", "world war, 1939-1945", "civilization", "ancient history"], nonfiction: true },
  { slug: "science", name: "Science & nature", subject: "science", words: ["science", "physics", "biology", "astronomy", "chemistry", "evolution", "natural history", "nature"], nonfiction: true },
  { slug: "philosophy", name: "Philosophy", subject: "philosophy", words: ["philosophy", "ethics", "stoics"], nonfiction: true },
  { slug: "psychology", name: "Psychology", subject: "psychology", words: ["psychology", "mental health", "neuroscience"], nonfiction: true },
  { slug: "self_help", name: "Self-help", subject: "self-help", words: ["self-help", "self help", "personal development", "success", "self-actualization", "habits"], nonfiction: true },
  { slug: "business", name: "Business & money", subject: "business", words: ["business", "economics", "management", "finance", "entrepreneurship", "leadership"], nonfiction: true },
  { slug: "true_crime", name: "True crime", subject: "true_crime", words: ["true crime", "criminals", "murder investigation"], nonfiction: true },
  { slug: "travel", name: "Travel", subject: "travel", words: ["travel", "description and travel"], nonfiction: true },
  { slug: "food", name: "Food & cooking", subject: "cooking", words: ["cooking", "cookbooks", "recipes", "food"], nonfiction: true },
  { slug: "religion", name: "Religion & spirituality", subject: "religion", words: ["religion", "spirituality", "christianity", "buddhism", "islam", "judaism", "spiritual life"], nonfiction: true },
  { slug: "politics", name: "Politics & society", subject: "politics", words: ["politics", "political science", "social science", "sociology"], nonfiction: true },
  { slug: "art", name: "Art & design", subject: "art", words: ["art", "design", "photography", "architecture", "music"], nonfiction: true },
];

// The most genres we give one book.
const MAX_GENRES_PER_BOOK = 4;

function findGenre(slug) {
  return GENRES.find((genre) => genre.slug === slug) || null;
}

function genreLink(slug) {
  return "genre.html?g=" + encodeURIComponent(slug);
}

// Is this word (or phrase) in the subject? Whole words only, so "art"
// doesn't match "smart" or "martial".
function subjectHasWord(subject, word) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp("(^|[^a-z])" + escaped + "($|[^a-z])").test(subject);
}

// Turns a list of Open Library subjects into our genre slugs, for
// example ["Fiction", "Space warfare", "Dune (Imaginary place)"] gives
// ["science_fiction"]. Returns [] when nothing matches.
function genresFromSubjects(subjects) {
  if (!subjects || subjects.length === 0) return [];
  const lower = subjects.map((subject) => String(subject).toLowerCase());
  const isFiction = lower.some((subject) => /fiction|novel|stories/.test(subject));

  // Count how many subjects match each genre, then keep the best ones.
  const scores = [];
  for (const genre of GENRES) {
    if (genre.nonfiction && isFiction) continue;
    const hits = lower.filter((subject) => genre.words.some((word) => subjectHasWord(subject, word))).length;
    if (hits > 0) scores.push({ slug: genre.slug, hits: hits });
  }
  scores.sort((a, b) => b.hits - a.hits);
  return scores.slice(0, MAX_GENRES_PER_BOOK).map((score) => score.slug);
}

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
  const url =
    OPEN_LIBRARY + "/subjects/" + genre.subject + ".json" +
    "?limit=" + (limit || 24) + "&offset=" + (offset || 0);
  const response = await fetchOpenLibrary(url);
  if (!response.ok) throw new Error("Open Library isn't answering right now (error " + response.status + "). Try again in a minute.");
  const data = await response.json();
  return (data.works || []).map(function (work) {
    return {
      externalId: workIdFromKey(work.key),
      title: work.title,
      author: work.authors && work.authors[0] ? work.authors[0].name : "",
      coverUrl: work.cover_id ? coverUrlFromId(work.cover_id, "M") : null,
      coverId: work.cover_id || null,
    };
  });
}


// ---------- Popular and top-rated lists ----------

// Books on Reddle in any of these genres that readers rated highly (an
// average of 3.5 stars or more), best first, then most logged. Leaves out
// any book whose id is in `excludeIds`.
async function fetchTopRatedInGenres(genres, excludeIds, limit) {
  if (!genres || genres.length === 0) return [];
  const { data, error } = await db
    .from("books_with_stats")
    .select("id, external_id, title, author, cover_url, genres, log_count, avg_rating")
    .overlaps("genres", genres) // shares at least one genre
    .gte("avg_rating", 3.5)
    .order("avg_rating", { ascending: false, nullsFirst: false })
    .order("log_count", { ascending: false })
    .limit(limit + excludeIds.length);
  if (error) throw error;
  const skip = new Set(excludeIds);
  return data.filter((book) => !skip.has(book.id)).slice(0, limit);
}

// The most logged books on Reddle.
async function fetchMostLoggedOnReddle(limit) {
  const { data, error } = await db
    .from("books_with_stats")
    .select("id, external_id, title, author, cover_url, genres, log_count, avg_rating")
    .gt("log_count", 0)
    .order("log_count", { ascending: false })
    .order("avg_rating", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

// What's popular on Open Library this week. Returns our tile shape.
async function fetchTrendingFromOpenLibrary(limit) {
  const response = await fetchOpenLibrary(OPEN_LIBRARY + "/trending/weekly.json?limit=" + limit);
  if (!response.ok) return [];
  const data = await response.json();
  return (data.works || []).map((work) => ({
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

function bookLink(externalId) {
  return "book.html?id=" + encodeURIComponent(externalId);
}


// ---------- Stars ----------

// 3.5 -> "★★★½". Empty rating -> "".
function starsText(rating) {
  if (!rating) return "";
  const whole = Math.floor(rating);
  return "★".repeat(whole) + (rating - whole === 0.5 ? "½" : "");
}


// ---------- Covers ----------

// A book cover image, or a plain box with the title when there's no cover.
function makeCover(book, sizeClass) {
  if (book.cover_url) {
    const img = el("img", "cover " + sizeClass);
    img.src = book.cover_url;
    img.alt = book.title;
    img.loading = "lazy";
    return img;
  }
  return el("div", "cover cover-missing " + sizeClass, book.title);
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
  return { external_id: book.externalId, title: book.title, author: book.author, cover_url: book.coverUrl };
}


// ---------- Log cards (feed, book page, profile) ----------

// Turns a date like "2026-10-12" into "12 Oct 2026".
function formatDate(dateText) {
  if (!dateText) return "";
  const date = new Date(dateText + "T00:00:00");
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

// What every query for log cards asks for: the log, plus the person who
// wrote it and the book (Supabase joins them in for us).
const LOG_FIELDS =
  "id, rating, review, date_read, created_at, user_id, book_id, " +
  "profiles(username, avatar_url), " +
  "books(external_id, title, author, cover_url)";

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
  body.appendChild(meta);

  if (log.review) body.appendChild(el("p", "log-review", log.review));

  // Report button, for reviews by other people (when logged in).
  if (log.review) {
    const report = makeReportButton("log", log.id, log.user_id);
    if (report) {
      const actions = el("p", "log-actions");
      actions.appendChild(report);
      body.appendChild(actions);
    }
  }

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
  container.textContent = "";
  let shown = 0;

  const moreButton = el("button", "button button-secondary load-more", "Load more");
  moreButton.type = "button";

  async function loadNextPage() {
    moreButton.disabled = true;
    moreButton.textContent = "Loading...";

    const { data, error } = await makeQuery(shown, shown + PAGE_SIZE);
    moreButton.remove();

    if (error) {
      const problem = el("p", "status status-error", friendlyError(error, "Couldn't load these. "));
      container.appendChild(problem);
      return;
    }
    if (shown === 0 && data.length === 0) {
      container.appendChild(el("p", "muted", emptyText));
      return;
    }

    for (const log of data.slice(0, PAGE_SIZE)) container.appendChild(makeLogCard(log, options));
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
