// ------------------------------------------------------------
// Home page
// ------------------------------------------------------------
// Logged out: a welcome message and recent activity from everyone.
// Logged in:  your feed, the latest logs from the people you follow.
//             If you don't follow anyone yet, recent activity from
//             everyone instead, so you can find people to follow.
// ------------------------------------------------------------

const homeStatus = document.getElementById("home-status");
const feedHeading = document.getElementById("feed-heading");
const feedNote = document.getElementById("feed-note");
const feedList = document.getElementById("feed");

function showHomeStatus(text) {
  homeStatus.textContent = text;
  homeStatus.hidden = !text;
}

// Explains the most common setup problems in plain words.
function explainError(error) {
  if (error.code === "42P01" || error.code === "PGRST205") {
    return "The database tables are missing. Run supabase/schema.sql in the Supabase SQL Editor.";
  }
  return "Could not load: " + error.message;
}

// A page of the latest logs from everyone (rows `from` to `to`).
function everyoneQuery(from, to) {
  return db
    .from("logs")
    .select(LOG_FIELDS)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false }) // keeps the order stable between pages
    .range(from, to);
}

// Who does `userId` follow? Returns a list of user ids.
async function loadFollowingIds(userId) {
  const { data: follows, error } = await db
    .from("follows")
    .select("following_id")
    .eq("follower_id", userId);
  if (error) throw error;
  return follows.map((row) => row.following_id);
}

// A page of the latest logs from the people in `ids`.
function followingQuery(ids) {
  return (from, to) =>
    db
      .from("logs")
      .select(LOG_FIELDS)
      .in("user_id", ids) // "user_id is one of these ids"
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to);
}

async function loadHome() {
  // Arrived here straight after deleting an account?
  if (new URLSearchParams(window.location.search).get("deleted")) {
    document.getElementById("deleted-message").hidden = false;
  }

  const { profile } = await authReady;

  if (!db) {
    showHomeStatus("Not connected: open js/config.js and paste your Supabase URL and key.");
    return;
  }

  const cardOptions = { showUser: true, showBook: true };

  // Logged out: show the welcome box and everyone's activity.
  if (!profile) {
    document.getElementById("welcome").hidden = false;
    feedHeading.textContent = "Recent activity";
    await showPagedLogs(feedList, everyoneQuery, cardOptions, "Nothing logged yet.");
    return;
  }

  // Logged in.
  const ids = await loadFollowingIds(profile.id);

  if (ids.length === 0) {
    feedHeading.textContent = "Recent activity from everyone";
    feedNote.innerHTML =
      "You're not following anyone yet. Click a name below, or " +
      '<a href="search.html">search</a> for people and books.';
    feedNote.hidden = false;
    await showPagedLogs(feedList, everyoneQuery, cardOptions,
      "Nothing logged yet. Search for a book you've read and log it!");
    return;
  }

  feedHeading.textContent = "From people you follow";
  await showPagedLogs(feedList, followingQuery(ids), cardOptions,
    "The people you follow haven't logged anything yet.");
}

loadHome().catch(function (error) {
  console.error(error);
  showHomeStatus(explainError(error));
});
