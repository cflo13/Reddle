// ------------------------------------------------------------
// Reading news: news.html
// ------------------------------------------------------------
// Headlines about this universe's world from other sites, newest first,
// 24 at a time with Load more. Each card opens the original article on
// its own site. The data and the card are in js/news-data.js.
// ------------------------------------------------------------

const NEWS_PAGE = 24;

async function loadNewsPage() {
  await authReady;
  const noun = UNIVERSES[currentUniverse()].noun;
  document.getElementById("news-hint").textContent =
    "The latest headlines about " + noun + " from other sites. Each one opens the full story on its own site.";
  await showNewsList(document.getElementById("news-list"), document.getElementById("more-news"), NEWS_PAGE, newsEmptyText());
}

loadNewsPage().catch(function (error) {
  console.error(error);
  const list = document.getElementById("news-list");
  list.textContent = "";
  list.appendChild(el("li", "status status-error", friendlyError(error, "The news didn't load. ")));
});
