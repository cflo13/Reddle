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

let db = null;

if (isSupabaseConfigured()) {
  // `supabase` (lowercase) is the library loaded from the CDN.
  db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
} else {
  console.warn("Supabase is not set up yet. Fill in js/config.js.");
}
