// Search page: search.html?q=WORDS
// Finds books on Open Library, and people on Reddle whose username matches.

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

// ---------- Books ----------

function makeBookResult(book) {
  const link = el("a", "book-result");
  link.href = bookLink(book.externalId);
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

  try {
    const books = await searchBooks(query);
    showSearchStatus(books.length === 0 ? "No books found for “" + query + "”." : "");
    if (books.length > 0) bookResults.appendChild(el("h2", "", "Books"));
    for (const book of books) bookResults.appendChild(makeBookResult(book));
  } catch (error) {
    showSearchStatus(friendlyError(error, "Search didn't work. "));
  }
  await peopleDone;
}

// ---------- Start ----------

// Submitting the form changes the address to search.html?q=..., which
// reloads this page and runs the search below. That way the back button
// and sharing a search link both work.
const startQuery = new URLSearchParams(window.location.search).get("q");
if (startQuery && startQuery.trim()) {
  searchInput.value = startQuery.trim();
  runSearch(startQuery.trim());
} else {
  searchInput.focus();
}
