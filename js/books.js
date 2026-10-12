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

// Searches Open Library. Returns a list of
// { externalId, title, author, coverUrl, year }.
async function searchBooks(query) {
  const url =
    OPEN_LIBRARY + "/search.json?limit=20" +
    "&fields=key,title,author_name,cover_i,first_publish_year" +
    "&q=" + encodeURIComponent(query);

  const response = await fetch(url);
  if (!response.ok) throw new Error("Open Library didn't answer (" + response.status + ").");
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
  const workResponse = await fetch(OPEN_LIBRARY + "/works/" + externalId + ".json");
  if (workResponse.status === 404) return null;
  if (!workResponse.ok) throw new Error("Open Library didn't answer (" + workResponse.status + ").");
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
