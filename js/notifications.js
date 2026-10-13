// ------------------------------------------------------------
// Notifications: notifications.html (the bell in the header)
// ------------------------------------------------------------
// Activity: likes and comments on your reviews and posts (last 30 days,
// newest first; the ones since your last visit are marked new).
// Follow requests (for private profiles): Accept or Decline.
// Then your newest followers.
// ------------------------------------------------------------

const requestList = document.getElementById("request-list");
const followerList = document.getElementById("follower-list");

function personLink(person) {
  const link = el("a", "person-row-name");
  link.href = profileLink(person.username);
  link.textContent = "@" + person.username;
  return link;
}

function timeAgo(dateText) {
  const minutes = Math.round((Date.now() - new Date(dateText).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return minutes + " min ago";
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours + (hours === 1 ? " hour ago" : " hours ago");
  return new Date(dateText).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

async function answerRequest(request, accept, row) {
  row.querySelectorAll("button").forEach((button) => (button.disabled = true));
  try {
    if (accept) {
      // You add the follow for them (the database checks they asked).
      const { error } = await db.from("follows").insert({ follower_id: request.requester_id, following_id: currentUserId });
      if (error && error.code !== "23505") throw error;
    }
    const { error } = await db.from("follow_requests").delete()
      .eq("requester_id", request.requester_id).eq("target_id", currentUserId);
    if (error) throw error;
    row.replaceChildren(
      makeAvatar(request.profiles, "avatar-small"),
      personLink(request.profiles),
      el("span", "muted", accept ? "now follows you" : "request declined")
    );
    if (accept) loadFollowers();
  } catch (error) {
    row.querySelectorAll("button").forEach((button) => (button.disabled = false));
    window.alert(friendlyError(error, "Something went wrong. "));
  }
}

async function loadRequests() {
  const { data, error } = await db
    .from("follow_requests")
    .select("requester_id, created_at, profiles!follow_requests_requester_id_fkey(username, avatar_url)")
    .eq("target_id", currentUserId)
    .order("created_at", { ascending: false });
  requestList.textContent = "";
  if (error) {
    requestList.appendChild(el("p", "status status-error", friendlyError(error, "Couldn't load requests. ")));
    return;
  }
  const requests = data.filter((request) => request.profiles);
  if (requests.length === 0) {
    requestList.appendChild(el("p", "muted", "No follow requests. (These only come when your profile is private.)"));
    return;
  }
  for (const request of requests) {
    const row = el("div", "person-row");
    const accept = el("button", "button", "Accept");
    const decline = el("button", "button button-secondary", "Decline");
    accept.type = decline.type = "button";
    accept.addEventListener("click", () => answerRequest(request, true, row));
    decline.addEventListener("click", () => answerRequest(request, false, row));
    row.append(makeAvatar(request.profiles, "avatar-small"), personLink(request.profiles),
      el("span", "muted", timeAgo(request.created_at)), accept, decline);
    requestList.appendChild(row);
  }
}

async function loadFollowers() {
  const { data, error } = await db
    .from("follows")
    .select("created_at, profiles!follows_follower_id_fkey(username, avatar_url)")
    .eq("following_id", currentUserId)
    .order("created_at", { ascending: false })
    .limit(30);
  followerList.textContent = "";
  if (error) {
    followerList.appendChild(el("p", "status status-error", friendlyError(error, "Couldn't load followers. ")));
    return;
  }
  const followers = data.filter((row) => row.profiles);
  if (followers.length === 0) {
    followerList.appendChild(el("p", "muted", "Nobody follows you yet."));
    return;
  }
  for (const follow of followers) {
    const row = el("div", "person-row");
    row.append(makeAvatar(follow.profiles, "avatar-small"), personLink(follow.profiles),
      el("span", "muted", "followed you · " + timeAgo(follow.created_at)));
    followerList.appendChild(row);
  }
}

// ---------- Activity ----------

const activityList = document.getElementById("activity-list");
const ACTIVITY_DAYS = 30;
const ACTIVITY_SHOWN = 40;

// Four small questions: likes and comments, on your reviews and on your
// posts. Each answer becomes { when, who, text, link, snippet }.
async function loadActivity(seenBefore) {
  const since = new Date(Date.now() - ACTIVITY_DAYS * 86400000).toISOString();
  const me = currentUserId;
  const who = (table) => "profiles!" + table + "_user_id_fkey(username, avatar_url)";
  const [logLikes, postLikes, logComments, postComments, muted] = await Promise.all([
    db.from("likes").select("created_at, user_id, " + who("likes") + ", logs!inner(id, user_id, books(external_id, title))")
      .eq("logs.user_id", me).neq("user_id", me).gt("created_at", since).order("created_at", { ascending: false }).limit(ACTIVITY_SHOWN),
    db.from("post_likes").select("created_at, user_id, " + who("post_likes") + ", posts!inner(id, user_id, body)")
      .eq("posts.user_id", me).neq("user_id", me).gt("created_at", since).order("created_at", { ascending: false }).limit(ACTIVITY_SHOWN),
    db.from("comments").select("id, body, created_at, user_id, " + who("comments") + ", logs!inner(id, user_id, books(external_id, title))")
      .eq("logs.user_id", me).neq("user_id", me).gt("created_at", since).order("created_at", { ascending: false }).limit(ACTIVITY_SHOWN),
    db.from("comments").select("id, body, created_at, user_id, " + who("comments") + ", posts!inner(id, user_id, body)")
      .eq("posts.user_id", me).neq("user_id", me).gt("created_at", since).order("created_at", { ascending: false }).limit(ACTIVITY_SHOWN),
    mutedIds(),
  ]);
  activityList.textContent = "";
  const failed = [logLikes, postLikes, logComments, postComments].find((result) => result.error);
  if (failed) {
    activityList.appendChild(el("p", "status status-error", friendlyError(failed.error, "Couldn't load your activity. ")));
    return;
  }

  const short = (text) => (text.length > 60 ? text.slice(0, 60) + "..." : text);
  const items = [];
  for (const row of logLikes.data) {
    items.push({ row: row, text: "liked your review of " + row.logs.books.title, link: bookLink(row.logs.books.external_id) });
  }
  for (const row of postLikes.data) {
    items.push({ row: row, text: "liked your post “" + short(row.posts.body) + "”", link: "post.html?id=" + row.posts.id });
  }
  for (const row of logComments.data) {
    items.push({ row: row, text: "commented on your review of " + row.logs.books.title, link: bookLink(row.logs.books.external_id), snippet: row.body });
  }
  for (const row of postComments.data) {
    items.push({ row: row, text: "commented on your post", link: "post.html?id=" + row.posts.id, snippet: row.body });
  }
  const shown = items
    .filter((item) => item.row.profiles && !muted.includes(item.row.user_id))
    .sort((a, b) => (a.row.created_at < b.row.created_at ? 1 : -1))
    .slice(0, ACTIVITY_SHOWN);

  if (shown.length === 0) {
    activityList.appendChild(el("p", "muted", "Nothing new yet. When people like or comment on your reviews and posts, it shows up here."));
    return;
  }
  for (const item of shown) {
    const row = el("div", "person-row activity-row" + (item.row.created_at > seenBefore ? " activity-new" : ""));
    const text = el("span", "activity-text");
    const what = el("a", "", item.text);
    what.href = item.link;
    text.append(personLink(item.row.profiles), " ", what);
    if (item.snippet) text.appendChild(el("span", "activity-snippet", "“" + short(item.snippet) + "”"));
    row.append(makeAvatar(item.row.profiles, "avatar-small"), text, el("span", "muted activity-time", timeAgo(item.row.created_at)));
    activityList.appendChild(row);
  }
}

(async function () {
  const { profile } = await authReady;
  if (!profile) {
    window.location.href = "login.html";
    return;
  }
  // Everything up to now counts as seen (the bell badge starts again
  // from zero); what came since the last visit is marked new below.
  const seenBefore = activitySeenAt();
  markActivitySeen();
  await Promise.all([loadActivity(seenBefore), loadRequests(), loadFollowers()]);
})();
