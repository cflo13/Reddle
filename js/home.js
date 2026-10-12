// ------------------------------------------------------------
// Home page
// ------------------------------------------------------------
// Logged out: a welcome message and recent activity from everyone.
// Logged in:  your feed, the latest logs from the people you follow.
//             If you don't follow anyone yet, recent activity from
//             everyone instead, so you can find people to follow.
// ------------------------------------------------------------

const FEED_SIZE = 30;

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

// The latest logs from everyone.
async function loadEveryone() {
  const { data, error } = await db
    .from("logs")
    .select(LOG_FIELDS)
    .order("created_at", { ascending: false })
    .limit(FEED_SIZE);
  if (error) throw error;
  return data;
}

// The latest logs from the people `userId` follows.
// Returns null when they don't follow anyone yet.
async function loadFollowingFeed(userId) {
  // Step 1: who do I follow?
  const { data: follows, error: followsError } = await db
    .from("follows")
    .select("following_id")
    .eq("follower_id", userId);
  if (followsError) throw followsError;
  if (follows.length === 0) return null;

  const ids = follows.map((row) => row.following_id);

  // Step 2: their latest logs.
  const { data, error } = await db
    .from("logs")
    .select(LOG_FIELDS)
    .in("user_id", ids) // "user_id is one of these ids"
    .order("created_at", { ascending: false })
    .limit(FEED_SIZE);
  if (error) throw error;
  return data;
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

  // Logged out: show the welcome box and everyone's activity.
  if (!profile) {
    document.getElementById("welcome").hidden = false;
    feedHeading.textContent = "Recent activity";
    showLogList(feedList, await loadEveryone(), { showUser: true, showBook: true },
      "Nothing logged yet.");
    return;
  }

  // Logged in.
  const feed = await loadFollowingFeed(profile.id);

  if (feed === null) {
    feedHeading.textContent = "Recent activity from everyone";
    feedNote.innerHTML =
      "You're not following anyone yet. Click a name below, or " +
      '<a href="search.html">search</a> for people and books.';
    feedNote.hidden = false;
    showLogList(feedList, await loadEveryone(), { showUser: true, showBook: true },
      "Nothing logged yet. Search for a book you've read and log it!");
    return;
  }

  feedHeading.textContent = "From people you follow";
  showLogList(feedList, feed, { showUser: true, showBook: true },
    "The people you follow haven't logged anything yet.");
}

loadHome().catch(function (error) {
  console.error(error);
  showHomeStatus(explainError(error));
});
