// ------------------------------------------------------------
// Reddle's service worker: makes the site installable and gives a
// friendly page when there's no internet.
// ------------------------------------------------------------
// What it keeps (in the browser's cache):
//   - our own pages, styles, scripts and pictures, as they're visited
//   - offline.html, shown when a page can't load and isn't saved
// What it NEVER keeps: anything from another website. That means no
// Supabase (logins, the database, profile pictures), no Open Library,
// no Google Books. Those always go straight to the internet. Login
// pages are never kept either.
//
// Pages: internet first (so they're always fresh), saved copy if offline.
// Styles, scripts, pictures: saved copy first (fast), refreshed in the
// background. Their links end in ?v=NUMBER, so a new site version is a
// new link and old copies are thrown away.
// ------------------------------------------------------------

const CACHE = "reddle-v6"; // change this to throw everything away
const OFFLINE_PAGE = "offline.html";

// Kept straight away when the service worker is installed.
const START_FILES = [OFFLINE_PAGE, "favicon.svg", "images/icon-192.png"];

// Pages about logging in or your account: never saved.
const NEVER_SAVE_PAGES = [
  "login.html", "signup.html", "choose-username.html", "forgot-password.html",
  "reset-password.html", "settings.html", "admin.html",
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(START_FILES)).then(() => self.skipWaiting())
  );
});

// Throw away caches from older versions of this file.
self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name))))
      .then(() => self.clients.claim())
  );
});

// May this request be saved?
function canSave(request) {
  const url = new URL(request.url);
  if (request.method !== "GET") return false;
  if (url.origin !== self.location.origin) return false; // other websites: never
  if (!url.pathname.startsWith(new URL("./", self.location).pathname)) return false;
  const fileName = url.pathname.split("/").pop();
  if (NEVER_SAVE_PAGES.includes(fileName)) return false;
  if (/token|code=|error=/.test(url.search)) return false; // login links
  return true;
}

// Saves a copy, removing older versions of the same file (other ?v=).
async function saveCopy(request, response) {
  if (!response || !response.ok || response.type !== "basic") return;
  const cache = await caches.open(CACHE);
  const url = new URL(request.url);
  if (url.search.includes("v=")) {
    for (const old of await cache.keys()) {
      const oldUrl = new URL(old.url);
      if (oldUrl.pathname === url.pathname && oldUrl.search !== url.search) cache.delete(old);
    }
  }
  await cache.put(request, response);
}

// Pages: try the internet, then a saved copy, then the offline page.
async function pageFromNetworkFirst(request) {
  try {
    const response = await fetch(request);
    saveCopy(request, response.clone());
    return response;
  } catch (error) {
    const saved = await caches.match(request, { ignoreSearch: false });
    return saved || (await caches.match(OFFLINE_PAGE));
  }
}

// Styles, scripts, pictures: saved copy now, fresh copy for next time.
async function fileFromCacheFirst(request) {
  const saved = await caches.match(request);
  const fresh = fetch(request)
    .then((response) => {
      saveCopy(request, response.clone());
      return response;
    })
    .catch(() => saved);
  return saved || fresh;
}

self.addEventListener("fetch", function (event) {
  const request = event.request;

  if (!canSave(request)) {
    // Not ours to keep (Supabase, Open Library, logins...). If it's a
    // page and there's no internet, still show the friendly offline page.
    if (request.mode === "navigate" && new URL(request.url).origin === self.location.origin) {
      event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_PAGE)));
    }
    return; // everything else: the browser handles it as normal
  }

  // Pages (also the ones js/router.js fetches for clean addresses) are
  // always fetched fresh when there's internet.
  const path = new URL(request.url).pathname;
  if (request.mode === "navigate" || path.endsWith(".html") || path.endsWith("/")) {
    event.respondWith(pageFromNetworkFirst(request));
  } else {
    event.respondWith(fileFromCacheFirst(request));
  }
});
