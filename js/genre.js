// ------------------------------------------------------------
// One genre: genre.html?g=fantasy
// ------------------------------------------------------------
// "Top on Reddle": books saved on Reddle with this genre, most logged
// first. "Popular on Open Library": Open Library's list for the genre,
// 24 at a time with a Load more button.
// ------------------------------------------------------------

const OPEN_LIBRARY_PAGE = 24;
const slug = new URLSearchParams(window.location.search).get("g") || "";
const genre = findGenre(slug);

// genre.html?g=comics or ?g=manga is that whole universe: switch to it.
if (genre && genre.universe && genre.universe !== currentUniverse()) {
  showUniverse(genre.universe);
  showSearchPlaceholders();
}

const reddleBox = document.getElementById("reddle-books");
const openLibraryBox = document.getElementById("openlibrary-books");
const moreButton = document.getElementById("more-openlibrary");
let openLibraryShown = 0;

async function loadReddleBooks() {
  if (!db) return;
  const { data, error } = await onlyThisUniverse(db
    .from("books_with_stats")
    .select("external_id, title, author, cover_url, genres, log_count, avg_rating")
    .contains("genres", [genre.slug])) // genres includes this one (in this universe)
    .order("log_count", { ascending: false })
    .order("avg_rating", { ascending: false, nullsFirst: false })
    .limit(24);

  reddleBox.textContent = "";
  if (error) {
    reddleBox.appendChild(el("p", "status status-error", friendlyError(error, "Couldn't load these. ")));
    return;
  }
  if (data.length === 0) {
    reddleBox.appendChild(el("p", "muted", "No Reddle readers have logged " + (genre.universe ? genre.name.toLowerCase() : "a " + genre.name.toLowerCase() + " " + UNIVERSES[currentUniverse()].noun.replace(/s$/, "")) + " yet. Be the first!"));
    return;
  }
  for (const book of data) reddleBox.appendChild(makeBookTile(book, statsNote(book)));
}

async function loadOpenLibraryBooks() {
  moreButton.disabled = true;
  try {
    const books = await fetchGenreBooksFromOpenLibrary(slug, OPEN_LIBRARY_PAGE, openLibraryShown);
    if (openLibraryShown === 0) openLibraryBox.textContent = "";
    for (const book of books) openLibraryBox.appendChild(makeBookTile(openLibraryToBook(book)));
    openLibraryShown += books.length;
    // A full page probably means there's more.
    moreButton.hidden = books.length < OPEN_LIBRARY_PAGE;
    if (openLibraryShown === 0) openLibraryBox.appendChild(el("p", "muted", "Nothing here right now."));
  } catch (error) {
    if (openLibraryShown === 0) openLibraryBox.textContent = "";
    openLibraryBox.appendChild(el("p", "status status-error", friendlyError(error)));
  } finally {
    moreButton.disabled = false;
  }
}

(async function () {
  if (!genre) {
    document.getElementById("genre-name").textContent = "Genre not found";
    document.getElementById("genre-missing").hidden = false;
    document.getElementById("genre-content").hidden = true;
    return;
  }
  const universe = currentUniverse();
  const title = genre.universe || universe === "books" ? genre.name : genre.name + " " + UNIVERSES[universe].noun;
  document.getElementById("genre-name").textContent = title;
  if (universe !== "books") document.getElementById("popular-source").textContent = "Popular on Open Library and Google Books";
  setPageInfo(title + (genre.universe || universe !== "books" ? "" : " books") + " \u00b7 Reddle",
    "The most popular " + genre.name.toLowerCase() + " books on Reddle and Open Library, with ratings and reviews from readers.");
  moreButton.addEventListener("click", loadOpenLibraryBooks);

  await authReady;
  await Promise.all([loadReddleBooks(), loadOpenLibraryBooks()]);
})();
