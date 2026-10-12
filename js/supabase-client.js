// Creates one Supabase connection that every page shares.
//
// Every page loads three scripts in this order:
//   1. the Supabase library (from a CDN, no install needed)
//   2. js/config.js          (your project URL and key)
//   3. js/supabase-client.js (this file)
//
// After that, any page script can use the variable `db` to talk to Supabase,
// for example:  db.from("books").select("*")

function isSupabaseConfigured() {
  return (
    SUPABASE_URL.startsWith("https://") &&
    !SUPABASE_KEY.startsWith("PASTE_")
  );
}

// `supabase` (lowercase) is the library loaded from the CDN. If the
// internet is down or the CDN is blocked, it won't exist.
const supabaseLoaded = typeof supabase !== "undefined";

let db = null;

if (supabaseLoaded && isSupabaseConfigured()) {
  db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      // Remember the login on this device (in the browser's local storage),
      // so people stay logged in between visits until they press Log out.
      persistSession: true,
      // Quietly renew the login before it runs out (about every hour).
      autoRefreshToken: true,
      // Pick up the login from email links (password reset, confirm email)
      // and from Google sign in.
      detectSessionInUrl: true,
    },
  });
} else {
  console.warn(notConnectedText());
}

// Why `db` is missing, in plain words.
function notConnectedText() {
  if (!supabaseLoaded) {
    return "Reddle couldn't load. Check your internet connection and try again.";
  }
  return "The site isn't connected to its database yet (js/config.js is empty).";
}
