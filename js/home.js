// Home page. For now it only checks that Supabase is connected
// and that the database tables exist.

const statusBox = document.getElementById("connection-status");

function showStatus(kind, message) {
  // kind is "ok", "error" or "waiting". It picks the colour in style.css.
  statusBox.className = "status status-" + kind;
  statusBox.textContent = message;
}

async function checkConnection() {
  if (!isSupabaseConfigured()) {
    showStatus(
      "error",
      "Not connected: open js/config.js and paste your Supabase URL and key."
    );
    return;
  }

  showStatus("waiting", "Checking connection to Supabase...");

  // Ask the database how many books are saved. We don't need the rows,
  // just proof that the request works ("head: true" skips the rows).
  const { count, error } = await db
    .from("books")
    .select("id", { count: "exact", head: true });

  if (error) {
    // The most common problem: the tables were not created yet.
    if (error.code === "42P01" || error.code === "PGRST205") {
      showStatus(
        "error",
        "Connected to Supabase, but the tables are missing. " +
          "Run supabase/schema.sql in the Supabase SQL Editor."
      );
    } else {
      showStatus("error", "Could not connect: " + error.message);
    }
    console.error(error);
    return;
  }

  showStatus(
    "ok",
    "Connected to Supabase. Books saved so far: " + count + "."
  );
}

checkConnection();
