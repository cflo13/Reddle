// ------------------------------------------------------------
// Notifications: notifications.html (the bell in the header)
// ------------------------------------------------------------
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

(async function () {
  const { profile } = await authReady;
  if (!profile) {
    window.location.href = "login.html";
    return;
  }
  await Promise.all([loadRequests(), loadFollowers()]);
})();
