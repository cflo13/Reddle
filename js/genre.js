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
  const { data, error } = await onlyShownGenres(onlyThisUniverse(db
    .from("books_with_stats")
    .select("external_id, title, author, cover_url, genres, log_count, avg_rating")
    .contains("genres", [genre.slug]))) // this genre (in this universe), none you hid
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

// Comics and manga: first the curated seed titles of this genre
// (js/universe-seeds.js), then the open Open Library search, which only
// keeps books our strict rules call comics or manga.
const genreSeeds = genre && currentUniverse() !== "books" ? makeSeedStream(currentUniverse(), genre.universe ? null : genre.slug) : null;
const genreShown = new Set();
if (genreSeeds) loadResolvedSeeds(); // fetch the seed file straight away

function showGenreTiles(books) {
  if (genreShown.size === 0 && books.length) openLibraryBox.textContent = "";
  for (const book of withoutHiddenGenres(books)) {
    if (genreShown.has(book.externalId)) continue;
    genreShown.add(book.externalId);
    openLibraryBox.appendChild(makeBookTile(openLibraryToBook(book)));
  }
}

async function loadOpenLibraryBooks() {
  moreButton.disabled = true;
  try {
    // Seed titles show at once; the Open Library search adds to them.
    let seedCount = 0;
    if (genreSeeds && !genreSeeds.finished()) {
      const seeds = await genreSeeds.next(OPEN_LIBRARY_PAGE);
      seedCount = seeds.length;
      showGenreTiles(seeds);
    }
    let openPage = [];
    if (seedCount < OPEN_LIBRARY_PAGE) {
      openPage = await fetchGenreBooksFromOpenLibrary(slug, OPEN_LIBRARY_PAGE, openLibraryShown);
      openLibraryShown += openPage.length;
      showGenreTiles(openPage);
    }
    moreButton.hidden = (!genreSeeds || genreSeeds.finished()) && openPage.length < OPEN_LIBRARY_PAGE;
    if (genreShown.size === 0) {
      openLibraryBox.textContent = "";
      openLibraryBox.appendChild(el("p", "muted", "Nothing here right now."));
    }
  } catch (error) {
    if (genreShown.size === 0) openLibraryBox.textContent = "";
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
  // A genre you hid: say so, with a button to show it again.
  if (hiddenGenres().includes(genre.slug)) {
    document.getElementById("genre-hidden").hidden = false;
    document.getElementById("genre-content").hidden = true;
    const button = document.getElementById("show-genre");
    await new Promise(function (resolve) {
      button.addEventListener("click", async function () {
        button.disabled = true;
        try {
          await showGenreAgain(genre.slug);
          document.getElementById("genre-hidden").hidden = true;
          document.getElementById("genre-content").hidden = false;
          resolve();
        } catch (error) {
          button.disabled = false;
          alert(friendlyError(error, "Couldn't save. "));
        }
      });
    });
  }
  await Promise.all([loadReddleBooks(), loadOpenLibraryBooks()]);
})();
