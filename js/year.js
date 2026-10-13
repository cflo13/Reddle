// ------------------------------------------------------------
// Year in review: year.html?u=USERNAME&y=2026
// ------------------------------------------------------------
// Everything someone logged with a date read in that year: books, pages
// (when we know the page count), top genres, average rating, highest
// and lowest rated, busiest month, books per month. A Share button
// draws a picture card (js/share-card.js). Works for any year, so the
// current year can be checked at any time.
// ------------------------------------------------------------

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
let yearStats = null;

function workOutYear(logs, username, year) {
  const rated = logs.filter((log) => log.rating);
  const byRating = rated.slice().sort((a, b) =>
    Number(b.rating) - Number(a.rating) || String(b.date_read).localeCompare(String(a.date_read)));

  const withPages = logs.filter((log) => log.books.page_count);
  const pages = withPages.reduce((total, log) => total + log.books.page_count, 0);

  const genreCounts = {};
  for (const log of logs) for (const slug of log.books.genres || []) genreCounts[slug] = (genreCounts[slug] || 0) + 1;
  const topGenres = Object.keys(genreCounts)
    .sort((a, b) => genreCounts[b] - genreCounts[a])
    .slice(0, 3)
    .map((slug) => (findGenre(slug) || { name: slug }).name);

  const perMonth = new Array(12).fill(0);
  for (const log of logs) perMonth[new Date(log.date_read + "T00:00:00").getMonth()] += 1;
  const most = Math.max(...perMonth);

  return {
    username: username,
    year: year,
    count: logs.length,
    pages: pages,
    pagesKnownFor: withPages.length,
    average: rated.length ? rated.reduce((total, log) => total + Number(log.rating), 0) / rated.length : null,
    ratedCount: rated.length,
    highest: byRating[0] ? { book: byRating[0].books, rating: Number(byRating[0].rating) } : null,
    lowest: byRating.length > 1 ? { book: byRating[byRating.length - 1].books, rating: Number(byRating[byRating.length - 1].rating) } : null,
    topGenres: topGenres,
    perMonth: perMonth,
    busiestMonth: most > 0 ? MONTH_NAMES[perMonth.indexOf(most)] : null,
  };
}

function statTile(number, label) {
  const tile = el("div", "year-stat");
  tile.append(el("span", "year-number", number), el("span", "year-label", label));
  return tile;
}

function bookPick(title, pick) {
  const box = el("div", "year-pick");
  box.appendChild(el("h3", "", title));
  box.appendChild(makeBookTile(pick.book, starsText(pick.rating)));
  return box;
}

function showYear(stats) {
  const box = document.getElementById("year-content");
  box.textContent = "";
  if (stats.count === 0) {
    box.appendChild(el("p", "muted", "No books with a " + stats.year + " reading date yet."));
    document.getElementById("year-share").hidden = true;
    return;
  }
  document.getElementById("year-share").hidden = false;

  const tiles = el("div", "year-stats");
  tiles.append(
    statTile(String(stats.count), stats.count === 1 ? "book read" : "books read"),
    statTile(stats.pages ? stats.pages.toLocaleString() : "–",
      stats.pagesKnownFor < stats.count && stats.pages ? "pages (" + stats.pagesKnownFor + " of " + stats.count + " books known)" : "pages"),
    statTile(stats.average ? stats.average.toFixed(1) + " ★" : "–", "average rating"),
    statTile(stats.busiestMonth || "–", "busiest month")
  );
  box.appendChild(tiles);

  if (stats.topGenres.length) {
    box.appendChild(el("h2", "", "Top genres"));
    box.appendChild(el("p", "", stats.topGenres.join(", ")));
  }

  // Books per month, as small bars.
  box.appendChild(el("h2", "", "Books per month"));
  const chart = el("div", "month-chart");
  const most = Math.max(1, ...stats.perMonth);
  stats.perMonth.forEach(function (count, i) {
    const column = el("div", "month-column");
    column.title = MONTH_NAMES[i] + ": " + count;
    const bar = el("span", count ? "month-bar" : "month-bar month-bar-empty");
    bar.style.height = Math.max(3, Math.round((count / most) * 100)) + "%";
    column.append(el("span", "month-count", count ? String(count) : ""), bar, el("span", "month-name", MONTH_NAMES[i].slice(0, 1)));
    chart.appendChild(column);
  });
  chart.setAttribute("role", "img");
  chart.setAttribute("aria-label", "Books per month: " + stats.perMonth.map((count, i) => MONTH_NAMES[i] + " " + count).join(", "));
  box.appendChild(chart);

  if (stats.highest || stats.lowest) {
    const picks = el("div", "year-picks");
    if (stats.highest) picks.appendChild(bookPick("Highest rated", stats.highest));
    if (stats.lowest) picks.appendChild(bookPick("Lowest rated", stats.lowest));
    box.appendChild(picks);
  }
}

(async function () {
  await authReady;
  const params = new URLSearchParams(window.location.search);
  const username = (params.get("u") || "").toLowerCase();
  const thisYear = new Date().getFullYear();
  let year = Number(params.get("y")) || thisYear;
  if (year < 2000 || year > thisYear) year = thisYear;
  const heading = document.getElementById("year-heading");
  const content = document.getElementById("year-content");

  const { data: person } = db
    ? await db.from("profiles").select("id, username").eq("username", username).maybeSingle()
    : { data: null };
  if (!person) {
    heading.textContent = "Year in review";
    content.textContent = "";
    content.appendChild(el("p", "muted", "No user with that name."));
    return;
  }
  heading.textContent = "@" + person.username + "’s " + year + " in books";
  setPageInfo("@" + person.username + "\u2019s " + year + " in books \u00b7 Reddle", "@" + person.username + "\u2019s year of reading in " + year + ": books, pages, favourite genres and highest rated.");
  document.getElementById("year-profile").href = profileLink(person.username);
  document.getElementById("year-profile").textContent = "← @" + person.username;
  document.getElementById("year-diary").href = diaryLink(person.username);

  // Links to the year before and after.
  const previous = document.getElementById("year-previous");
  previous.href = yearLink(person.username, year - 1);
  previous.textContent = "← " + (year - 1);
  const next = document.getElementById("year-next");
  next.hidden = year >= thisYear;
  next.href = yearLink(person.username, year + 1);
  next.textContent = year + 1 + " →";

  const { data: logs, error } = await db
    .from("logs")
    .select("rating, date_read, books(external_id, title, author, cover_url, page_count, genres)")
    .eq("user_id", person.id)
    .gte("date_read", year + "-01-01")
    .lte("date_read", year + "-12-31")
    .order("date_read", { ascending: true })
    .limit(1000);
  if (error) {
    content.textContent = "";
    content.appendChild(el("p", "status status-error", friendlyError(error, "Couldn't load this year. ")));
    return;
  }
  yearStats = workOutYear(logs.filter((log) => log.books), person.username, year);
  showYear(yearStats);

  const share = document.getElementById("year-share");
  share.addEventListener("click", async function () {
    share.disabled = true;
    const before = share.textContent;
    share.textContent = "Making picture...";
    try {
      const canvas = await makeYearCard(yearStats);
      const result = await shareCanvas(canvas, cardFileName("reddle-" + year, person.username), year + " in books on Reddle");
      share.textContent = result === "downloaded" ? "Picture saved" : before;
    } catch (error) {
      window.alert(friendlyError(error, "Couldn't make the picture. "));
      share.textContent = before;
    } finally {
      share.disabled = false;
      setTimeout(() => (share.textContent = before), 2500);
    }
  });
})();
