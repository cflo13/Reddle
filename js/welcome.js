// ------------------------------------------------------------
// Welcome page: shown once to new users after they sign up, and
// again from Settings (welcome.html?redo=1) to redo the questionnaire.
//
//   Step 1: pick favourite genres      (saved to profiles.favorite_genres)
//   Step 2: tap popular books from those genres:
//           1 tap = read it (a log), 2 = loved it (a 5-star log),
//           3 = want to read (shelf). Tap again to clear.
//   Step 3: log a first book, follow active readers.
// Every step can be skipped.
// ------------------------------------------------------------

const BOOKS_PER_GENRE = 12;
const MAX_BOOKS_SHOWN = 24;

// What each tap does, in order. The last one goes back to nothing.
const PICK_STATES = [null, "read", "loved", "want"];
const PICK_LABELS = { read: "Read", loved: "Loved", want: "Want to read" };

let me = null;                     // your profile
const chosenGenres = new Set();    // step 1
let shownBooks = [];               // step 2: books on screen
const picks = new Map();           // step 2: externalId -> "read" | "loved" | "want"


// ---------- Moving between steps ----------

function showStep(number) {
  document.getElementById("step-genres").hidden = number !== 1;
  document.getElementById("step-books").hidden = number !== 2;
  document.getElementById("step-start").hidden = number !== 3;
  document.getElementById("step-counter").textContent = "Step " + number + " of 3";
  window.scrollTo(0, 0);
  if (number === 3) showSuggestedPeople(me.id);
}

document.querySelectorAll(".skip-button").forEach((button) => button.addEventListener("click", () => showStep(3)));


// ---------- Step 1: genres ----------

function showGenreChoices() {
  const box = document.getElementById("genre-choices");
  const next = document.getElementById("genres-next");
  for (const genre of GENRES) {
    const button = el("button", "genre-choice", genre.name);
    button.type = "button";
    button.setAttribute("aria-pressed", chosenGenres.has(genre.slug));
    button.addEventListener("click", function () {
      if (chosenGenres.has(genre.slug)) chosenGenres.delete(genre.slug);
      else chosenGenres.add(genre.slug);
      button.setAttribute("aria-pressed", chosenGenres.has(genre.slug));
      next.disabled = chosenGenres.size === 0;
    });
    box.appendChild(button);
  }
  next.disabled = chosenGenres.size === 0;
  next.addEventListener("click", saveGenresAndContinue);
}

async function saveGenresAndContinue() {
  const next = document.getElementById("genres-next");
  next.disabled = true;
  const { error } = await db
    .from("profiles")
    .update({ favorite_genres: [...chosenGenres] })
    .eq("id", me.id);
  next.disabled = false;
  if (error) {
    window.alert(friendlyError(error, "Couldn't save your genres. "));
    return;
  }
  showStep(2);
  await showBookChoices();
}


// ---------- Step 2: books ----------

// Popular books from the chosen genres, taking turns between genres so
// every genre gets a fair share, without repeats.
async function findPopularBooks() {
  const genres = [...chosenGenres];
  const lists = await Promise.all(
    genres.map((slug) =>
      fetchGenreBooksFromOpenLibrary(slug, BOOKS_PER_GENRE, 0)
        .then((books) => books.map((book) => Object.assign(book, { genre: slug })))
        .catch(() => [])
    )
  );
  const seen = new Set();
  const mixed = [];
  for (let i = 0; i < BOOKS_PER_GENRE; i++) {
    for (const list of lists) {
      const book = list[i];
      if (book && !seen.has(book.externalId)) {
        seen.add(book.externalId);
        mixed.push(book);
      }
    }
  }
  return mixed.slice(0, MAX_BOOKS_SHOWN);
}

function makePickTile(book) {
  const tile = el("button", "pick-tile");
  tile.type = "button";
  tile.appendChild(makeCover({ title: book.title, author: book.author, cover_url: book.coverUrl }, "cover-medium"));
  const badge = el("span", "pick-badge");
  badge.hidden = true;
  tile.appendChild(badge);
  tile.appendChild(el("span", "book-tile-title", book.title));
  tile.setAttribute("aria-label", book.title + ": not picked");

  tile.addEventListener("click", function () {
    const now = picks.get(book.externalId) || null;
    const next = PICK_STATES[(PICK_STATES.indexOf(now) + 1) % PICK_STATES.length];
    if (next) picks.set(book.externalId, next);
    else picks.delete(book.externalId);

    tile.dataset.pick = next || "";
    badge.hidden = !next;
    badge.textContent = next ? PICK_LABELS[next] : "";
    tile.setAttribute("aria-label", book.title + ": " + (next ? PICK_LABELS[next] : "not picked"));
  });
  return tile;
}

async function showBookChoices() {
  const box = document.getElementById("book-choices");
  shownBooks = await findPopularBooks();
  box.textContent = "";
  if (shownBooks.length === 0) {
    box.appendChild(el("p", "muted", "We couldn't load books right now. You can skip this step and search for books instead."));
    return;
  }
  for (const book of shownBooks) box.appendChild(makePickTile(book));
}

// Saves the picks: books into our books table, then logs and shelves.
// Never overwrites anything you already had (a log you already wrote,
// or a book already on a shelf), so redoing this is safe.
async function savePicks() {
  const picked = shownBooks.filter((book) => picks.has(book.externalId));
  if (picked.length === 0) return;

  // 1. Save the books (skipping ones Reddle already has).
  const { error: booksError } = await db.from("books").upsert(
    picked.map((book) => ({
      external_id: book.externalId,
      title: book.title.slice(0, 500),
      author: book.author ? book.author.slice(0, 500) : null,
      cover_url: book.coverId ? coverUrlFromId(book.coverId, "L") : null,
      genres: [book.genre],
    })),
    { onConflict: "external_id", ignoreDuplicates: true }
  );
  if (booksError) throw booksError;

  // 2. Find their ids in our table.
  const { data: saved, error: idsError } = await db
    .from("books")
    .select("id, external_id")
    .in("external_id", picked.map((book) => book.externalId));
  if (idsError) throw idsError;
  const idOf = new Map(saved.map((row) => [row.external_id, row.id]));

  // 3. Logs for "read" (no rating) and "loved" (5 stars).
  const logs = picked
    .filter((book) => picks.get(book.externalId) !== "want")
    .map((book) => ({
      user_id: me.id,
      book_id: idOf.get(book.externalId),
      rating: picks.get(book.externalId) === "loved" ? 5 : null,
    }));
  if (logs.length > 0) {
    const { error } = await db.from("logs").upsert(logs, { onConflict: "user_id,book_id", ignoreDuplicates: true });
    if (error) throw error;
  }

  // 4. "Want to read" shelf.
  const shelves = picked
    .filter((book) => picks.get(book.externalId) === "want")
    .map((book) => ({ user_id: me.id, book_id: idOf.get(book.externalId), status: "want_to_read" }));
  if (shelves.length > 0) {
    const { error } = await db.from("shelves").upsert(shelves, { onConflict: "user_id,book_id", ignoreDuplicates: true });
    if (error) throw error;
  }
}

document.getElementById("books-save").addEventListener("click", async function () {
  const button = this;
  const message = document.getElementById("books-message");
  button.disabled = true;
  showStatus(message, "waiting", "Saving...");
  try {
    await savePicks();
    message.hidden = true;
    showStep(3);
  } catch (error) {
    showStatus(message, "error", friendlyError(error, "Couldn't save your books. "));
  } finally {
    button.disabled = false;
  }
});


// ---------- Step 3: follow active readers ----------

const peopleBox = document.getElementById("suggested-people");
let peopleShown = false;

// The people who logged the most books recently (up to 6), not you.
async function findActiveReaders(myId) {
  const { data: recent, error } = await db
    .from("logs")
    .select("user_id, profiles(id, username, avatar_url, bio, is_private)")
    .neq("user_id", myId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;

  // Count how many recent logs each person has.
  const people = new Map();
  for (const log of recent) {
    const entry = people.get(log.user_id) || { profile: log.profiles, count: 0 };
    entry.count += 1;
    people.set(log.user_id, entry);
  }
  return [...people.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
}

// A Follow / Following button for one person (a follow request for
// private profiles).
function makeFollowButton(person) {
  const label = person.is_private ? "Request to follow" : "Follow";
  const button = el("button", "button", label);
  button.type = "button";
  let state = "none";

  button.addEventListener("click", async function () {
    button.disabled = true;
    try {
      state = state === "none" ? await followPerson(person) : await unfollowPerson(person.id);
    } catch (error) {
      window.alert(friendlyError(error, "Couldn't update. "));
    } finally {
      button.disabled = false;
    }
    button.textContent = state === "following" ? "Following" : state === "requested" ? "Requested" : label;
    button.classList.toggle("button-secondary", state !== "none");
  });
  return button;
}

async function showSuggestedPeople(myId) {
  if (peopleShown) return;
  peopleShown = true;
  const readers = await findActiveReaders(myId);
  peopleBox.textContent = "";

  if (readers.length === 0) {
    peopleBox.appendChild(el("p", "muted",
      "You're one of the first readers here! Once others join, you'll find them through search."));
    return;
  }

  for (const reader of readers) {
    const row = el("div", "suggested-person");
    const link = el("a", "suggested-person-name");
    link.href = profileLink(reader.profile.username);
    link.appendChild(makeAvatar(reader.profile, "avatar-small"));
    const text = el("span", "");
    text.appendChild(el("strong", "", "@" + reader.profile.username));
    text.appendChild(el("span", "muted", reader.count + (reader.count === 1 ? " book" : " books") + " logged recently"));
    link.appendChild(text);
    row.append(link, makeFollowButton(reader.profile));
    peopleBox.appendChild(row);
  }
}


// ---------- Start ----------

(async function () {
  const { profile } = await authReady;
  if (!profile) {
    window.location.href = "login.html";
    return;
  }
  me = profile;

  // Came here after logging in from another page? The last button takes
  // them back there.
  const backTo = returnPage(false);
  if (backTo && backTo !== "index.html") {
    const doneLink = document.querySelector(".welcome-done a");
    doneLink.href = backTo;
    doneLink.textContent = "Back to where I was";
    doneLink.addEventListener("click", () => returnPage(true));
  }

  const redo = new URLSearchParams(window.location.search).get("redo");
  document.getElementById("welcome-title").textContent = redo
    ? "Your reading taste"
    : "Welcome to Reddle, @" + profile.username + "!";

  // Redoing it: start with the genres picked last time.
  for (const slug of profile.favorite_genres || []) chosenGenres.add(slug);
  showGenreChoices();

  // They've seen the welcome page now, so don't send them here again.
  if (!profile.onboarded) {
    await db.from("profiles").update({ onboarded: true }).eq("id", profile.id);
  }
})();
