// ------------------------------------------------------------
// Book page: book.html?id=OL45804W
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

function showBook(book) {
  shownBook = book;
  document.title = book.title + " · Reddle";

  const coverSpot = document.getElementById("book-cover");
  coverSpot.textContent = "";
  coverSpot.appendChild(makeCover(book, "cover-large"));

  document.getElementById("book-title").textContent = book.title;
  document.getElementById("book-author").textContent = book.author ? "by " + book.author : "";
  document.getElementById("book-isbn").textContent = book.isbn ? "ISBN " + book.isbn : "";

  const description = document.getElementById("book-description");
  description.textContent = book.description || "No description available.";
  description.classList.toggle("muted", !book.description);

  document.getElementById("loading").hidden = true;
  document.getElementById("book").hidden = false;
}


// ---------- Everyone's logs of this book ----------

async function loadLogs() {
  const list = document.getElementById("book-logs");
  const average = document.getElementById("book-average");

  // Nobody has logged it yet if we haven't saved a copy.
  if (!shownBook.id) {
    showLogList(list, [], {}, "Nobody has logged this book yet. Be the first!");
    average.textContent = "";
    return;
  }

  const { data: logs, error } = await db
    .from("logs")
    .select(LOG_FIELDS)
    .eq("book_id", shownBook.id)
    .order("created_at", { ascending: false });

  if (error) {
    list.textContent = "Could not load logs: " + error.message;
    return;
  }

  showLogList(list, logs, { showUser: true }, "Nobody has logged this book yet. Be the first!");

  // Average of the logs that have a rating.
  const ratings = logs.filter((log) => log.rating).map((log) => Number(log.rating));
  if (ratings.length > 0) {
    const sum = ratings.reduce((total, rating) => total + rating, 0);
    average.textContent =
      "Average " + (sum / ratings.length).toFixed(1) + " ★ from " +
      ratings.length + (ratings.length === 1 ? " rating" : " ratings");
  } else {
    average.textContent = "";
  }

  // Your own log (if any) fills in the form.
  myLog = currentUser ? logs.find((log) => log.user_id === currentUser.id) || null : null;
}


// ---------- Star rating picker ----------
// Five stars. Click the left half of a star for a half star, the right
// half for a whole star. Arrow keys work too.

const starInput = document.getElementById("star-input");
const starFill = document.getElementById("star-fill");
const ratingLabel = document.getElementById("rating-label");

// Colours in the stars up to `rating` (used for hovering and the real value).
function paintStars(rating) {
  starFill.style.width = ((rating || 0) / 5) * 100 + "%";
}

function setRating(rating) {
  currentRating = rating;
  paintStars(rating);
  ratingLabel.textContent = rating ? rating + " out of 5" : "No rating";
  starInput.setAttribute("aria-valuenow", rating || 0);
}

// Which value the mouse is over: 0.5, 1, 1.5 ... 5
function ratingAtMouse(event) {
  const box = starInput.getBoundingClientRect();
  const fraction = (event.clientX - box.left) / box.width;
  const value = Math.ceil(fraction * 10) / 2;
  return Math.min(5, Math.max(0.5, value));
}

function setUpStars() {
  starInput.addEventListener("mousemove", (event) => paintStars(ratingAtMouse(event)));
  starInput.addEventListener("mouseleave", () => paintStars(currentRating));
  starInput.addEventListener("click", (event) => setRating(ratingAtMouse(event)));

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
    description: shownBook.description,
    isbn: shownBook.isbn,
  });
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
    .select("status")
    .eq("user_id", currentUser.id)
    .eq("book_id", shownBook.id)
    .maybeSingle();
  if (error) throw error;
  myShelf = data ? data.status : null;
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
  updateShelfButtons();
}

async function setUpShelfButtons() {
  await loadMyShelf();
  updateShelfButtons();
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
        shelfMessage.textContent = "Could not update: " + error.message;
        shelfMessage.classList.add("hint-error");
        shelfMessage.hidden = false;
      } finally {
        shelfButtons.forEach((b) => (b.disabled = false));
      }
    });
  });
}


// ---------- Your log form ----------

const logForm = document.getElementById("log-form");
const reviewInput = document.getElementById("review-input");
const dateInput = document.getElementById("date-input");
const logMessage = document.getElementById("log-message");
const deleteButton = document.getElementById("delete-log");

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
    dateInput.value = myLog.date_read || "";
    logForm.querySelector("button[type=submit]").textContent = "Update log";
    deleteButton.hidden = false;
  } else {
    document.getElementById("log-heading").textContent = "Log this book";
    setRating(null);
    reviewInput.value = "";
    dateInput.value = todayText();
    logForm.querySelector("button[type=submit]").textContent = "Save log";
    deleteButton.hidden = true;
  }
  updateReviewCounter();
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
        date_read: dateInput.value || null,
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
    showLogMessage("error", "Could not save: " + error.message);
  } finally {
    button.disabled = false;
  }
}

async function deleteLog() {
  if (!myLog || !confirm("Delete your log of this book?")) return;

  const { error } = await db.from("logs").delete().eq("id", myLog.id);
  if (error) {
    showLogMessage("error", "Could not delete: " + error.message);
    return;
  }
  await loadLogs();
  fillLogForm();
  showLogMessage("ok", "Log deleted.");
}

function setUpLogForm() {
  document.getElementById("log-section").hidden = false;
  reviewInput.maxLength = MAX_REVIEW_LENGTH;
  setUpStars();
  fillLogForm();
  reviewInput.addEventListener("input", updateReviewCounter);
  logForm.addEventListener("submit", saveLog);
  deleteButton.addEventListener("click", deleteLog);
}


// ---------- Start ----------

async function loadBookPage() {
  const auth = await authReady;
  currentUser = auth.user;
  currentProfile = auth.profile;

  const id = (new URLSearchParams(window.location.search).get("id") || "").trim();
  if (!isValidBookId(id)) {
    showBookNotFound("That doesn't look like a book link.");
    return;
  }
  if (!db) {
    showBookNotFound("The site isn't connected to Supabase yet. Fill in js/config.js.");
    return;
  }

  // Use our saved copy if someone has logged it before, otherwise ask
  // Open Library.
  const book = (await getSavedBook(id)) || (await fetchBookFromOpenLibrary(id));
  if (!book) {
    showBookNotFound("We couldn't find that book.");
    return;
  }

  showBook(book);
  await loadLogs();

  if (currentProfile) {
    await setUpShelfButtons();
    setUpLogForm();
  } else {
    document.getElementById("log-login").hidden = false;
  }
}

loadBookPage().catch(function (error) {
  showBookNotFound("Something went wrong: " + error.message);
});
