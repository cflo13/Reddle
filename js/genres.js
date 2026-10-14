// Browse by genre: every genre, with how many Reddle books are in it.
// Hidden genres (Settings, or "Hide genres" below the list) are folded
// into one line with a Show again button each.

const grid = document.getElementById("genre-grid");
const hiddenLine = document.getElementById("hidden-genres-line");
let genreCounts = {};

function showGenres(counts) {
  genreCounts = counts;
  const hidden = hiddenGenres();
  grid.textContent = "";
  for (const genre of listedGenres()) {
    if (hidden.includes(genre.slug)) continue;
    const card = el("a", "genre-card");
    card.href = genreLink(genre.slug);
    card.appendChild(el("span", "genre-card-name", genre.name));
    const count = counts[genre.slug] || 0;
    if (count > 0) card.appendChild(el("span", "genre-card-count", count + (count === 1 ? " book" : " books")));
    grid.appendChild(card);
  }

  hiddenLine.textContent = "";
  hiddenLine.hidden = hidden.length === 0;
  if (hidden.length === 0) return;
  hiddenLine.appendChild(el("span", "hidden-genres-label", "Hidden genres:"));
  for (const slug of hidden) {
    const genre = findGenre(slug);
    const button = el("button", "link-button show-genre-again", "Show " + (genre ? genre.name : slug) + " again");
    button.type = "button";
    button.addEventListener("click", async function () {
      button.disabled = true;
      try {
        await showGenreAgain(slug);
      } catch (error) {
        button.disabled = false;
        alert(friendlyError(error, "Couldn't save. "));
      }
    });
    hiddenLine.appendChild(button);
  }
}

// Changing the hidden list (here or in the control) redraws at once,
// and rebuilds the control so its chips match.
function showHideControl() {
  const spot = document.getElementById("hide-genres-spot");
  spot.textContent = "";
  spot.appendChild(makeHiddenGenresControl());
}

window.addEventListener("reddle-hidden-genres", function () {
  showGenres(genreCounts);
  if (!document.getElementById("hide-genres").open) showHideControl();
});

(async function () {
  const universe = currentUniverse();
  if (universe !== "books") document.getElementById("genres-title").textContent = "Browse " + UNIVERSES[universe].noun + " by genre";
  // Show the list straight away, then add the counts.
  showGenres({});
  await authReady;
  showGenres({}); // the saved list (logged in) may differ from this browser's
  showHideControl();
  if (!db) return;

  // Count books per genre. (Fine while the site is small; with many
  // thousands of books this would move into a database view.)
  // Only books of this universe (Books, Comics or Manga).
  const { data, error } = await onlyThisUniverse(db.from("books").select("genres"));
  if (error) return; // the list still works without counts
  const counts = {};
  for (const book of data) {
    for (const slug of book.genres || []) counts[slug] = (counts[slug] || 0) + 1;
  }
  showGenres(counts);
})();
