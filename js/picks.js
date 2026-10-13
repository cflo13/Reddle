// ------------------------------------------------------------
// Books of the week: picks.html (linked from the footer)
// ------------------------------------------------------------
// Every Book of the week the admin has chosen, newest first, each with
// its note and discussion. 10 at a time, with Load more.
// ------------------------------------------------------------

const PICKS_PAGE = 10;
const picksList = document.getElementById("picks-list");
const morePicks = document.getElementById("more-picks");
let picksShown = 0;

async function showMorePicks() {
  morePicks.disabled = true;
  // One extra row tells us whether there are more.
  const { data, error } = await db.from("book_picks").select(PICK_FIELDS)
    .eq("universe", currentUniverse()) // this universe's picks
    .order("created_at", { ascending: false }).order("id", { ascending: false })
    .range(picksShown, picksShown + PICKS_PAGE);
  morePicks.disabled = false;
  if (picksShown === 0) picksList.textContent = "";
  if (error) {
    showStatus(document.getElementById("picks-status"), "error", friendlyError(error, "Couldn't load the books of the week. "));
    return;
  }
  const page = data.slice(0, PICKS_PAGE).filter((pick) => pick.books);
  if (picksShown === 0 && page.length === 0) {
    picksList.appendChild(makeEmptyState("No " + pickName() + " yet. Check back soon."));
  }
  page.forEach(function (pick, index) {
    const label = picksShown === 0 && index === 0 ? "This week's " + { books: "book", comics: "comic", manga: "manga" }[currentUniverse()] : pickName();
    picksList.appendChild(makePickCard(pick, { label: label }));
  });
  picksShown += PICKS_PAGE;
  fillCommentCounts("pick", page.map((pick) => pick.id));
  morePicks.hidden = data.length <= PICKS_PAGE;
}

morePicks.addEventListener("click", showMorePicks);

(async function () {
  // "Comics of the week" / "Manga of the week" in those universes.
  const universe = currentUniverse();
  if (universe !== "books") {
    const title = universe === "comics" ? "Comics of the week" : "Manga of the week";
    document.getElementById("picks-title").textContent = title;
    setPageInfo(title + " \u00b7 Reddle", "Every " + pickName() + " chosen for Reddle readers, with notes and discussion.");
  }
  await authReady;
  if (!db) return;
  await showMorePicks();
})();
