// ------------------------------------------------------------
// Supabase settings
// ------------------------------------------------------------
// Paste your two values from the Supabase dashboard here:
//   Project Settings -> API (or "Connect" button at the top)
//
// SUPABASE_URL  looks like: https://abcdefghijklmno.supabase.co
// SUPABASE_KEY  is the "publishable" key (starts with sb_publishable_)
//               or the older "anon public" key (a long eyJ... string).
//
// These two values are SAFE to put in browser code and commit to git.
// They are designed to be public. Our data is protected by the
// Row Level Security rules in supabase/schema.sql.
//
// NEVER put the "secret" or "service_role" key in this file.
// ------------------------------------------------------------

const SUPABASE_URL = "https://trfgztdvecpswcwoakyz.supabase.co";
const SUPABASE_KEY = "sb_publishable_jkAblJfgtqvEBa2hl42_7A_D4Pff0Mm";

// ------------------------------------------------------------
// Contact email, shown on the About page (the footer's Contact link
// goes there). hello@reddle.org forwards to the owner's own inbox
// through Cloudflare Email Routing. Set it to "" to point people to the Feedback link instead.
// ------------------------------------------------------------
const CONTACT_EMAIL = "hello@reddle.org";

// Notification emails (new followers, follow requests, comments). The
// code is ready but nothing is sent until Resend is set up (EMAIL-SETUP.md).
// Change this to true at the same time, so Settings shows the email switches.
const EMAILS_ON = false;
