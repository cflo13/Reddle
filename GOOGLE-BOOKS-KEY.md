# Optional: a Google Books key

Reddle asks Google Books for comics and manga (and for covers Open Library
doesn't have). Google now often refuses those requests when they come
without a key ("quota exceeded"), so until a key is added, Reddle quietly
uses Open Library only. Everything still works; Comics and Manga just have
fewer results and covers.

A key for the Books API, locked to reddle.org, is safe to put in the
public code (like the Supabase key): nobody can use it from another
website, and it can only read public book information. It's free.

About 10 minutes, browser only. You already have a Google Cloud project
from "Continue with Google" (GOOGLE-SIGNIN.md); use the same one.

1. Go to https://console.cloud.google.com and pick the **Reddle** project at
   the top.
2. Menu (☰) → **APIs & Services** → **Library**. Search **Books API**, open
   it and press **Enable**.
3. **APIs & Services** → **Credentials** → **Create credentials** → **API key**.
   Google shows the key (it starts with `AIza`). Press **Edit API key**
   (or the key's name) to lock it down:
   - **Application restrictions**: **Websites**. Add `https://reddle.org/*`
     and `https://www.reddle.org/*`.
   - **API restrictions**: **Restrict key** → tick only **Books API**.
   - Press **Save**.
4. Tell Claude "the Google Books key is ready" and paste the key (it's
   safe to share, because it only works on reddle.org). Claude puts it in
   `js/config.js` (`GOOGLE_BOOKS_KEY`) and bumps the version.

The free allowance is 1,000 requests a day for the whole site, which is
plenty while Reddle is small (each visitor's search uses one or two). If
it's ever used up, Reddle falls back to Open Library for the rest of the
visit, just like without a key.
