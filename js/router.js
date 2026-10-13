// ------------------------------------------------------------
// Clean addresses (only used by 404.html)
// ------------------------------------------------------------
// GitHub Pages shows 404.html for any address it doesn't have a file
// for. The little script at the top of 404.html already worked out the
// site's main folder (SITE_ROOT) and whether the address is a clean one:
//   u/USERNAME   -> profile page
//   book/OL...W or book/GB...  -> book page
//   author/OL...A -> author page
//   diary/USERNAME -> diary page
// If it is, this file loads that page's HTML and swaps it in, so the
// address stays clean. Otherwise it's a real "Page not found", and this
// file loads the usual scripts so the header works.
// ------------------------------------------------------------

const routerVersion = (document.currentScript.src.split("?v=")[1] || "");

// Loads scripts one after another, in order (like normal <script> tags).
async function loadScriptsInOrder(sources) {
  for (const source of sources) {
    await new Promise(function (resolve) {
      const script = document.createElement("script");
      script.src = source;
      script.onload = resolve;
      script.onerror = resolve; // keep going; pages show their own problems
      document.body.appendChild(script);
    });
  }
}

async function showCleanRoute(fileName) {
  const response = await fetch(fileName); // relative to SITE_ROOT (<base>)
  if (!response.ok) throw new Error("Could not load " + fileName);
  const page = new DOMParser().parseFromString(await response.text(), "text/html");

  // The page's own head, with our main-folder <base> first.
  const scripts = [...page.querySelectorAll("script[src]")].map((script) => script.getAttribute("src"));
  page.querySelectorAll("script").forEach((script) => script.remove());
  page.querySelectorAll("base").forEach((base) => base.remove());
  document.head.innerHTML = '<base href="' + SITE_ROOT + '">' + page.head.innerHTML;
  document.body.innerHTML = page.body.innerHTML;

  await loadScriptsInOrder(scripts);
}

(async function () {
  if (window.CLEAN_ROUTE) {
    try {
      await showCleanRoute(window.CLEAN_ROUTE);
      return;
    } catch (error) {
      console.error(error);
      document.body.style.visibility = "visible"; // fall back to "not found"
    }
  }
  // A real missing page: load the usual scripts for the header.
  const v = routerVersion ? "?v=" + routerVersion : "";
  await loadScriptsInOrder([
    "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js",
    "js/config.js" + v,
    "js/supabase-client.js" + v,
    "js/auth.js" + v,
    "js/sources.js" + v,
    "js/search-suggest.js" + v,
  ]);
})();
