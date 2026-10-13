// ------------------------------------------------------------
// Author page: author/OL23919A (old style: author.html?a=OL23919A)
// ------------------------------------------------------------
// Everything comes from Open Library: the author record (name, years,
// photo, bio, Wikipedia link) and their books (most editions first),
// 24 at a time with Load more. Nothing is saved in our database.
// ------------------------------------------------------------

const AUTHOR_PAGE = 24;
const authorId = (pageParam("a") || "").toUpperCase();

const authorBooksBox = document.getElementById("author-books");
const authorMore = document.getElementById("more-author-books");
let authorName = "";
let authorBooksOffset = 0;
const authorTitlesShown = new Set(); // to skip the same title twice

function showAuthorProblem(text) {
  document.getElementById("loading").hidden = true;
  document.getElementById("not-found-text").textContent = text;
  document.getElementById("not-found").hidden = false;
}

// The bio can be plain text or { value: "text" }. It often contains
// links written like [this](https://...), HTML tags, or a list of
// sources at the end. Keep only the plain words.
function cleanBio(bio) {
  let text = typeof bio === "object" && bio !== null ? bio.value || "" : String(bio || "");
  text = text.split(/\n\s*-{3,}/)[0];                         // notes after a "-----" line
  text = text.replace(/^\s*\[\d+\]:.*$/gm, "");               // "[1]: https://..." lines
  text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");        // [words](link) -> words
  text = text.replace(/\[([^\]]*)\]\[\d*\]/g, "$1");          // [words][1] -> words
  text = text.replace(/<[^>]*>/g, "");                        // <b>, <a href>, ...
  text = text.replace(/\(\s*(source|from)\b[^)]*\)/gi, "");   // "(Source: Wikipedia)"
  text = text.replace(/[*_]{2,}/g, "");                       // **bold** marks
  text = text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

// A Wikipedia link from the record, or null. Only real Wikipedia
// addresses are allowed.
function findWikipedia(record) {
  const candidates = [record.wikipedia].concat((record.links || []).map((link) => link && link.url));
  for (const candidate of candidates) {
    try {
      const url = new URL(candidate);
      if ((url.protocol === "https:" || url.protocol === "http:") && /(^|\.)wikipedia\.org$/.test(url.hostname)) {
        url.protocol = "https:";
        return url.href;
      }
    } catch (error) {
      // not an address
    }
  }
  return null;
}

async function fetchAuthorRecord(id) {
  let response = await fetchOpenLibrary(OPEN_LIBRARY + "/authors/" + id + ".json");
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Open Library isn't answering right now (error " + response.status + "). Try again in a minute.");
  let record = await response.json();
  // Merged authors point to the one that's kept.
  if (record.type && record.type.key === "/type/redirect" && record.location) {
    response = await fetchOpenLibrary(OPEN_LIBRARY + record.location + ".json");
    if (!response.ok) return null;
    record = await response.json();
  }
  return record;
}

function showAuthor(record) {
  authorName = record.name || record.personal_name || "Unknown author";
  setPageInfo(authorName + " \u00b7 Books and reviews \u00b7 Reddle",
    cleanBio(record.bio) || "Books by " + authorName + ", with ratings and reviews from Reddle readers.");
  document.getElementById("author-name").textContent = authorName;
  document.getElementById("author-years").textContent = yearsText(record.birth_date, record.death_date);

  const photoId = (record.photos || []).find((id) => id > 0);
  const photoUrl = photoId ? "https://covers.openlibrary.org/a/id/" + photoId + "-M.jpg?default=false" : null;
  document.getElementById("author-photo").appendChild(makeAuthorAvatar(authorName, photoUrl, "avatar-large"));

  const wikipedia = findWikipedia(record);
  if (wikipedia) {
    document.getElementById("author-wikipedia-link").href = wikipedia;
    document.getElementById("author-wikipedia").hidden = false;
  }

  const bio = cleanBio(record.bio);
  if (bio) {
    const bioText = document.getElementById("author-bio");
    bioText.textContent = bio;
    document.getElementById("author-bio-section").hidden = false;
    const more = document.getElementById("author-bio-more");
    // Only offer "Read more" when the text is actually cut off.
    requestAnimationFrame(function () {
      more.hidden = bioText.scrollHeight <= bioText.clientHeight + 2;
    });
    more.addEventListener("click", function () {
      const open = bioText.classList.toggle("clamped") === false;
      more.textContent = open ? "Show less" : "Read more";
    });
  }

  document.getElementById("loading").hidden = true;
  document.getElementById("author").hidden = false;
}

// "The Hobbit" and "the hobbit." count as the same title.
function sameTitleKey(title) {
  return String(title || "").toLowerCase().replace(/^(the|a|an) /, "").replace(/[^a-z0-9]+/g, "");
}

async function loadAuthorBooks() {
  authorMore.disabled = true;
  const firstLoad = authorBooksOffset === 0;
  try {
    const url =
      OPEN_LIBRARY + "/search.json?q=" + encodeURIComponent("author_key:" + authorId) +
      "&sort=editions&fields=key,title,cover_i,first_publish_year" +
      "&limit=" + AUTHOR_PAGE + "&offset=" + authorBooksOffset;
    const response = await fetchOpenLibrary(url);
    if (!response.ok) throw new Error("Open Library isn't answering right now (error " + response.status + "). Try again in a minute.");
    const data = await response.json();
    const docs = data.docs || [];
    authorBooksOffset += docs.length;

    if (firstLoad) authorBooksBox.textContent = "";
    for (const doc of docs) {
      const key = sameTitleKey(doc.title);
      const id = workIdFromKey(doc.key);
      if (!key || authorTitlesShown.has(key) || !isValidBookId(id)) continue;
      authorTitlesShown.add(key);
      authorBooksBox.appendChild(makeBookTile({
        external_id: id,
        title: doc.title,
        author: authorName,
        cover_url: doc.cover_i ? coverUrlFromId(doc.cover_i, "M") : null,
      }, "", doc.first_publish_year ? String(doc.first_publish_year) : ""));
    }
    if (authorTitlesShown.size === 0) {
      authorBooksBox.appendChild(el("p", "muted", "Open Library doesn't list any books for this author yet."));
    }
    authorMore.hidden = docs.length < AUTHOR_PAGE || authorBooksOffset >= (data.numFound || 0);
  } catch (error) {
    if (firstLoad) authorBooksBox.textContent = "";
    authorBooksBox.appendChild(el("p", "status status-error", friendlyError(error, "Couldn't load the books. ")));
  } finally {
    authorMore.disabled = false;
  }
}

(async function () {
  if (!isValidAuthorId(authorId)) {
    showAuthorProblem("That doesn't look like an author link.");
    return;
  }
  useCleanAddress(authorLink(authorId));
  authorMore.addEventListener("click", loadAuthorBooks);

  try {
    const record = await fetchAuthorRecord(authorId);
    if (!record) {
      showAuthorProblem("We couldn't find that author on Open Library.");
      return;
    }
    showAuthor(record);
  } catch (error) {
    showAuthorProblem(friendlyError(error));
    return;
  }
  loadAuthorBooks();
})();
