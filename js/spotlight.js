// ------------------------------------------------------------
// One Spotlight: spotlight.html?id=3
// ------------------------------------------------------------
// The card (title, note, books, outside link) with its comments open.
// A link from another universe switches to the spotlight's universe.
// ------------------------------------------------------------

(async function () {
  await authReady;
  if (!db) return;
  const box = document.getElementById("spotlight-box");
  const id = Number(new URLSearchParams(window.location.search).get("id"));
  const { data: spotlight, error } = id
    ? await db.from("spotlights").select(SPOTLIGHT_FIELDS).eq("id", id).maybeSingle()
    : { data: null, error: null };
  box.textContent = "";
  if (error) {
    showStatus(document.getElementById("spotlight-status"), "error", friendlyError(error, "Couldn't load the spotlight. "));
    return;
  }
  if (!spotlight) {
    box.appendChild(makeEmptyState("This spotlight isn't here. It may have been taken down."));
    return;
  }
  if (spotlight.universe !== currentUniverse()) {
    showUniverse(spotlight.universe);
    showSearchPlaceholders();
  }
  setPageInfo(spotlight.title + " · Reddle", spotlight.note || spotlight.title);
  box.appendChild(makeSpotlightCard(spotlight, { open: true }));
  fillCommentCounts("spotlight", [spotlight.id]);
})();
