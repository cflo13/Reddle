// ------------------------------------------------------------
// Popular this week: popular.html
// ------------------------------------------------------------
// The books logged most on Reddle in the last 7 days (best rated first
// when tied), from the books_with_stats view (logs_this_week). When
// Reddle runs out, the list carries on with Open Library's trending
// books, so the page is never empty. 24 at a time, with Load more.
// Works for logged-out visitors too (everyone can read the books).
// ------------------------------------------------------------

const POPULAR_PAGE = 24;

const popularBox = document.getElementById("popular-books");
const popularMore = document.getElementById("more-popular");

let reddleShown = 0;           // how many Reddle books are on the page
let reddleFinished = !db;      // no more Reddle books to show
let trendingBooks = null;      // Open Library's list, fetched once
let trendingShown = 0;
const shownIds = new Set();    // never show the same book twice

// The next page of Reddle's popular books. Asks for one extra row to
// know whether there are more.
async function nextReddlePage(count) {
  const { data, error } = await db
    .from("books_with_stats")
    .select("id, external_id, title, author, cover_url, log_count, avg_rating, logs_this_week")
    .gt("logs_this_week", 0)
    .order("logs_this_week", { ascending: false })
    .order("avg_rating", { ascending: false, nullsFirst: false })
    .order("id", { ascending: true }) // same order every time, so pages never repeat
    .range(reddleShown, reddleShown + count);
  if (error) throw error;
  if (data.length <= count) reddleFinished = true;
  const page = data.slice(0, count);
  reddleShown += page.length;
  return page;
}

// "★ 4.2 · 3 logs this week"
function weekNote(book) {
  const parts = [];
  if (book.avg_rating) parts.push("★ " + Number(book.avg_rating).toFixed(1));
  parts.push(book.logs_this_week + (book.logs_this_week === 1 ? " log" : " logs") + " this week");
  return parts.join(" · ");
}

function addTile(book, note, reason) {
  if (shownIds.has(book.external_id)) return false;
  shownIds.add(book.external_id);
  popularBox.appendChild(makeBookTile(book, note, reason));
  return true;
}

async function loadMorePopular() {
  popularMore.disabled = true;
  const firstLoad = shownIds.size === 0;
  try {
    let added = 0;

    // 1. Reddle's own popular books first.
    if (!reddleFinished) {
      const books = await nextReddlePage(POPULAR_PAGE);
      if (firstLoad) popularBox.textContent = "";
      for (const book of books) if (addTile(book, weekNote(book))) added++;
    }

    // 2. Then top up with Open Library's trending books.
    if (reddleFinished && added < POPULAR_PAGE) {
      if (trendingBooks === null) {
        trendingBooks = await fetchTrendingFromOpenLibrary(100).catch(() => []);
      }
      if (firstLoad && added === 0) popularBox.textContent = "";
      while (added < POPULAR_PAGE && trendingShown < trendingBooks.length) {
        const book = trendingBooks[trendingShown++];
        if (addTile(book, "", "Trending on Open Library")) added++;
      }
    }

    if (shownIds.size === 0) {
      popularBox.textContent = "";
      popularBox.appendChild(el("p", "muted", "Nothing popular this week yet. Log a book to start the list!"));
    }
    const moreTrending = trendingBooks === null || trendingShown < trendingBooks.length;
    popularMore.hidden = reddleFinished && !moreTrending;
  } catch (error) {
    if (firstLoad) popularBox.textContent = "";
    popularBox.appendChild(el("p", "status status-error", friendlyError(error, "Couldn't load the popular books. ")));
  } finally {
    popularMore.disabled = false;
  }
}

popularMore.addEventListener("click", loadMorePopular);

(async function () {
  await authReady;
  loadMorePopular();
})();
