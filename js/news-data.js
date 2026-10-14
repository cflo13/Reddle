// ------------------------------------------------------------
// Reading news: headlines from other sites (links only)
// ------------------------------------------------------------
// GitHub makes news-data/news.json once a day from a few sites' public
// feeds (tools/make-news.mjs, .github/workflows/news.yml): per item only
// the headline (t), source id (s), date (d), link (u), the feed's own
// thumbnail address where the source allows it (i, usually null) and the
// universe (v). Visitors never contact the news sites for headlines; each
// card is a link that opens the original article in a new tab.
// Loaded with js/books.js. Used by the home page row, news.html and the
// News tab on screen.html.
// ------------------------------------------------------------

const NEWS_MAX_AGE_DAYS = 30;
const NEWS_VERSION = (function () {
  try {
    return new URL(document.currentScript.src).searchParams.get("v") || "";
  } catch (error) {
    return "";
  }
})();

let newsFile = null; // one download per page

function loadNews() {
  if (!newsFile) {
    newsFile = fetch("news-data/news.json" + (NEWS_VERSION ? "?v=" + NEWS_VERSION : ""))
      .then((response) => (response.ok ? response.json() : {}))
      .catch(() => ({}));
  }
  return newsFile;
}

// This universe's items, newest first: never older than 30 days, never
// adult (the same filter as everywhere else), only real web links.
function newsForUniverse(data, universe) {
  const oldest = Date.now() - NEWS_MAX_AGE_DAYS * 864e5;
  return (data.items || [])
    .filter((item) => item.v === (universe || currentUniverse()))
    .filter((item) => Date.parse(item.d) >= oldest)
    .filter((item) => /^https:\/\/[^\s"<>]+$/.test(item.u || ""))
    .filter((item) => !looksAdult([item.t]))
    .sort((a, b) => b.d.localeCompare(a.d));
}

// "2 days ago", "3 hours ago", "yesterday"...
function newsTimeAgo(dateText) {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(dateText)) / 60000));
  if (minutes < 2) return "just now";
  if (minutes < 60) return minutes + " minutes ago";
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? "1 hour ago" : hours + " hours ago";
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  return days + " days ago";
}

// The plain tile when there's no picture (or it doesn't load): the
// source's first letter (its name is written under the headline).
function makeNewsTile(sourceName) {
  const tile = el("span", "news-tile");
  tile.setAttribute("aria-hidden", "true");
  tile.appendChild(el("span", "news-tile-letter", (sourceName || "?").charAt(0)));
  return tile;
}

// One headline as a card: thumbnail (or tile), headline, source and age.
// The whole card is one link to the original article, in a new tab.
function makeNewsCard(item, sources) {
  const source = (sources || {})[item.s] || { name: item.s };
  const card = el("a", "news-card");
  card.href = item.u;
  card.target = "_blank";
  card.rel = "noopener noreferrer nofollow";

  const thumb = el("span", "news-thumb");
  if (item.i && /^https:\/\/[^\s"<>]+$/.test(item.i)) {
    // Loaded from the source's own server, never stored by us; no
    // referrer; empty alt (the headline is right next to it).
    const img = el("img", "news-img");
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    img.width = 160;
    img.height = 120;
    // A broken (or blank) picture becomes the plain tile.
    const useTile = function () {
      card.classList.remove("news-card-picture");
      img.replaceWith(makeNewsTile(source.name));
    };
    img.addEventListener("error", useTile);
    img.addEventListener("load", function () {
      if (img.naturalWidth < 10) useTile();
    });
    img.src = item.i;
    thumb.appendChild(img);
    card.classList.add("news-card-picture");
  } else {
    thumb.appendChild(makeNewsTile(source.name));
  }
  card.appendChild(thumb);

  const text = el("span", "news-text");
  text.appendChild(el("span", "news-title", item.t));
  text.appendChild(el("span", "news-meta", source.name + " · " + newsTimeAgo(item.d)));
  card.appendChild(text);
  return card;
}

// Fills `list` with this universe's news, `pageSize` at a time, with the
// Load more button `more` (optional). Shows `emptyText` when there's none.
// Returns how many items there are.
async function showNewsList(list, more, pageSize, emptyText) {
  const data = await loadNews();
  const items = newsForUniverse(data);
  list.textContent = "";
  if (items.length === 0) {
    const empty = el("li", "news-empty");
    empty.appendChild(makeEmptyState(emptyText));
    list.appendChild(empty);
    if (more) more.hidden = true;
    return 0;
  }
  let shown = 0;
  function nextPage() {
    items.slice(shown, shown + pageSize).forEach(function (item) {
      const row = el("li", "news-item");
      row.appendChild(makeNewsCard(item, data.sources));
      list.appendChild(row);
    });
    shown += pageSize;
    if (more) more.hidden = shown >= items.length;
  }
  if (more) more.onclick = nextPage;
  nextPage();
  return items.length;
}

// "No news about books right now. Check back tomorrow."
function newsEmptyText() {
  return "No news about " + UNIVERSES[currentUniverse()].noun + " right now. Check back tomorrow.";
}
