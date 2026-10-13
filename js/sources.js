// ------------------------------------------------------------
// Where books, comics and manga come from, and which universe they
// belong to (every page, loaded after js/auth.js).
// ------------------------------------------------------------
// Universes (see "Universes" in CLAUDE.md): Books, Comics and Manga.
// A book's universe comes from its genres:
//   "manga" in its genres  -> the Manga universe
//   "comics" in its genres -> the Comics universe
//   neither                -> the Books universe
// (a book can be both comics and manga, then it's in both).
//
// Sources:
//   Open Library (openlibrary.org): free, no key. Ids like OL45804W.
//   Google Books (googleapis.com/books): free, no key, used for comics
//     and manga (category "Comics & Graphic Novels"). Ids are "GB" +
//     Google's volume id, like GBzyTCAlFPjgYC. Their terms ask us to
//     credit Google (footer) and link each book to its Google Books page
//     (book page). We save only the title, author, ISBN, cover link and
//     genres of a Google book when someone logs it, never its
//     description (that loads from Google on the book page).
// AniList is NOT used: its terms forbid manga list/tracker sites.
//
// Every list here leaves out adult titles: Google's "MATURE" books, and
// anything whose subjects or categories look adult (ADULT_WORDS).
// ------------------------------------------------------------

const SOURCES_OPEN_LIBRARY = "https://openlibrary.org";
const GOOGLE_BOOKS = "https://www.googleapis.com/books/v1/volumes";


// ---------- Genres ----------
//
// Open Library tags each book with many "subjects" ("Dune (Imaginary
// place)", "Fiction", "Space warfare"...). We turn those into a short list
// of genres by looking for keywords.
//
//   slug:     the short name we save in the database (books.genres)
//   name:     what people see
//   subject:  the matching Open Library subject page, used for
//             "Popular on Open Library" lists
//   words:    keywords to look for in a book's subjects
//   nonfiction: only for books that aren't fiction (so a novel set in
//             WW2 is Historical fiction, not History)
//   universe: comics and manga are universes as well as genres; they
//             don't appear in genre lists (the universe IS the genre)
//
// If you add or rename a genre here, update the allowed list in the
// database too (supabase/step24-universes-books.sql: books.genres and
// profiles.favorite_genres only accept these slugs).
const GENRES = [
  { slug: "fantasy", name: "Fantasy", subject: "fantasy", words: ["fantasy", "fantasy fiction", "magic", "dragons", "wizards", "elves"] },
  { slug: "science_fiction", name: "Science fiction", subject: "science_fiction", words: ["science fiction", "sci-fi", "space opera", "time travel", "space warfare", "robots"] },
  { slug: "mystery", name: "Mystery", subject: "mystery_and_detective_stories", words: ["mystery", "mystery fiction", "detective", "detective and mystery stories", "private investigators", "murder"] },
  { slug: "thriller", name: "Thriller", subject: "thrillers", words: ["thriller", "thrillers", "suspense", "espionage", "spy stories"] },
  { slug: "romance", name: "Romance", subject: "romance", words: ["romance", "love stories", "romantic"] },
  { slug: "horror", name: "Horror", subject: "horror", words: ["horror", "ghost stories", "ghosts", "vampires", "haunted houses", "zombies"] },
  { slug: "historical_fiction", name: "Historical fiction", subject: "historical_fiction", words: ["historical fiction", "history, fiction"] },
  { slug: "literary_fiction", name: "Literary fiction", subject: "literary_fiction", words: ["literary fiction", "psychological fiction", "domestic fiction", "family life", "coming of age"] },
  { slug: "classics", name: "Classics", subject: "classic_literature", words: ["classic literature", "classics", "english literature", "american literature"] },
  { slug: "young_adult", name: "Young adult", subject: "young_adult_fiction", words: ["young adult", "young adult fiction", "teenagers", "high schools"] },
  { slug: "children", name: "Children's", subject: "juvenile_fiction", words: ["juvenile fiction", "juvenile literature", "children's stories", "picture books", "children's fiction"] },
  { slug: "dystopian", name: "Dystopian", subject: "dystopias", words: ["dystopia", "dystopias", "dystopian", "totalitarianism"] },
  { slug: "adventure", name: "Adventure", subject: "adventure", words: ["adventure", "adventure stories", "adventure and adventurers", "voyages and travels"] },
  { slug: "humour", name: "Humour", subject: "humor", words: ["humor", "humour", "humorous fiction", "humorous stories", "satire"] },
  { slug: "short_stories", name: "Short stories", subject: "short_stories", words: ["short stories"] },
  { slug: "poetry", name: "Poetry", subject: "poetry", words: ["poetry", "poems"] },
  { slug: "biography", name: "Biography & memoir", subject: "biography", words: ["biography", "autobiography", "memoir", "memoirs"], nonfiction: true },
  { slug: "history", name: "History", subject: "history", words: ["history", "world war, 1939-1945", "civilization", "ancient history"], nonfiction: true },
  { slug: "science", name: "Science & nature", subject: "science", words: ["science", "physics", "biology", "astronomy", "chemistry", "evolution", "natural history", "nature"], nonfiction: true },
  { slug: "philosophy", name: "Philosophy", subject: "philosophy", words: ["philosophy", "ethics", "stoics"], nonfiction: true },
  { slug: "psychology", name: "Psychology", subject: "psychology", words: ["psychology", "mental health", "neuroscience"], nonfiction: true },
  { slug: "self_help", name: "Self-help", subject: "self-help", words: ["self-help", "self help", "personal development", "success", "self-actualization", "habits"], nonfiction: true },
  { slug: "business", name: "Business & money", subject: "business", words: ["business", "economics", "management", "finance", "entrepreneurship", "leadership"], nonfiction: true },
  { slug: "true_crime", name: "True crime", subject: "true_crime", words: ["true crime", "criminals", "murder investigation"], nonfiction: true },
  { slug: "travel", name: "Travel", subject: "travel", words: ["travel", "description and travel"], nonfiction: true },
  { slug: "food", name: "Food & cooking", subject: "cooking", words: ["cooking", "cookbooks", "recipes", "food"], nonfiction: true },
  { slug: "religion", name: "Religion & spirituality", subject: "religion", words: ["religion", "spirituality", "christianity", "buddhism", "islam", "judaism", "spiritual life"], nonfiction: true },
  { slug: "politics", name: "Politics & society", subject: "politics", words: ["politics", "political science", "social science", "sociology"], nonfiction: true },
  { slug: "art", name: "Art & design", subject: "art", words: ["art", "design", "photography", "architecture", "music"], nonfiction: true },
  // The two universes (see universeGenresFromSubjects below for how
  // they're spotted).
  { slug: "comics", name: "Comics & graphic novels", subject: "comics", universe: "comics",
    words: ["comics", "comic books", "comic book", "graphic novels", "graphic novel", "comic strips", "comic books, strips", "cartoons and comics", "superheroes", "superhero", "superhero comic books", "bandes dessinées", "webcomics", "comics & graphic novels"] },
  { slug: "manga", name: "Manga", subject: "manga", universe: "manga",
    words: ["manga", "manhwa", "manhua", "webtoon", "webtoons", "shonen", "shōnen", "shounen", "shojo", "shōjo", "shoujo", "seinen", "josei", "japanese comics", "korean comics"] },
];

// Old links and old saved genres: "graphic_novels" is now "comics".
const GENRE_ALIASES = { graphic_novels: "comics" };

// The most genres we give one book (plus comics/manga, which always stay).
const MAX_GENRES_PER_BOOK = 4;

function findGenre(slug) {
  slug = GENRE_ALIASES[slug] || slug;
  return GENRES.find((genre) => genre.slug === slug) || null;
}

function genreLink(slug) {
  return "genre.html?g=" + encodeURIComponent(GENRE_ALIASES[slug] || slug);
}

// The genres people choose between (genre pages, buttons, the taste
// questionnaire): everything except the two universe genres.
function listedGenres() {
  return GENRES.filter((genre) => !genre.universe);
}

// Is this word (or phrase) in the subject? Whole words only, so "art"
// doesn't match "smart" or "martial".
function subjectHasWord(subject, word) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp("(^|[^a-zà-ɏ])" + escaped + "($|[^a-zà-ɏ])").test(subject);
}

// Comics or manga? Manga words (manga, manhwa, webtoon, shonen...) or
// "comic books ... Japan" make it manga. Comics words make it comics,
// unless it's manga; it's both only when there's also a clearly
// Western-comics sign (superheroes, American or European comics).
function universeGenresFromSubjects(lower) {
  const has = (slug) => lower.some((subject) => findGenre(slug).words.some((word) => subjectHasWord(subject, word)));
  const comicsWords = (subject) => /comic|graphic novel|cartoon/.test(subject);
  const asian = (subject) => /japan|korea|china|chinese/.test(subject);
  // "Comic books, strips, etc., Japan", or comics plus a plain "Japan" subject
  const japaneseComics = lower.some((subject) => comicsWords(subject) && asian(subject)) ||
    (lower.some(comicsWords) && lower.some((subject) => /^(japan|japanese|korea|korean)$/.test(subject.trim())));
  const manga = has("manga") || japaneseComics;
  const comics = has("comics");
  const western = lower.some((subject) => /superhero|american comic|european comic|british comic|bandes dessin/.test(subject));
  const found = [];
  if (comics && (!manga || western)) found.push("comics");
  if (manga) found.push("manga");
  return found;
}

// Turns a list of Open Library subjects (or Google categories) into our
// genre slugs, for example ["Fiction", "Space warfare"] gives
// ["science_fiction"]. Returns [] when nothing matches.
function genresFromSubjects(subjects) {
  if (!subjects || subjects.length === 0) return [];
  const lower = subjects.map((subject) => String(subject).toLowerCase());
  // ("graphic novels" are comics, not a sign of fiction: Maus is a memoir)
  const isFiction = lower.some((subject) => /(^|[^a-z-])fiction|stories/.test(subject) || /novel/.test(subject.replace(/graphic novels?/g, "")));

  // Count how many subjects match each genre, then keep the best ones.
  const scores = [];
  for (const genre of GENRES) {
    if (genre.universe) continue;
    if (genre.nonfiction && isFiction) continue;
    const hits = lower.filter((subject) => genre.words.some((word) => subjectHasWord(subject, word))).length;
    if (hits > 0) scores.push({ slug: genre.slug, hits: hits });
  }
  scores.sort((a, b) => b.hits - a.hits);
  return [
    ...universeGenresFromSubjects(lower),
    ...scores.slice(0, MAX_GENRES_PER_BOOK).map((score) => score.slug),
  ];
}


// ---------- Universes ----------

// Which universes a book is in, from its genres: ["books"], ["comics"],
// ["manga"] or ["comics", "manga"].
function bookUniverses(genres) {
  const list = (genres || []).map((slug) => GENRE_ALIASES[slug] || slug);
  const found = ["comics", "manga"].filter((universe) => list.includes(universe));
  return found.length ? found : ["books"];
}

function bookInUniverse(book, universe) {
  return bookUniverses(book && book.genres).includes(universe || currentUniverse());
}

// Narrows a database query on books (or books_with_stats) to the current
// universe. `column` is "genres", or "books.genres" for a query on logs
// that embeds books with books!inner(...).
function onlyThisUniverse(query, column, universe) {
  column = column || "genres";
  universe = universe || currentUniverse();
  if (universe === "books") return query.not(column, "ov", "{comics,manga}");
  return query.contains(column, [universe]);
}

// What the search boxes say, e.g. "Search manga or people".
function searchPlaceholder() {
  return "Search " + UNIVERSES[currentUniverse()].noun + " or people";
}


// ---------- Keeping it family friendly ----------

const ADULT_WORDS = /\b(erotic\w*|erotica|hentai|porn\w*|pornograph\w*|ecchi|smut|sexually explicit|adult comics|adults only|sex comics)\b/i;

function looksAdult(texts) {
  return (texts || []).some((text) => ADULT_WORDS.test(String(text)));
}


// ---------- Small helpers ----------

// Fetches JSON, or gives null if anything goes wrong.
async function sourceJson(url, signal) {
  try {
    const response = await fetch(url, { signal: signal });
    return response.ok ? await response.json() : null;
  } catch (error) {
    if (error.name === "AbortError") throw error;
    return null;
  }
}

// Google's picture links start with http:// and have a page-curl effect;
// we want https:// (the database only accepts https) and a plain cover.
function cleanGoogleCover(link) {
  return link.replace(/^http:/, "https:").replace("&edge=curl", "");
}

// A Google Books id ("GBzyTCAlFPjgYC") -> Google's own volume id.
function googleVolumeId(externalId) {
  return String(externalId || "").replace(/^GB/, "");
}

function isGoogleBookId(externalId) {
  return /^GB[A-Za-z0-9_-]{6,20}$/.test(externalId || "");
}

// The page about this book on Google Books (their terms ask us to link it).
function googleBooksPage(externalId) {
  return "https://books.google.com/books?id=" + encodeURIComponent(googleVolumeId(externalId));
}

// Same title and author twice (different editions or sources): keep one.
function withoutRepeats(books) {
  const seen = new Set();
  return books.filter(function (book) {
    const key = (book.title || "").toLowerCase().replace(/[^a-z0-9]/g, "") + "|" + (book.author || "").toLowerCase().split(",")[0].trim();
    if (seen.has(key) || seen.has(book.externalId)) return false;
    seen.add(key);
    seen.add(book.externalId);
    return true;
  });
}

// Takes turns from two lists: a1, b1, a2, b2, ...
function takeTurns(a, b) {
  const mixed = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i]) mixed.push(a[i]);
    if (b[i]) mixed.push(b[i]);
  }
  return mixed;
}


// ---------- Open Library, by universe ----------

const OPEN_LIBRARY_FIELDS = "key,title,author_name,cover_i,first_publish_year,isbn,subject";

// One Open Library search result in our usual shape:
// { externalId, title, author, coverUrl, year, isbns, genres }.
function openLibraryDocToBook(doc) {
  return {
    externalId: String(doc.key || "").split("/").pop(),
    title: doc.title,
    author: doc.author_name ? doc.author_name.join(", ") : (doc.authors && doc.authors[0] ? doc.authors[0].name : ""),
    coverUrl: (doc.cover_i || doc.cover_id)
      ? "https://covers.openlibrary.org/b/id/" + (doc.cover_i || doc.cover_id) + "-M.jpg?default=false"
      : null,
    coverId: doc.cover_i || doc.cover_id || null,
    year: doc.first_publish_year || null,
    isbns: (doc.isbn || []).slice(0, 3),
    genres: genresFromSubjects(doc.subject || []),
    subjects: doc.subject || null,
  };
}

// Keeps only books of the universe, and never adult ones. Books without
// any subjects can't be checked: they count as books (so they only show
// in the Books universe).
function fitsUniverse(book, universe) {
  if (looksAdult([book.title].concat(book.subjects || []))) return false;
  return bookInUniverse(book, universe);
}

// Searches Open Library for `query` (a normal search, or Solr words like
// subject:"manga"), keeping only books of the universe.
async function searchOpenLibraryIn(query, universe, limit, options) {
  options = options || {};
  // Comics and manga are a small part of Open Library, so ask for more
  // and keep the ones that fit.
  const ask = universe === "books" ? limit + 5 : Math.max(limit * 3, 30);
  const url =
    SOURCES_OPEN_LIBRARY + "/search.json?limit=" + ask + (options.offset ? "&offset=" + options.offset : "") +
    (options.sort ? "&sort=" + options.sort : "") +
    "&fields=" + OPEN_LIBRARY_FIELDS + "&q=" + encodeURIComponent(query);
  let response;
  try {
    response = await fetch(url, { signal: options.signal });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new Error("We couldn't reach Open Library, where our book information comes from. Check your internet connection and try again in a minute.");
  }
  if (!response.ok) throw new Error("Open Library isn't answering right now (error " + response.status + "). Try again in a minute.");
  const data = await response.json();
  return (data.docs || [])
    .map(openLibraryDocToBook)
    .filter((book) => /^OL\d+W$/.test(book.externalId) && fitsUniverse(book, universe))
    .slice(0, limit);
}

// Open Library's words for a universe: subject:"manga", or
// (subject:"comics" OR subject:"graphic novels").
function universeSubjectQuery(universe) {
  if (universe === "manga") return '(subject:"manga" OR subject:"manhwa" OR subject:"webtoon")';
  return '(subject:"comics" OR subject:"graphic novels" OR subject:"comic books, strips, etc")';
}


// ---------- Google Books ----------

// One Google Books volume in our usual shape, or null if it's adult or
// has no title.
function googleVolumeToBook(item, universe) {
  const info = (item && item.volumeInfo) || {};
  if (!item || !item.id || !info.title) return null;
  if (info.maturityRating === "MATURE") return null;
  const categories = info.categories || [];
  // "Comics & Graphic Novels / Manga / Fantasy" -> its parts
  const parts = categories.flatMap((category) => category.split("/").map((part) => part.trim()));
  if (looksAdult([info.title, info.subtitle].concat(parts))) return null;
  let genres = genresFromSubjects(parts);
  // Searched as comics or manga, so it is one, even if Google's category
  // is only the general "Comics & Graphic Novels".
  if (universe === "manga" && !genres.includes("manga")) genres = ["manga"].concat(genres.filter((slug) => slug !== "comics"));
  if (universe === "comics" && !genres.includes("comics") && !genres.includes("manga")) genres = ["comics"].concat(genres);
  const isbns = (info.industryIdentifiers || [])
    .filter((id) => id.type === "ISBN_13" || id.type === "ISBN_10")
    .sort((a) => (a.type === "ISBN_13" ? -1 : 1))
    .map((id) => id.identifier);
  const links = info.imageLinks || {};
  const cover = links.thumbnail || links.smallThumbnail;
  return {
    externalId: "GB" + item.id,
    title: info.subtitle && info.title.length < 40 ? info.title + ": " + info.subtitle : info.title,
    author: (info.authors || []).join(", "),
    coverUrl: cover ? cleanGoogleCover(cover) : null,
    year: info.publishedDate ? Number(String(info.publishedDate).slice(0, 4)) || null : null,
    isbns: isbns.slice(0, 3),
    genres: genres,
    pageCount: info.pageCount || null,
    description: info.description || null,
  };
}

// Searches Google Books for comics or manga. `words` is the search
// (may be empty for "popular"); `orderBy` "relevance" or "newest".
async function searchGoogleBooksIn(words, universe, limit, options) {
  options = options || {};
  if (universe === "books") return [];
  const subject = universe === "manga" ? 'subject:"manga"' : 'subject:"comics"';
  const url =
    GOOGLE_BOOKS + "?printType=books&maxResults=" + Math.min(40, limit + 10) +
    (options.offset ? "&startIndex=" + options.offset : "") +
    "&orderBy=" + (options.orderBy || "relevance") +
    "&fields=items(id,volumeInfo(title,subtitle,authors,publishedDate,categories,imageLinks,industryIdentifiers,maturityRating,pageCount))" +
    "&q=" + encodeURIComponent(((words || "") + " " + subject).trim());
  const data = await sourceJson(url, options.signal);
  return ((data && data.items) || [])
    .map((item) => googleVolumeToBook(item, universe))
    .filter((book) => book && bookInUniverse(book, universe))
    .slice(0, limit);
}

// One Google Books volume, in the shape of a row of our books table.
// The description is NOT included (Google's terms; see the top of this
// file): fetchGoogleDescription() gets it for the book page.
async function fetchBookFromGoogle(externalId) {
  const data = await sourceJson(GOOGLE_BOOKS + "/" + encodeURIComponent(googleVolumeId(externalId)));
  if (!data) return null;
  const universe = /manga/i.test(((data.volumeInfo || {}).categories || []).join(" ")) ? "manga" : "comics";
  const book = googleVolumeToBook(data, universe);
  if (!book) return null;
  return {
    external_id: externalId,
    title: book.title,
    author: book.author || null,
    cover_url: book.coverUrl,
    description: null,
    isbn: book.isbns[0] || null,
    genres: book.genres,
    page_count: book.pageCount && book.pageCount <= 50000 ? book.pageCount : null,
  };
}

// The description of a Google Books volume as plain text (Google sends
// a little HTML, which we only read, never put on the page).
async function fetchGoogleDescription(externalId) {
  const data = await sourceJson(GOOGLE_BOOKS + "/" + encodeURIComponent(googleVolumeId(externalId)) + "?fields=volumeInfo(description)");
  const html = data && data.volumeInfo && data.volumeInfo.description;
  if (!html) return null;
  const text = new DOMParser().parseFromString(html.replace(/<br\s*\/?>|<\/p>/gi, "\n"), "text/html").body.textContent || "";
  return text.replace(/\n{3,}/g, "\n\n").trim() || null;
}


// ---------- Searching the current universe ----------

// The search box and the search page: books of the current universe.
// Books: Open Library. Comics and manga: Open Library and Google Books,
// taking turns, without repeats.
async function searchUniverseBooks(query, limit, signal, universe) {
  universe = universe || currentUniverse();
  if (universe === "books") return searchOpenLibraryIn(query, "books", limit, { signal: signal });
  const [open, google] = await Promise.allSettled([
    searchOpenLibraryIn(query, universe, limit, { signal: signal }),
    searchGoogleBooksIn(query, universe, limit, { signal: signal }),
  ]);
  for (const result of [open, google]) {
    if (result.status === "rejected" && result.reason && result.reason.name === "AbortError") throw result.reason;
  }
  if (open.status === "rejected" && google.status === "rejected") throw open.reason;
  const mixed = takeTurns(open.status === "fulfilled" ? open.value : [], google.status === "fulfilled" ? google.value : []);
  return withoutRepeats(mixed).slice(0, limit);
}

// Popular comics or manga ("Popular this week" and "New and noteworthy"
// rows, popular.html), or books of a genre within comics or manga.
// `genreSlug` may be null. `kind`: "popular" or "newest".
async function fetchUniverseBooks(universe, genreSlug, limit, offset, kind) {
  const genre = genreSlug ? findGenre(genreSlug) : null;
  const genreWord = genre && !genre.universe ? genre.words[0] : "";
  const openQuery = universeSubjectQuery(universe) + (genreWord ? ' AND subject:"' + genreWord + '"' : "");
  const [open, google] = await Promise.allSettled([
    searchOpenLibraryIn(openQuery, universe, limit, { offset: offset, sort: kind === "newest" ? "new" : "editions" }),
    searchGoogleBooksIn(genreWord, universe, limit, { offset: offset, orderBy: kind === "newest" ? "newest" : "relevance" }),
  ]);
  const mixed = takeTurns(open.status === "fulfilled" ? open.value : [], google.status === "fulfilled" ? google.value : []);
  return withoutRepeats(mixed).slice(0, limit);
}


// ---------- One book, from wherever it lives ----------

// Our books table shape (without the id), from Open Library or Google
// Books, or null if it doesn't exist. fetchBookFromOpenLibrary is in
// js/books.js.
async function fetchBookDetails(externalId) {
  if (isGoogleBookId(externalId)) return fetchBookFromGoogle(externalId);
  return fetchBookFromOpenLibrary(externalId);
}


// ---------- Search boxes say which universe ----------

function showSearchPlaceholders() {
  const text = searchPlaceholder();
  document.querySelectorAll(".header-search input[name=q], .search-form input[name=q]").forEach(function (input) {
    if (input.dataset.keepPlaceholder) return;
    input.placeholder = text;
    input.setAttribute("aria-label", text);
  });
}

showSearchPlaceholders();
