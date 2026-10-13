// ------------------------------------------------------------
// One post with its comments: post.html?id=12
// ------------------------------------------------------------
// Where notifications (and emails) about a post lead. Private and
// blocked posts don't come back from the database, so they show as
// "not found".
// ------------------------------------------------------------

(async function () {
  await authReady;
  if (!db) return;
  const box = document.getElementById("post-box");
  const id = Number(new URLSearchParams(window.location.search).get("id"));
  const { data: post, error } = id
    ? await db.from("posts").select(POST_FIELDS).eq("id", id).maybeSingle()
    : { data: null, error: null };
  box.textContent = "";
  if (error) {
    showStatus(document.getElementById("post-status"), "error", friendlyError(error, "Couldn't load the post. "));
    return;
  }
  if (!post) {
    box.appendChild(makeEmptyState("This post isn't here. It may have been deleted, or it's from a private profile."));
    return;
  }
  // A post from another universe switches to it (the Back button still works).
  if (post.universe && post.universe !== currentUniverse()) {
    showUniverse(post.universe);
    showSearchPlaceholders();
  }
  const name = post.profiles ? "@" + post.profiles.username : "A reader";
  setPageInfo(name + " on Reddle", post.body);
  const card = makePostCard(post);
  box.appendChild(card);
  fillPostLikes([post.id]);
  fillCommentCounts("post", [post.id]);
  card.querySelector(".comment-toggle").click(); // comments open straight away
})();
