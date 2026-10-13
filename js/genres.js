// Browse by genre: every genre, with how many Reddle books are in it.

const grid = document.getElementById("genre-grid");

function showGenres(counts) {
  grid.textContent = "";
  for (const genre of listedGenres()) {
    const card = el("a", "genre-card");
    card.href = genreLink(genre.slug);
    card.appendChild(el("span", "genre-card-name", genre.name));
    const count = counts[genre.slug] || 0;
    if (count > 0) card.appendChild(el("span", "genre-card-count", count + (count === 1 ? " book" : " books")));
    grid.appendChild(card);
  }
}

(async function () {
  const universe = currentUniverse();
  if (universe !== "books") document.getElementById("genres-title").textContent = "Browse " + UNIVERSES[universe].noun + " by genre";
  // Show the list straight away, then add the counts.
  showGenres({});
  await authReady;
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
