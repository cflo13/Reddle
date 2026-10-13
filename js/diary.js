// ------------------------------------------------------------
// Diary: diary/USERNAME (old style: diary.html?u=USERNAME)
// ------------------------------------------------------------
// Someone's logs by date read, newest first, grouped by month, 20 at a
// time with Load more. Logs without a date come last. Review snippets
// never show spoilers.
// ------------------------------------------------------------

const DIARY_PAGE = 20;
const diaryList = document.getElementById("diary-list");
const diaryMore = document.getElementById("diary-more");
let diaryPerson = null;
let diaryShown = 0;
let lastMonthShown = null;

function diaryMonthName(dateText) {
  if (!dateText) return "No date";
  const date = new Date(dateText + "T00:00:00");
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

// The first ~160 characters of the review, never a spoiler.
function reviewSnippet(log) {
  if (!log.review) return null;
  if (log.spoiler) return "Review hidden: contains spoilers.";
  const text = log.review.replace(/\s+/g, " ").trim();
  return text.length > 160 ? text.slice(0, 157).trimEnd() + "…" : text;
}

function makeDiaryEntry(log) {
  const row = el("article", "diary-entry");
  const day = el("span", "diary-day", log.date_read ? String(new Date(log.date_read + "T00:00:00").getDate()) : "–");
  row.appendChild(day);
  row.appendChild(makeCoverLink(log.books));

  const text = el("div", "diary-text");
  const title = el("a", "diary-title", log.books.title);
  title.href = bookLink(log.books.external_id);
  text.appendChild(title);
  if (log.books.author) text.appendChild(el("span", "muted diary-author", log.books.author));
  const meta = el("p", "log-meta");
  if (log.rating) meta.appendChild(el("span", "stars", starsText(log.rating)));
  if (log.reread_count > 0) meta.appendChild(el("span", "reread-badge", rereadText(log.reread_count)));
  if (meta.childNodes.length) text.appendChild(meta);
  const snippet = reviewSnippet(log);
  if (snippet) text.appendChild(el("p", log.spoiler ? "diary-snippet muted" : "diary-snippet", snippet));
  row.appendChild(text);
  return row;
}

async function loadDiaryPage() {
  diaryMore.disabled = true;
  const { data, error } = await db
    .from("logs")
    .select(LOG_FIELDS)
    .eq("user_id", diaryPerson.id)
    .order("date_read", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(diaryShown, diaryShown + DIARY_PAGE); // one extra, to know if there's more
  diaryMore.disabled = false;
  if (diaryShown === 0) diaryList.textContent = "";
  if (error) {
    diaryList.appendChild(el("p", "status status-error", friendlyError(error, "Couldn't load the diary. ")));
    return;
  }
  if (diaryShown === 0 && data.length === 0) {
    diaryList.appendChild(el("p", "muted", "Nothing logged yet."));
  }
  for (const log of data.slice(0, DIARY_PAGE)) {
    if (!log.books) continue;
    const month = diaryMonthName(log.date_read);
    if (month !== lastMonthShown) {
      diaryList.appendChild(el("h2", "diary-month", month));
      lastMonthShown = month;
    }
    diaryList.appendChild(makeDiaryEntry(log));
  }
  diaryShown += Math.min(data.length, DIARY_PAGE);
  diaryMore.hidden = data.length <= DIARY_PAGE;
}

(async function () {
  await authReady;
  const username = (new URLSearchParams(window.location.search).get("u") || pageParam("d") || "").toLowerCase();
  const heading = document.getElementById("diary-heading");
  if (!db || !username) {
    heading.textContent = "Diary not found";
    diaryList.textContent = "";
    return;
  }
  const { data: person } = await db.from("profiles").select("id, username, avatar_url").eq("username", username).maybeSingle();
  if (!person) {
    heading.textContent = "Diary not found";
    diaryList.textContent = "";
    diaryList.appendChild(el("p", "muted", "No user with that name."));
    return;
  }
  diaryPerson = person;
  heading.textContent = "@" + person.username + "’s diary";
  setPageInfo("@" + person.username + "\u2019s diary \u00b7 Reddle", "Every book @" + person.username + " has read, by date, on Reddle.");
  const back = document.getElementById("diary-profile");
  back.href = profileLink(person.username);
  back.textContent = "← @" + person.username;
  document.getElementById("diary-year").href = yearLink(person.username, new Date().getFullYear());
  useCleanAddress(diaryLink(person.username));
  diaryMore.addEventListener("click", loadDiaryPage);
  await loadDiaryPage();
})();
