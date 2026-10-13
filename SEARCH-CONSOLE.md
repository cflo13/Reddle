# Getting Reddle into Google (Search Console)

Google Search Console tells Google about reddle.org, shows which pages are in
Google, and lets you hand it the sitemap (the list of Reddle's pages). It's
free and takes about 10 minutes.

## 1. Add the site

1. Go to https://search.google.com/search-console and sign in with your Google account.
2. Press **Add property** (top left, under the property list; on the very first
   visit you're asked straight away).
3. Choose the left box, **Domain**, type `reddle.org` and press **Continue**.
   (Domain covers reddle.org, www.reddle.org, http and https in one go.)

## 2. Prove reddle.org is yours (a DNS record in Cloudflare)

1. Google shows a **TXT record** that starts with `google-site-verification=`.
   Press **Copy**.
2. Easiest: if Google offers a **Start verification** / Cloudflare button, press it,
   log in to Cloudflare and allow it. Google adds the record itself. Then skip to step 5.
3. Otherwise open https://dash.cloudflare.com → **reddle.org** → **DNS → Records**
   → **Add record**:
   - Type: `TXT`
   - Name: `@`
   - Content: paste the `google-site-verification=...` text
   - Press **Save**. (Don't touch the other records.)
4. Back in Search Console press **Verify**. If it says it couldn't find it,
   wait 10 minutes and press Verify again (it can take up to a day).
5. Keep the TXT record forever: Google checks it again from time to time.

## 3. Hand Google the sitemap

1. In Search Console, open **Sitemaps** (left menu, under Indexing).
2. In "Add a new sitemap" type `sitemap.xml` (the box already shows
   `https://reddle.org/`) and press **Submit**.
3. After a while the status should say **Success**. Google then visits the
   pages over the next days and weeks; it decides itself how fast.

## 4. Later (optional)

- **Pages** (under Indexing) shows which pages are in Google and why others aren't.
- **URL inspection** (top search box): paste a page address, then **Request indexing**
  to ask Google to look at a new page sooner.

## How the sitemap stays up to date

`sitemap.xml` is rebuilt every day at 04:17 UTC by a GitHub workflow
(`.github/workflows/sitemap.yml`, which runs `tools/make-sitemap.mjs`). It
lists the main pages, all 30 genre pages and the 500 most-logged books.
Nobody has to do anything. To refresh it right away: on GitHub open the
repository's **Actions** tab → **Refresh sitemap** → **Run workflow**.
Google re-reads the sitemap by itself; you never need to submit it again.
