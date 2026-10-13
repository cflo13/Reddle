// ------------------------------------------------------------
// Live search suggestions under the header search box (every page)
// ------------------------------------------------------------
// While you type, a box under the search bar shows:
//   Books   (up to 5, from the current universe: Open Library, plus
//            Google Books for comics and manga; see js/sources.js)
//   Authors (up to 3, from Open Library's author search)
//   Readers (up to 4, from our profiles)
// It starts after 2 characters and waits 250 ms after the last key
// press. Answers that arrive late for an older search are ignored.
// Keyboard: arrows move, Enter opens, Escape closes.
//
// Also has the Open Library author helpers used by the search page and
// the author page (searchAuthors, authorPhotoUrl, makeAuthorAvatar).
// ------------------------------------------------------------

const SUGGEST_OPEN_LIBRARY = "https://openlibrary.org";
const SUGGEST_WAIT_MS = 250;


// ---------- Open Library authors (shared) ----------

// "/authors/OL23919A" or "OL23919A" -> "OL23919A"
function authorIdFromKey(key) {
  return String(key || "").split("/").pop();
}

function isValidAuthorId(id) {
  return /^OL\d+A$/.test(id || "");
}

// The author's photo on Open Library ("S", "M" or "L"). Open Library
// answers 404 when there's no photo (?default=false), so we can show
// the initial instead.
function authorPhotoUrl(authorId, size) {
  return "https://covers.openlibrary.org/a/olid/" + encodeURIComponent(authorId) + "-" + size + ".jpg?default=false";
}

// A round photo, or a grey circle with the first letter of the name.
// `photoUrl` may be null.
function makeAuthorAvatar(name, photoUrl, sizeClass) {
  const avatar = el("span", "avatar avatar-default " + sizeClass);
  avatar.textContent = (name || "?").charAt(0).toUpperCase();
  if (photoUrl) {
    const img = document.createElement("img");
    img.alt = "";
    img.loading = "lazy";
    img.addEventListener("load", function () {
      if (img.naturalWidth < 10) return; // a blank picture counts as none
      avatar.classList.remove("avatar-default");
      avatar.textContent = "";
      avatar.appendChild(img);
    });
    img.src = photoUrl; // starts loading; shown only if it works
  }
  return avatar;
}

// Searches Open Library's authors. Returns [{ id, name, years, topWork }].
async function searchAuthors(query, limit, signal) {
  const url = SUGGEST_OPEN_LIBRARY + "/search/authors.json?limit=" + limit + "&q=" + encodeURIComponent(query);
  let response;
  try {
    response = await fetch(url, { signal: signal });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new Error("We couldn't reach Open Library, where our book information comes from. Check your internet connection and try again in a minute.");
  }
  if (!response.ok) throw new Error("Open Library isn't answering right now (error " + response.status + "). Try again in a minute.");
  const data = await response.json();
  return (data.docs || [])
    .filter((doc) => doc.name && isValidAuthorId(authorIdFromKey(doc.key)))
    .map((doc) => ({
      id: authorIdFromKey(doc.key),
      name: doc.name,
      years: yearsText(doc.birth_date, doc.death_date),
      topWork: doc.top_work || "",
    }));
}

// "1947" + "2020" -> "1947 – 2020"; only a birth -> "born 1947".
function yearsText(birth, death) {
  const year = (text) => (String(text || "").match(/\d{3,4}/) || [""])[0];
  const born = year(birth);
  const died = year(death);
  if (born && died) return born + " – " + died;
  if (born) return "born " + born;
  if (died) return "died " + died;
  return "";
}


// ---------- The dropdown ----------

// Every search box gets the dropdown: the one in the header (computers)
// and the one on the search page (what phones use, from the bottom bar).
function setUpSearchSuggestions(form, number) {
  const input = form && form.querySelector("input[name=q]");
  if (!input) return;

  const box = el("div", "suggest-box");
  box.id = "search-suggestions-" + number;
  box.setAttribute("role", "listbox");
  box.setAttribute("aria-label", "Search suggestions");
  box.hidden = true;
  document.body.appendChild(box);

  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-controls", box.id);
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("autocomplete", "off");

  let timer = null;
  let searchNumber = 0;       // the newest search; older answers are ignored
  let controller = null;      // to cancel Open Library requests we no longer need
  let highlighted = -1;       // which result the arrow keys are on
  const remembered = {};      // query -> results, so going back is instant

  // Puts the box right under the search bar, as wide as fits the screen.
  function placeBox() {
    const rect = form.getBoundingClientRect();
    const width = Math.min(440, window.innerWidth - 16);
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    box.style.top = rect.bottom + window.scrollY + 6 + "px";
    box.style.left = left + window.scrollX + "px";
    box.style.width = width + "px";
  }

  function open() {
    placeBox();
    box.hidden = false;
    input.setAttribute("aria-expanded", "true");
  }

  function close() {
    box.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    highlighted = -1;
  }

  function options() {
    return [...box.querySelectorAll("[role=option]")];
  }

  function highlight(index) {
    const all = options();
    all.forEach((option) => option.setAttribute("aria-selected", "false"));
    highlighted = index;
    if (index < 0 || index >= all.length) {
      highlighted = -1;
      input.removeAttribute("aria-activedescendant");
      return;
    }
    all[index].setAttribute("aria-selected", "true");
    input.setAttribute("aria-activedescendant", all[index].id);
    all[index].scrollIntoView({ block: "nearest" });
  }

  function seeAllLink(query) {
    return "search.html?q=" + encodeURIComponent(query);
  }

  // One result line: picture, main text and a grey second line.
  let optionCount = 0;
  function makeOption(href, picture, main, detail) {
    const link = el("a", "suggest-option");
    link.href = href;
    link.id = "suggest-option-" + optionCount++;
    link.setAttribute("role", "option");
    link.setAttribute("aria-selected", "false");
    link.tabIndex = -1;
    link.appendChild(picture);
    const text = el("span", "suggest-text");
    text.appendChild(el("span", "suggest-main", main));
    if (detail) text.appendChild(el("span", "suggest-detail", detail));
    link.appendChild(text);
    return link;
  }

  function makeSection(title, items) {
    const section = el("div", "suggest-section");
    section.setAttribute("role", "group");
    section.setAttribute("aria-label", title);
    section.appendChild(el("p", "suggest-heading", title));
    items.forEach((item) => section.appendChild(item));
    return section;
  }

  function bookPicture(book) {
    const picture = el("span", "suggest-cover");
    if (book.coverId || book.coverUrl) {
      const img = document.createElement("img");
      img.alt = "";
      img.loading = "lazy";
      img.src = book.coverId ? "https://covers.openlibrary.org/b/id/" + book.coverId + "-S.jpg" : book.coverUrl;
      picture.appendChild(img);
    }
    return picture;
  }

  function showMessage(query, text) {
    box.textContent = "";
    box.appendChild(el("p", "suggest-message", text));
    box.appendChild(makeSeeAll(query));
    open();
  }

  function makeSeeAll(query) {
    const link = el("a", "suggest-option suggest-see-all", "See all results for “" + query + "”");
    link.href = seeAllLink(query);
    link.id = "suggest-option-" + optionCount++;
    link.setAttribute("role", "option");
    link.setAttribute("aria-selected", "false");
    link.tabIndex = -1;
    return link;
  }

  function showResults(query, results) {
    box.textContent = "";
    highlighted = -1;
    const { books, authors, readers } = results;

    if (books.length) {
      box.appendChild(makeSection(UNIVERSES[currentUniverse()].name, books.map((book) =>
        makeOption(bookLink(book.id), bookPicture(book), book.title, book.author))));
    }
    if (authors.length) {
      box.appendChild(makeSection("Authors", authors.map((author) =>
        makeOption(authorLink(author.id), makeAuthorAvatar(author.name, authorPhotoUrl(author.id, "S"), "avatar-small"),
          author.name, [author.years, author.topWork].filter(Boolean).join(" · ")))));
    }
    if (readers.length) {
      box.appendChild(makeSection("Readers", readers.map((person) =>
        makeOption(profileLink(person.username), makeAvatar(person, "avatar-small"), "@" + person.username, ""))));
    }
    if (!books.length && !authors.length && !readers.length) {
      box.appendChild(el("p", "suggest-message", results.failed ? "Search isn't working right now. Try again in a minute." : "No results"));
    }
    box.appendChild(makeSeeAll(query));
    open();
  }

  // The three searches, at the same time. A failed one counts as empty.
  async function findEverything(query, signal) {
    // Books of the current universe (js/sources.js).
    const bookSearch = searchUniverseBooks(query, 5, signal).then((books) => books.map((book) => ({
      id: book.externalId,
      title: book.title,
      author: book.author,
      coverId: book.coverId || null,
      coverUrl: book.coverUrl,
    })));

    const authorSearch = searchAuthors(query, 3, signal);

    // Readers: only when the words could be a username.
    const name = query.toLowerCase().replace(/^@/, "");
    const readerSearch = db && /^[a-z0-9_]+$/.test(name)
      ? db.from("profiles").select("username, avatar_url")
          .ilike("username", "%" + name + "%")
          .order("username", { ascending: true }).limit(4)
          .then(({ data, error }) => { if (error) throw error; return data; })
      : Promise.resolve([]);

    const [books, authors, readers] = await Promise.allSettled([bookSearch, authorSearch, readerSearch]);
    const value = (result) => (result.status === "fulfilled" ? result.value : []);
    const aborted = [books, authors, readers].some((r) => r.status === "rejected" && r.reason && r.reason.name === "AbortError");
    if (aborted) throw new DOMException("Old search", "AbortError");
    return {
      books: value(books),
      authors: value(authors),
      readers: value(readers),
      failed: [books, authors, readers].every((r) => r.status === "rejected"),
    };
  }

  async function search(query) {
    const myNumber = ++searchNumber;
    if (remembered[query]) return showResults(query, remembered[query]);

    if (controller) controller.abort(); // the older search isn't needed now
    controller = new AbortController();
    showMessage(query, "Searching...");
    try {
      const results = await findEverything(query, controller.signal);
      if (myNumber !== searchNumber) return; // a newer search started: ignore
      if (!results.failed) remembered[query] = results;
      showResults(query, results);
    } catch (error) {
      if (error.name === "AbortError" || myNumber !== searchNumber) return;
      console.warn("Search suggestions failed:", error);
      showMessage(query, "Search isn't working right now. Try again in a minute.");
    }
  }

  input.addEventListener("input", function () {
    clearTimeout(timer);
    const query = input.value.trim();
    if (query.length < 2) {
      searchNumber++; // ignore anything still on its way
      close();
      return;
    }
    timer = setTimeout(() => search(query), SUGGEST_WAIT_MS);
  });

  input.addEventListener("focus", function () {
    if (input.value.trim().length >= 2 && box.childNodes.length) open();
  });

  input.addEventListener("keydown", function (event) {
    if (box.hidden) {
      if (event.key === "ArrowDown" && input.value.trim().length >= 2 && box.childNodes.length) {
        open();
        event.preventDefault();
      }
      return;
    }
    const count = options().length;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      highlight(highlighted + 1 >= count ? 0 : highlighted + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      highlight(highlighted <= 0 ? count - 1 : highlighted - 1);
    } else if (event.key === "Enter" && highlighted >= 0) {
      event.preventDefault(); // open the highlighted one instead of searching
      window.location.href = options()[highlighted].href;
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  });

  // Clicking or tapping anywhere else closes it.
  document.addEventListener("pointerdown", function (event) {
    if (!box.hidden && !box.contains(event.target) && !form.contains(event.target)) close();
  });
  window.addEventListener("resize", function () {
    if (!box.hidden) placeBox();
  });
}

document.querySelectorAll(".header-search, .search-form").forEach(setUpSearchSuggestions);
