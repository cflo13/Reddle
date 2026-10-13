// ------------------------------------------------------------
// Book page: book/OL45804W (or the old book.html?id=OL45804W)
// ------------------------------------------------------------
// Shows a book's cover, title, author and description, everyone's logs,
// and (when logged in) a form to log it with stars, a review and a date.
// ------------------------------------------------------------

const MAX_REVIEW_LENGTH = 5000;

let currentUser = null;
let currentProfile = null;
let shownBook = null;   // the book's details (from our table or Open Library)
let myLog = null;       // your log of this book, if you have one
let currentRating = null; // the stars picked in the form (null = no rating)
let myShelf = null;       // "want_to_read", "currently_reading", or null


// ---------- Showing the book ----------

function showBookNotFound(text) {
  document.getElementById("loading").hidden = true;
  document.getElementById("not-found-text").textContent = text;
  document.getElementById("not-found").hidden = false;
}

// Turns "by Ursula K. Le Guin" into a link to the author page. We only
// save the author's name, so ask Open Library which author it is (in the
// background; if it fails, the name just stays plain text).
async function linkAuthorName(externalId, name) {
  if (!/^OL\d+W$/.test(externalId)) return; // Google Books: the name stays plain
  const work = await fetchJson(OPEN_LIBRARY + "/works/" + externalId + ".json");
  const first = work && work.authors && work.authors[0] && work.authors[0].author;
  const id = first ? authorIdFromKey(first.key) : "";
  if (!isValidAuthorId(id)) return;
  const line = document.getElementById("book-author");
  const link = el("a", "", name);
  link.href = authorLink(id);
  line.textContent = "by ";
  line.appendChild(link);
}

// Structured data for search engines (schema.org "Book"), so they know
// the title, author, ISBN, cover and rating. Put in with textContent of
// JSON, so no book text can turn into page code.
function addBookStructuredData(book, ratings) {
  const data = {
    "@context": "https://schema.org",
    "@type": "Book",
    name: book.title,
    // book.html?id=: GitHub Pages answers clean addresses with a "not
    // found" code, which search engines skip.
    url: fullAddress("book.html?id=" + encodeURIComponent(book.external_id)),
  };
  if (book.author) data.author = { "@type": "Person", name: book.author };
  if (book.isbn) data.isbn = book.isbn;
  if (book.cover_url) data.image = book.cover_url;
  if (book.description) data.description = book.description.slice(0, 1000);
  if (book.page_count) data.numberOfPages = book.page_count;
  if (ratings && ratings.length > 0) {
    data.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: (ratings.reduce((total, rating) => total + rating, 0) / ratings.length).toFixed(1),
      ratingCount: ratings.length,
      bestRating: 5,
      worstRating: 0.5,
    };
  }
  let tag = document.getElementById("book-structured-data");
  if (!tag) {
    tag = document.createElement("script");
    tag.type = "application/ld+json";
    tag.id = "book-structured-data";
    document.head.appendChild(tag);
  }
  tag.textContent = JSON.stringify(data);
}

function showBook(book) {
  shownBook = book;
  setPageInfo(
    book.title + (book.author ? " by " + book.author : "") + " \u00b7 Reddle",
    book.description || "Ratings and reviews of " + book.title + (book.author ? " by " + book.author : "") + " on Reddle."
  );

  const coverSpot = document.getElementById("book-cover");
  coverSpot.textContent = "";
  coverSpot.appendChild(makeCover(book, "cover-large"));

  document.getElementById("book-title").textContent = book.title;
  document.getElementById("book-author").textContent = book.author ? "by " + book.author : "";
  if (book.author) linkAuthorName(book.external_id, book.author);
  document.getElementById("book-isbn").textContent = book.isbn ? "ISBN " + book.isbn : "";

  const genres = document.getElementById("book-genres");
  genres.textContent = "";
  if (book.genres && book.genres.length > 0) genres.appendChild(makeGenreTags(book.genres));

  const description = document.getElementById("book-description");
  description.textContent = book.description || "No description available.";
  description.classList.toggle("muted", !book.description);
  showGoogleDetails(book);

  const share = document.getElementById("book-share");
  share.textContent = "";
  share.appendChild(makeShareButton(book.title + " · Reddle", book.title + (book.author ? " by " + book.author : "") + " on Reddle", bookLink(book.external_id)));

  document.getElementById("loading").hidden = true;
  document.getElementById("book").hidden = false;
}


// Google Books books: a link to their Google Books page (their terms ask
// for it), and the description straight from Google (we don't keep a
// copy of it; see js/sources.js).
function showGoogleDetails(book) {
  const isbnLine = document.getElementById("book-isbn");
  let source = document.getElementById("book-source");
  if (!isGoogleBookId(book.external_id)) {
    if (source) source.remove();
    return;
  }
  if (!source) {
    source = el("p", "book-source");
    source.id = "book-source";
    isbnLine.after(source);
  }
  source.textContent = "";
  const link = el("a", "", "View on Google Books");
  link.href = googleBooksPage(book.external_id);
  link.target = "_blank";
  link.rel = "noopener";
  source.appendChild(link);

  if (book.description) return;
  fetchGoogleDescription(book.external_id).then(function (text) {
    if (!text || shownBook.external_id !== book.external_id) return;
    const description = document.getElementById("book-description");
    description.textContent = text;
    description.classList.remove("muted");
  }).catch(() => {});
}

// Opened from another universe (a shared link, a post...)? Switch to the
// book's own universe, without reloading.
function matchUniverse(book) {
  if (bookInUniverse(book)) return;
  showUniverse(bookUniverses(book.genres)[0]);
  showSearchPlaceholders();
}


// ---------- Everyone's logs of this book ----------

async function loadLogs() {
  const list = document.getElementById("book-logs");
  const average = document.getElementById("book-average");
  const emptyText = "Nobody has logged this book yet. Be the first!";

  // Nobody has logged it yet if we haven't saved a copy.
  if (!shownBook.id) {
    showLogList(list, [], {}, emptyText);
    average.textContent = "";
    document.getElementById("rating-chart-spot").textContent = "";
    addBookStructuredData(shownBook, []);
    myLog = null;
    return;
  }

  // Three things at once: everyone's ratings (for the average), your own
  // log (for the form), and the first page of logs.
  const [ratingsResult, myLogResult] = await Promise.all([
    db.from("logs").select("rating").eq("book_id", shownBook.id).not("rating", "is", null),
    currentUser
      ? db.from("logs").select(LOG_FIELDS).eq("book_id", shownBook.id).eq("user_id", currentUser.id).maybeSingle()
      : Promise.resolve({ data: null }),
    showPagedLogs(
      list,
      (from, to) =>
        db
          .from("logs")
          .select(LOG_FIELDS)
          .eq("book_id", shownBook.id)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .range(from, to),
      { showUser: true },
      emptyText
    ),
  ]);

  // Average of everyone's ratings, and the bar chart of how many gave
  // each rating.
  const ratings = (ratingsResult.data || []).map((row) => Number(row.rating));
  const chartSpot = document.getElementById("rating-chart-spot");
  chartSpot.textContent = "";
  if (ratings.length > 0) {
    const sum = ratings.reduce((total, rating) => total + rating, 0);
    average.textContent =
      "Average " + (sum / ratings.length).toFixed(1) + " ★ from " +
      ratings.length + (ratings.length === 1 ? " rating" : " ratings");
    chartSpot.appendChild(makeRatingChart(ratings));
  } else {
    average.textContent = "";
  }
  addBookStructuredData(shownBook, ratings);

  // Your own log (if any) fills in the form.
  myLog = myLogResult.data || null;
}


// ---------- Star rating picker ----------
// Five stars. Tap or click the left half of a star for a half star, the
// right half for a whole star. On phones you can also slide a finger
// along the stars. Arrow keys work too.

const starInput = document.getElementById("star-input");
const starFill = document.getElementById("star-fill");
const ratingLabel = document.getElementById("rating-label");

// Colours in the stars up to `rating` (used while choosing and for the real value).
function paintStars(rating) {
  starFill.style.width = ((rating || 0) / 5) * 100 + "%";
}

function setRating(rating) {
  currentRating = rating;
  paintStars(rating);
  ratingLabel.textContent = rating ? rating + " out of 5" : "No rating";
  starInput.setAttribute("aria-valuenow", rating || 0);
}

// Which value the finger or mouse is over: 0.5, 1, 1.5 ... 5
function ratingAtPointer(event) {
  const box = starInput.getBoundingClientRect();
  const fraction = (event.clientX - box.left) / box.width;
  const value = Math.ceil(fraction * 10) / 2;
  return Math.min(5, Math.max(0.5, value));
}

function setUpStars() {
  let choosing = false;

  // Press (finger, pen or mouse): choose straight away, and keep choosing
  // while the finger slides along the stars.
  starInput.addEventListener("pointerdown", (event) => {
    choosing = true;
    starInput.setPointerCapture(event.pointerId);
    setRating(ratingAtPointer(event));
  });
  starInput.addEventListener("pointermove", (event) => {
    if (choosing) setRating(ratingAtPointer(event));
    else if (event.pointerType === "mouse") paintStars(ratingAtPointer(event)); // a preview on hover
  });
  const stop = () => {
    choosing = false;
    paintStars(currentRating);
  };
  starInput.addEventListener("pointerup", stop);
  starInput.addEventListener("pointercancel", stop); // e.g. the page started scrolling
  starInput.addEventListener("pointerleave", () => {
    if (!choosing) paintStars(currentRating);
  });

  starInput.addEventListener("keydown", function (event) {
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      setRating(Math.min(5, (currentRating || 0) + 0.5));
      event.preventDefault();
    } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      const lower = (currentRating || 0) - 0.5;
      setRating(lower >= 0.5 ? lower : null);
      event.preventDefault();
    }
  });

  document.getElementById("clear-rating").addEventListener("click", () => setRating(null));
}


// ---------- Saving the book ----------

// Books only go into our own `books` table the first time someone does
// something with them (logs them or puts them on a shelf).
async function ensureBookSaved() {
  if (shownBook.id) return;
  shownBook = await saveBookIfNeeded({
    external_id: shownBook.external_id,
    title: shownBook.title,
    author: shownBook.author,
    cover_url: shownBook.cover_url,
    // Google Books descriptions are never saved (their terms).
    description: isGoogleBookId(shownBook.external_id) ? null : shownBook.description,
    isbn: shownBook.isbn,
    genres: shownBook.genres || [],
    page_count: shownBook.page_count || null,
  });
}

// Books saved before genres existed (or with gaps) get their missing
// details from Open Library. We show them straight away, and logged-in
// visitors also save them, so the next visitor gets them from our table.
async function fillMissingDetails(book) {
  const google = isGoogleBookId(book.external_id);
  const missing = !book.genres || book.genres.length === 0 || !book.cover_url || (!book.description && !google);
  if (!book.id || !missing) return book;

  const fresh = await fetchBookDetails(book.external_id).catch(() => null);
  if (!fresh) return book;

  const filled = Object.assign({}, book, {
    genres: book.genres && book.genres.length ? book.genres : fresh.genres,
    cover_url: book.cover_url || fresh.cover_url,
    description: book.description || fresh.description,
    isbn: book.isbn || fresh.isbn,
  });

  if (currentUser) {
    // Only fills empty fields (supabase/step14-genres.sql).
    await db.rpc("fill_book_details", {
      p_book_id: book.id,
      p_genres: filled.genres,
      p_cover_url: filled.cover_url,
      p_description: filled.description,
      p_isbn: filled.isbn,
    });
  }
  return filled;
}


// ---------- Want to read / Currently reading ----------

const shelfButtons = document.querySelectorAll(".shelf-button");
const shelfMessage = document.getElementById("shelf-message");

// Highlights the button for the shelf the book is on (if any).
function updateShelfButtons() {
  shelfButtons.forEach(function (button) {
    const active = button.dataset.status === myShelf;
    button.classList.toggle("shelf-active", active);
    button.setAttribute("aria-pressed", active);
    const label = button.dataset.status === "want_to_read" ? "Want to read" : "Currently reading";
    button.textContent = active ? "\u2713 " + label : label; // \u2713 is a tick
  });
}

// Which shelf is this book on for you?
async function loadMyShelf() {
  myShelf = null;
  if (!shownBook.id) return; // not saved yet, so it can't be on a shelf
  const { data, error } = await db
    .from("shelves")
    .select("status, current_page")
    .eq("user_id", currentUser.id)
    .eq("book_id", shownBook.id)
    .maybeSingle();
  if (error) throw error;
  myShelf = data ? data.status : null;
  myCurrentPage = data ? data.current_page : null;
}

// Puts the book on a shelf, or takes it off when `status` is null.
async function setShelf(status) {
  if (status === null) {
    const { error } = await db
      .from("shelves")
      .delete()
      .eq("user_id", currentUser.id)
      .eq("book_id", shownBook.id);
    if (error) throw error;
  } else {
    await ensureBookSaved();
    // "upsert": add it, or move it from the other shelf.
    const { error } = await db
      .from("shelves")
      .upsert(
        { user_id: currentUser.id, book_id: shownBook.id, status: status },
        { onConflict: "user_id,book_id" }
      );
    if (error) throw error;
  }
  myShelf = status;
  if (status !== "currently_reading") myCurrentPage = null;
  updateShelfButtons();
  showProgress();
  if (status === "currently_reading") fillPageCount().catch(() => {});
}

async function setUpShelfButtons() {
  await loadMyShelf();
  updateShelfButtons();
  setUpProgress();
  document.getElementById("shelf-buttons").hidden = false;

  shelfButtons.forEach(function (button) {
    button.addEventListener("click", async function () {
      // Clicking the shelf it's already on takes it off.
      const newStatus = button.dataset.status === myShelf ? null : button.dataset.status;
      shelfButtons.forEach((b) => (b.disabled = true));
      shelfMessage.hidden = true;
      try {
        await setShelf(newStatus);
      } catch (error) {
        shelfMessage.textContent = friendlyError(error, "Could not update. ");
        shelfMessage.classList.add("hint-error");
        shelfMessage.hidden = false;
      } finally {
        shelfButtons.forEach((b) => (b.disabled = false));
      }
    });
  });
}


// ---------- Page progress (Currently reading) ----------
//
// While the book is on your Currently reading shelf you can save the page
// you're on. The total comes from Open Library (saved on the book); if
// it doesn't know, we ask you once and save it for everyone.

let myCurrentPage = null;
const progressForm = document.getElementById("progress-form");
const currentPageInput = document.getElementById("current-page");
const totalPagesInput = document.getElementById("total-pages");
const progressMessage = document.getElementById("progress-message");

// "45%" bar and "Page 120 of 412 (29%)". Also used on profiles.
function progressPercent(page, total) {
  if (!total || page == null) return 0;
  return Math.max(0, Math.min(100, Math.round((page / total) * 100)));
}

function showProgress() {
  const reading = myShelf === "currently_reading";
  progressForm.hidden = !reading;
  if (!reading) return;
  const total = shownBook.page_count;
  document.getElementById("total-pages-known").textContent = total ? "of " + total : "";
  document.getElementById("total-pages-ask").hidden = !!total;
  currentPageInput.value = myCurrentPage == null ? "" : myCurrentPage;
  if (total) currentPageInput.max = total;
  const percent = progressPercent(myCurrentPage, total);
  document.getElementById("progress-fill").style.width = percent + "%";
  document.getElementById("progress-text").textContent =
    myCurrentPage == null ? "Where are you up to?"
      : total ? "Page " + myCurrentPage + " of " + total + " (" + percent + "%)"
      : "Page " + myCurrentPage;
}

function showProgressMessage(text, isError) {
  progressMessage.textContent = text;
  progressMessage.classList.toggle("hint-error", !!isError);
  progressMessage.hidden = !text;
}

async function saveProgress(event) {
  event.preventDefault();
  const page = currentPageInput.value === "" ? null : Number(currentPageInput.value);
  const typedTotal = totalPagesInput.value === "" ? null : Number(totalPagesInput.value);
  const total = shownBook.page_count || typedTotal;
  if (page !== null && (!Number.isInteger(page) || page < 0)) return showProgressMessage("Pages are whole numbers.", true);
  if (typedTotal !== null && (!Number.isInteger(typedTotal) || typedTotal < 1 || typedTotal > 50000)) {
    return showProgressMessage("The total should be between 1 and 50000.", true);
  }
  if (page !== null && total && page > total) return showProgressMessage("That's more than " + total + " pages.", true);

  const button = progressForm.querySelector("button");
  button.disabled = true;
  try {
    if (!shownBook.page_count && typedTotal) {
      // Only fills an empty page count (supabase/step18).
      const { error } = await db.rpc("fill_book_pages", { p_book_id: shownBook.id, p_pages: typedTotal });
      if (error) throw error;
      shownBook.page_count = typedTotal;
    }
    const { error } = await db
      .from("shelves")
      .update({ current_page: page })
      .eq("user_id", currentUser.id)
      .eq("book_id", shownBook.id);
    if (error) throw error;
    myCurrentPage = page;
    showProgress();
    showProgressMessage("Saved.");
  } catch (error) {
    showProgressMessage(friendlyError(error, "Could not save. "), true);
  } finally {
    button.disabled = false;
  }
}

function setUpProgress() {
  progressForm.addEventListener("submit", saveProgress);
  showProgress();
}

// Books saved before we kept page counts: ask Open Library once when
// someone is reading it.
async function fillPageCount() {
  if (isGoogleBookId(shownBook.external_id)) return; // Google gave it when saved
  if (shownBook.page_count || !shownBook.id || !currentUser) return;
  const pages = await fetchPageCount(shownBook.external_id).catch(() => null);
  if (!pages) return;
  shownBook.page_count = pages;
  await db.rpc("fill_book_pages", { p_book_id: shownBook.id, p_pages: pages });
  showProgress();
}


// ---------- Your log form ----------

const logForm = document.getElementById("log-form");
const reviewInput = document.getElementById("review-input");
const dateInput = document.getElementById("date-input");
const logMessage = document.getElementById("log-message");
const deleteButton = document.getElementById("delete-log");
const spoilerInput = document.getElementById("spoiler-input");

function showLogMessage(kind, text) {
  logMessage.className = "status status-" + kind;
  logMessage.textContent = text;
  logMessage.hidden = false;
}

// Today's date as "YYYY-MM-DD", the format date boxes use.
function todayText() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return now.getFullYear() + "-" + month + "-" + day;
}

// Fills the form with your existing log, or empty values for a new one.
function fillLogForm() {
  if (myLog) {
    document.getElementById("log-heading").textContent = "Your log";
    setRating(myLog.rating ? Number(myLog.rating) : null);
    reviewInput.value = myLog.review || "";
    spoilerInput.checked = !!myLog.spoiler;
    dateInput.value = myLog.date_read || "";
    logForm.querySelector("button[type=submit]").textContent = "Update log";
    deleteButton.hidden = false;
  } else {
    document.getElementById("log-heading").textContent = "Log this book";
    setRating(null);
    reviewInput.value = "";
    spoilerInput.checked = false;
    dateInput.value = todayText();
    logForm.querySelector("button[type=submit]").textContent = "Save log";
    deleteButton.hidden = true;
  }
  updateReviewCounter();
  showRereads();
}

function updateReviewCounter() {
  document.getElementById("review-counter").textContent =
    reviewInput.value.length + " / " + MAX_REVIEW_LENGTH;
}

async function saveLog(event) {
  event.preventDefault();
  const button = logForm.querySelector("button[type=submit]");
  button.disabled = true;
  showLogMessage("waiting", "Saving...");

  try {
    // 1. Make sure the book is saved in our own table (first log only).
    await ensureBookSaved();

    // 2. Save your log. "upsert" means: create it, or update it if you
    //    already logged this book (one log per person per book).
    const { error } = await db.from("logs").upsert(
      {
        user_id: currentUser.id,
        book_id: shownBook.id,
        rating: currentRating,
        review: reviewInput.value.trim() || null,
        spoiler: spoilerInput.checked,
        date_read: dateInput.value || null,
        // Rereads aren't sent here, so saving never resets them.
      },
      { onConflict: "user_id,book_id" }
    );
    if (error) throw error;

    // 3. You've read it now, so take it off "Want to read" or
    //    "Currently reading".
    if (myShelf) await setShelf(null);

    await loadLogs();
    fillLogForm();
    showLogMessage("ok", "Saved.");
  } catch (error) {
    showLogMessage("error", friendlyError(error, "Could not save. "));
  } finally {
    button.disabled = false;
  }
}

async function deleteLog() {
  if (!myLog || !confirm("Delete your log of this book?")) return;

  const { error } = await db.from("logs").delete().eq("id", myLog.id);
  if (error) {
    showLogMessage("error", friendlyError(error, "Could not delete. "));
    return;
  }
  await loadLogs();
  fillLogForm();
  showLogMessage("ok", "Log deleted.");
}

function setUpLogForm() {
  document.getElementById("log-section").hidden = false;
  // Came from "Add" (log a book): go straight to the log form.
  if (window.location.hash === "#log") {
    document.getElementById("log-section").scrollIntoView({ block: "start" });
  }
  dateInput.max = todayText(); // no reading dates in the future
  reviewInput.maxLength = MAX_REVIEW_LENGTH;
  setUpStars();
  setUpRereads();
  fillLogForm();
  reviewInput.addEventListener("input", updateReviewCounter);
  logForm.addEventListener("submit", saveLog);
  deleteButton.addEventListener("click", deleteLog);
}


// ---------- Rereads ----------
//
// "I read this again" adds one to your log's reread count and remembers
// the date. Still one log per book.

const rereadArea = document.getElementById("reread-area");
const rereadDate = document.getElementById("reread-date");

function showRereads() {
  rereadArea.hidden = !myLog;
  if (!myLog) return;
  const count = myLog.reread_count || 0;
  const dates = (myLog.reread_dates || []).map(formatDate);
  document.getElementById("reread-text").textContent = count === 0
    ? "Read it more than once? Add each time you finish it again."
    : rereadText(count).replace("\u21bb ", "") + (dates.length ? ". Again on " + dates.join(", ") + "." : ".");
  document.getElementById("reread-undo").hidden = count === 0;
  rereadDate.max = todayText();
  if (!rereadDate.value) rereadDate.value = todayText();
}

async function changeRereads(add) {
  const dates = (myLog.reread_dates || []).slice();
  let count = myLog.reread_count || 0;
  if (add) {
    count += 1;
    if (rereadDate.value) dates.push(rereadDate.value);
    dates.sort();
  } else {
    count = Math.max(0, count - 1);
    dates.pop();
  }
  const { data, error } = await db
    .from("logs")
    .update({ reread_count: count, reread_dates: dates })
    .eq("id", myLog.id)
    .select(LOG_FIELDS)
    .single();
  if (error) {
    showLogMessage("error", friendlyError(error, "Could not save. "));
    return;
  }
  myLog = data;
  showRereads();
  await loadLogs();
}

function setUpRereads() {
  document.getElementById("reread-button").addEventListener("click", () => changeRereads(true));
  document.getElementById("reread-undo").addEventListener("click", () => changeRereads(false));
}


// ---------- Books you might like ----------

const SIMILAR_SIZE = 12;

// Books that share a genre with this one and readers rated highly
// (3.5+ on average), then popular Open Library books from its first
// genre to fill up. Never this book itself.
async function loadSimilarBooks(book) {
  // Its own genres first (fantasy, horror...), then comics or manga.
  const genres = [...(book.genres || [])].sort((a, b) => (findGenre(a) && findGenre(a).universe ? 1 : 0) - (findGenre(b) && findGenre(b).universe ? 1 : 0));
  if (genres.length === 0) return;

  const picks = [];
  const seen = new Set([book.external_id]);
  function add(candidate, note) {
    if (picks.length >= SIMILAR_SIZE || seen.has(candidate.external_id)) return;
    seen.add(candidate.external_id);
    picks.push(makeBookTile(candidate, note));
  }

  const topRated = await fetchTopRatedInGenres(genres, book.id ? [book.id] : [], SIMILAR_SIZE);
  for (const candidate of topRated) add(candidate, statsNote(candidate));

  // Comics and manga: well-known titles of the same genre first.
  const universe = currentUniverse();
  if (picks.length < SIMILAR_SIZE && universe !== "books") {
    const first = findGenre(genres[0]);
    const seeds = await makeSeedStream(universe, first && !first.universe ? first.slug : null).next(SIMILAR_SIZE).catch(() => []);
    for (const candidate of seeds) add(openLibraryToBook(candidate), "");
  }

  if (picks.length < SIMILAR_SIZE) {
    const popular = await fetchGenreBooksFromOpenLibrary(genres[0], SIMILAR_SIZE + 1, 0).catch(() => []);
    for (const candidate of popular) add(openLibraryToBook(candidate), "");
  }

  if (picks.length === 0) return;
  const row = document.getElementById("similar-books");
  row.textContent = "";
  picks.forEach((tile) => row.appendChild(tile));
  document.getElementById("similar-section").hidden = false;
}


// ---------- Start ----------

async function loadBookPage() {
  const auth = await authReady;
  currentUser = auth.user;
  currentProfile = auth.profile;

  const id = (pageParam("id") || "").trim();
  if (!isValidBookId(id)) {
    showBookNotFound("That doesn't look like a book link.");
    return;
  }
  if (!db) {
    showBookNotFound("This book couldn't load.");
    return;
  }

  // Use our saved copy if someone has logged it before, otherwise ask
  // Open Library.
  const book = (await getSavedBook(id)) || (await fetchBookDetails(id));
  if (!book) {
    showBookNotFound("We couldn't find that book.");
    return;
  }

  matchUniverse(book);
  showBook(book);
  useCleanAddress(bookLink(id));

  // Fill any gaps (genres, cover, description) from Open Library.
  const filled = await fillMissingDetails(book);
  if (filled !== book) {
    matchUniverse(filled);
    showBook(filled);
  }

  // Suggestions load in the background; the page doesn't wait for them.
  loadSimilarBooks(shownBook).catch((error) => console.error("Suggestions didn't load:", error));

  await loadLogs();

  if (currentProfile) {
    await setUpShelfButtons();
    if (myShelf === "currently_reading") fillPageCount().catch(() => {});
    setUpLogForm();
  } else {
    document.getElementById("log-login").hidden = false;
  }
}

loadBookPage().catch(function (error) {
  showBookNotFound(friendlyError(error, "This book couldn't load. "));
});
