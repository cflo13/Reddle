// Search page: search.html?q=WORDS
// Finds people on Reddle whose username matches, authors, and books of
// the current universe (Open Library; comics and manga also Google Books).

const searchInput = document.getElementById("search-input");
const peopleSection = document.getElementById("people-results");
const bookResults = document.getElementById("book-results");
const searchStatus = document.getElementById("search-status");

function showSearchStatus(text) {
  searchStatus.textContent = text;
  searchStatus.hidden = !text;
}

// ---------- People ----------

async function searchPeople(query) {
  peopleSection.textContent = "";

  // Only look for people when the search could be a username.
  const name = query.toLowerCase().replace(/^@/, "");
  if (!db || !/^[a-z0-9_]+$/.test(name)) return;

  const { data: people, error } = await db
    .from("profiles")
    .select("username, avatar_url")
    .ilike("username", "%" + name + "%") // "contains", ignoring upper/lower case
    .limit(5);
  if (error || people.length === 0) return;

  peopleSection.appendChild(el("h2", "", "People"));
  const list = el("div", "people-list");
  for (const person of people) {
    const link = el("a", "person");
    link.href = profileLink(person.username);
    link.appendChild(makeAvatar(person, "avatar-small"));
    link.appendChild(el("span", "", "@" + person.username));
    list.appendChild(link);
  }
  peopleSection.appendChild(list);
}

// ---------- Authors ----------

async function searchAuthorsSection(query) {
  const section = document.getElementById("author-results");
  section.textContent = "";
  const authors = await searchAuthors(query, 6);
  if (authors.length === 0) return;
  section.appendChild(el("h2", "", "Authors"));
  const list = el("div", "people-list");
  for (const author of authors) {
    const link = el("a", "person");
    link.href = authorLink(author.id);
    link.appendChild(makeAuthorAvatar(author.name, authorPhotoUrl(author.id, "S"), "avatar-small"));
    const text = el("span", "");
    text.appendChild(el("span", "", author.name));
    if (author.years) text.appendChild(el("span", "muted person-detail", " " + author.years));
    link.appendChild(text);
    list.appendChild(link);
  }
  section.appendChild(list);
}

// ---------- Books ----------

function makeBookResult(book) {
  const link = el("a", "book-result");
  link.href = bookLink(book.externalId) + (loggingABook ? "#log" : "");
  link.appendChild(makeCover({ title: book.title, author: book.author, cover_url: book.coverUrl, isbns: book.isbns }, "cover-small"));

  const text = el("div", "");
  text.appendChild(el("p", "book-result-title", book.title));
  const details = [book.author, book.year].filter(Boolean).join(" · ");
  if (details) text.appendChild(el("p", "muted", details));
  link.appendChild(text);

  return link;
}

async function runSearch(query) {
  bookResults.textContent = "";
  showSearchStatus("Searching...");
  document.title = query + " · Search · Reddle";

  // Search people and books at the same time.
  const peopleDone = searchPeople(query).catch(function () {});
  const authorsDone = searchAuthorsSection(query).catch(function () {}); // books show the error

  try {
    const books = await searchBooks(query);
    const noun = UNIVERSES[currentUniverse()].noun; // books, comics or manga
    showSearchStatus(books.length === 0 ? "No " + noun + " found for “" + query + "”." : "");
    if (books.length > 0) bookResults.appendChild(el("h2", "", UNIVERSES[currentUniverse()].name));
    for (const book of books) bookResults.appendChild(makeBookResult(book));
  } catch (error) {
    showSearchStatus(friendlyError(error, "Search didn't work. "));
  }
  await Promise.all([peopleDone, authorsDone]);
}

// ---------- Start ----------

// Submitting the form changes the address to search.html?q=..., which
// reloads this page and runs the search below. That way the back button
// and sharing a search link both work.
const startParams = new URLSearchParams(window.location.search);
const startQuery = startParams.get("q");

// "Add" in the phone bar opens search.html?log=1: same search, but the
// books found open straight at the log form (book page + #log).
const loggingABook = startParams.get("log") === "1";
if (loggingABook) {
  document.querySelector("main h1").textContent = "Log a book";
  searchInput.placeholder = "Which book did you read?";
  const keep = document.createElement("input"); // keeps ?log=1 when searching
  keep.type = "hidden";
  keep.name = "log";
  keep.value = "1";
  searchInput.form.appendChild(keep);
}
if (startQuery && startQuery.trim()) {
  searchInput.value = startQuery.trim();
  runSearch(startQuery.trim());
} else {
  searchInput.focus();
}
