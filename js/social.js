// ------------------------------------------------------------
// Posts, comments and likes on posts (supabase/step22-social-feed.sql)
// ------------------------------------------------------------
// Loaded on every page that shows books (after books.js):
//   makePostCard(post)          a post in the feed
//   makeCommentArea(kind, id)   "Comments (3)" + the thread, for a review
//                               ("log"), a post ("post") or the Book of
//                               the week discussion ("pick")
//   fillCommentCounts(kind, ids), fillPostLikes(ids)
//   makePostComposer(options)   the "Share a thought" box
//   makeBookPicker(onPick)      search Open Library and pick one book
// The database decides who may see, like or comment on what (private
// profiles, blocks); muted people are left out here, on your screen.
// Database links are always named (like profiles!posts_user_id_fkey),
// because there are several ways from one table to another.
// ------------------------------------------------------------

const POST_MAX = 1000;
const COMMENT_MAX = 500;
const POST_PICTURE_MAX_BYTES = 5 * 1024 * 1024;
const POST_PICTURE_SIZE = 1600; // longest side after resizing, in pixels
const POST_FIELDS =
  "id, user_id, body, book_id, image_url, prompt_id, created_at, " +
  "profiles!posts_user_id_fkey(username, avatar_url), " +
  "books!posts_book_id_fkey(id, external_id, title, author, cover_url), " +
  "weekly_prompts!posts_prompt_id_fkey(id, question)";
const COMMENT_FIELDS = "id, user_id, body, created_at, profiles!comments_user_id_fkey(username, avatar_url)";
const COMMENT_COLUMNS = { log: "log_id", post: "post_id", pick: "pick_id" };

// "5 min ago", "3 hours ago", "12 Oct"
function ago(dateText) {
  const minutes = Math.round((Date.now() - new Date(dateText).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return minutes + " min ago";
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours + (hours === 1 ? " hour ago" : " hours ago");
  const days = Math.round(hours / 24);
  if (days < 7) return days + (days === 1 ? " day ago" : " days ago");
  return new Date(dateText).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

// People you muted, asked once per page (their comments stay hidden).
let mutedOnThisPage = null;
async function mutedSet() {
  if (!mutedOnThisPage) mutedOnThisPage = new Set(await mutedIds().catch(() => []));
  return mutedOnThisPage;
}

function makeLinkButton(text, onClick, className) {
  const button = el("button", "link-button" + (className ? " " + className : ""), text);
  button.type = "button";
  button.addEventListener("click", onClick);
  return button;
}

// ---------- Reports for posts and comments ----------

async function sendContentReport(kind, id, button) {
  const reason = await askReportReason(kind); // js/auth.js
  if (reason === null) return;
  button.disabled = true;
  const report = { reporter_id: currentUserId, reason: reason.trim().slice(0, 500) || null };
  report[kind === "post" ? "post_id" : "comment_id"] = id;
  const { error } = await db.from("content_reports").insert(report);
  if (error && error.code !== "23505") {
    button.disabled = false;
    window.alert(friendlyError(error, "Sorry, the report didn't go through. "));
    return;
  }
  button.textContent = "Reported";
  button.title = "Thanks. We'll take a look.";
}


// ---------- Comments ----------

// "Comments (3)" button plus the thread under it (closed at first).
// kind: "log", "post" or "pick". Returns { button, thread }.
function makeCommentArea(kind, id, options) {
  const settings = options || {};
  const button = el("button", "link-button comment-toggle", "Comment");
  button.type = "button";
  button.dataset.commentKind = kind;
  button.dataset.commentId = id;
  button.dataset.count = "0";
  button.setAttribute("aria-expanded", "false");
  const thread = el("div", "comment-thread");
  thread.hidden = true;
  let loaded = false;

  async function open() {
    thread.hidden = false;
    button.setAttribute("aria-expanded", "true");
    if (!loaded) {
      loaded = true;
      await loadThread(kind, id, thread, button);
    }
  }
  button.addEventListener("click", function () {
    if (thread.hidden) open();
    else {
      thread.hidden = true;
      button.setAttribute("aria-expanded", "false");
    }
  });
  if (settings.open) open();
  return { button: button, thread: thread };
}

function showCommentCount(button, count) {
  button.dataset.count = String(count);
  button.textContent = count === 0 ? "Comment" : count === 1 ? "1 comment" : count + " comments";
}

async function fillCommentCounts(kind, ids) {
  if (!db || ids.length === 0) return;
  const column = COMMENT_COLUMNS[kind];
  const { data } = await db.from("comment_counts").select(column + ", comment_count").in(column, ids);
  const counts = {};
  for (const row of data || []) counts[row[column]] = row.comment_count;
  for (const id of ids) {
    document.querySelectorAll('.comment-toggle[data-comment-kind="' + kind + '"][data-comment-id="' + id + '"]')
      .forEach((button) => showCommentCount(button, counts[id] || 0));
  }
}

function makeComment(comment, kind, id, thread, button) {
  const row = el("div", "comment");
  const person = comment.profiles || { username: "someone" };
  row.appendChild(makeAvatar(person, "avatar-tiny"));
  const body = el("div", "comment-body");
  const top = el("p", "comment-top");
  const name = el("a", "comment-name", "@" + person.username);
  name.href = profileLink(person.username);
  top.append(name, el("span", "muted", " · " + ago(comment.created_at)));
  body.appendChild(top);
  body.appendChild(el("p", "comment-text", comment.body));
  const actions = el("p", "comment-actions");
  if (currentUserId && (comment.user_id === currentUserId || currentIsAdmin)) {
    actions.appendChild(makeLinkButton("Delete", async function () {
      if (!window.confirm("Delete this comment?")) return;
      const { error } = await db.from("comments").delete().eq("id", comment.id);
      if (error) return window.alert(friendlyError(error, "Couldn't delete it. "));
      row.remove();
      showCommentCount(button, Math.max(0, Number(button.dataset.count) - 1));
    }));
  } else if (currentUserId) {
    const report = makeLinkButton("Report", () => sendContentReport("comment", comment.id, report));
    actions.appendChild(report);
  }
  if (actions.childNodes.length) body.appendChild(actions);
  row.appendChild(body);
  return row;
}

async function loadThread(kind, id, thread, button) {
  thread.textContent = "";
  const list = el("div", "comment-list");
  list.appendChild(el("p", "muted comment-loading", "Loading comments..."));
  thread.appendChild(list);

  const [result, muted] = await Promise.all([
    db.from("comments").select(COMMENT_FIELDS).eq(COMMENT_COLUMNS[kind], id)
      .order("created_at", { ascending: true }).order("id", { ascending: true }).limit(200),
    mutedSet(),
  ]);
  list.textContent = "";
  if (result.error) {
    list.appendChild(el("p", "status status-error", friendlyError(result.error, "Couldn't load the comments. ")));
  } else {
    const comments = result.data.filter((comment) => !muted.has(comment.user_id));
    if (comments.length === 0) list.appendChild(el("p", "muted comment-empty", "No comments yet. Start the conversation."));
    for (const comment of comments) list.appendChild(makeComment(comment, kind, id, thread, button));
  }

  // The box to add one
  if (!currentUserId) {
    const login = el("p", "muted comment-login");
    const link = el("a", "", "Log in");
    link.href = "login.html";
    login.append(link, " to join in.");
    thread.appendChild(login);
    return;
  }
  const form = el("form", "comment-form");
  const box = el("textarea", "comment-input");
  box.rows = 2;
  box.maxLength = COMMENT_MAX;
  box.placeholder = "Add a comment";
  box.setAttribute("aria-label", "Add a comment");
  const counter = el("span", "hint", "0 / " + COMMENT_MAX);
  box.addEventListener("input", () => (counter.textContent = box.value.length + " / " + COMMENT_MAX));
  const send = el("button", "button", "Post");
  send.type = "submit";
  const message = el("p", "hint hint-error");
  message.hidden = true;
  const bottom = el("div", "comment-form-bottom");
  bottom.append(counter, send);
  form.append(box, bottom, message);
  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    const text = box.value.trim();
    if (!text) return;
    send.disabled = true;
    const row = { user_id: currentUserId, body: text };
    row[COMMENT_COLUMNS[kind]] = id;
    const { data, error } = await db.from("comments").insert(row).select(COMMENT_FIELDS).single();
    send.disabled = false;
    if (error) {
      message.textContent = friendlyError(error, "Couldn't post it. ");
      message.hidden = false;
      return;
    }
    message.hidden = true;
    box.value = "";
    counter.textContent = "0 / " + COMMENT_MAX;
    const empty = list.querySelector(".comment-empty");
    if (empty) empty.remove();
    list.appendChild(makeComment(data, kind, id, thread, button));
    showCommentCount(button, Number(button.dataset.count) + 1);
  });
  thread.appendChild(form);
}


// ---------- Likes on posts ----------

function makePostLikeButton(post) {
  const button = el("button", "like-button");
  button.type = "button";
  button.dataset.postId = post.id;
  button.dataset.count = "0";
  button.setAttribute("aria-pressed", "false");
  button.appendChild(el("span", "like-heart", "♥"));
  button.appendChild(el("span", "like-count", ""));
  if (currentUserId && post.user_id === currentUserId) {
    button.disabled = true;
    button.title = "Likes on your post";
  } else {
    button.title = currentUserId ? "Like" : "Log in to like";
    button.addEventListener("click", () => togglePostLike(button));
  }
  updateLikeLabel(button);
  return button;
}

async function fillPostLikes(postIds) {
  if (!db || postIds.length === 0) return;
  const [counts, mine] = await Promise.all([
    db.from("post_like_counts").select("post_id, like_count").in("post_id", postIds),
    currentUserId
      ? db.from("post_likes").select("post_id").eq("user_id", currentUserId).in("post_id", postIds)
      : Promise.resolve({ data: [] }),
  ]);
  const countFor = {};
  for (const row of counts.data || []) countFor[row.post_id] = row.like_count;
  const likedByMe = new Set((mine.data || []).map((row) => row.post_id));
  for (const id of postIds) {
    document.querySelectorAll('.like-button[data-post-id="' + id + '"]').forEach(function (button) {
      button.dataset.count = String(countFor[id] || 0);
      button.setAttribute("aria-pressed", likedByMe.has(id) ? "true" : "false");
      updateLikeLabel(button);
    });
  }
}

async function togglePostLike(button) {
  if (!currentUserId) {
    rememberReturnPage(window.location.href);
    window.location.href = "login.html";
    return;
  }
  const postId = Number(button.dataset.postId);
  const wasLiked = button.getAttribute("aria-pressed") === "true";
  const before = Number(button.dataset.count);
  button.disabled = true;
  button.setAttribute("aria-pressed", wasLiked ? "false" : "true");
  button.dataset.count = String(Math.max(0, before + (wasLiked ? -1 : 1)));
  updateLikeLabel(button);
  const { error } = wasLiked
    ? await db.from("post_likes").delete().eq("user_id", currentUserId).eq("post_id", postId)
    : await db.from("post_likes").insert({ user_id: currentUserId, post_id: postId });
  button.disabled = false;
  if (error && error.code !== "23505") {
    button.setAttribute("aria-pressed", wasLiked ? "true" : "false");
    button.dataset.count = String(before);
    updateLikeLabel(button);
    window.alert(friendlyError(error, "Couldn't save your like. "));
  }
}


// ---------- Post cards ----------

function makeBookChip(book) {
  const link = el("a", "post-book");
  link.href = bookLink(book.external_id);
  link.appendChild(makeCover(book, "cover-tiny"));
  const text = el("span", "post-book-text");
  text.appendChild(el("span", "post-book-title", book.title));
  if (book.author) text.appendChild(el("span", "muted", book.author));
  link.appendChild(text);
  return link;
}

function makePostCard(post) {
  const card = el("article", "post-card");
  card.dataset.postId = post.id;
  const person = post.profiles || { username: "someone" };

  const top = el("div", "post-top");
  const who = el("a", "log-user");
  who.href = profileLink(person.username);
  who.appendChild(makeAvatar(person, "avatar-small"));
  who.appendChild(el("span", "", "@" + person.username));
  top.appendChild(who);
  const time = el("a", "muted post-time", ago(post.created_at)); // the post's own page
  time.href = "post.html?id=" + post.id;
  top.appendChild(time);
  card.appendChild(top);

  if (post.weekly_prompts) {
    const prompt = el("a", "post-prompt", "Answering: " + post.weekly_prompts.question);
    prompt.href = "prompt.html?id=" + post.weekly_prompts.id;
    card.appendChild(prompt);
  }

  card.appendChild(el("p", "post-text", post.body));

  if (post.image_url) {
    const picture = document.createElement("img");
    picture.className = "post-picture";
    picture.src = post.image_url;
    picture.alt = "Picture shared by @" + person.username;
    picture.loading = "lazy";
    picture.decoding = "async";
    card.appendChild(picture);
  }
  if (post.books) card.appendChild(makeBookChip(post.books));

  const actions = el("p", "log-actions");
  actions.appendChild(makePostLikeButton(post));
  const comments = makeCommentArea("post", post.id);
  actions.appendChild(comments.button);
  if (currentUserId && (post.user_id === currentUserId || currentIsAdmin)) {
    actions.appendChild(makeLinkButton("Delete", async function () {
      if (!window.confirm("Delete this post?")) return;
      const { error } = await db.from("posts").delete().eq("id", post.id);
      if (error) return window.alert(friendlyError(error, "Couldn't delete it. "));
      // Its picture goes too (the admin rule allows it for admins).
      const path = post.image_url && post.image_url.split("/post-images/")[1];
      if (path) await db.storage.from("post-images").remove([path]);
      card.remove();
    }));
  } else if (currentUserId) {
    const report = makeLinkButton("Report", () => sendContentReport("post", post.id, report));
    actions.appendChild(report);
  }
  card.appendChild(actions);
  card.appendChild(comments.thread);
  return card;
}


// ---------- Pick a book (Open Library search) ----------

// A search box with up to 6 results; clicking one calls onPick(book)
// with { externalId, title, author, coverUrl, isbns }.
function makeBookPicker(onPick) {
  const box = el("div", "book-picker");
  const input = el("input", "book-picker-input");
  input.enterKeyHint = "search";
  input.type = "search";
  input.placeholder = "Search for a book";
  input.setAttribute("aria-label", "Search for a book to add");
  const results = el("div", "book-picker-results");
  box.append(input, results);
  let timer = null;
  let searchNumber = 0;

  input.addEventListener("input", function () {
    clearTimeout(timer);
    const words = input.value.trim();
    results.textContent = "";
    if (words.length < 2) return;
    timer = setTimeout(async function () {
      const mine = ++searchNumber;
      results.textContent = "";
      results.appendChild(el("p", "muted", "Searching..."));
      try {
        const books = (await searchBooks(words)).slice(0, 6);
        if (mine !== searchNumber) return;
        results.textContent = "";
        if (books.length === 0) results.appendChild(el("p", "muted", "No books found."));
        for (const book of books) {
          const option = el("button", "book-picker-option");
          option.type = "button";
          option.appendChild(makeCover({ title: book.title, author: book.author, cover_url: book.coverUrl, isbns: book.isbns }, "cover-tiny"));
          const text = el("span", "post-book-text");
          text.appendChild(el("span", "post-book-title", book.title));
          if (book.author) text.appendChild(el("span", "muted", book.author));
          option.appendChild(text);
          option.addEventListener("click", function () {
            results.textContent = "";
            input.value = "";
            onPick(book);
          });
          results.appendChild(option);
        }
      } catch (error) {
        if (mine === searchNumber) {
          results.textContent = "";
          results.appendChild(el("p", "hint hint-error", friendlyError(error)));
        }
      }
    }, 300);
  });
  return { element: box, input: input };
}

// Turns a picked search result into a saved book (our books table) and
// gives back its row, saving it the first time like logging does.
async function savePickedBook(picked) {
  const existing = await getSavedBook(picked.externalId);
  if (existing) return existing;
  const details = await fetchBookDetails(picked.externalId); // js/sources.js
  if (!details) throw new Error("We couldn't find that book.");
  return saveBookIfNeeded(details);
}


// ---------- Pictures for posts ----------

async function uploadPostPicture(file) {
  const blob = await shrinkPicture(file, POST_PICTURE_SIZE); // js/auth.js
  const path = currentUserId + "/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + ".jpg";
  const { error } = await db.storage.from("post-images").upload(path, blob, { contentType: "image/jpeg" });
  if (error) throw error;
  return { path: path, url: db.storage.from("post-images").getPublicUrl(path).data.publicUrl };
}


// ---------- The "Share a thought" box ----------

// options: { promptId, placeholder, onPosted(post) }
function makePostComposer(options) {
  const settings = options || {};
  const form = el("form", "card composer");
  const box = el("textarea", "composer-input");
  box.rows = 3;
  box.maxLength = POST_MAX;
  box.placeholder = settings.placeholder || "Share a thought about what you're reading...";
  box.setAttribute("aria-label", settings.placeholder || "Share a thought");
  form.appendChild(box);

  // What's attached
  const attached = el("div", "composer-attached");
  form.appendChild(attached);
  let pickedBook = null;
  let pickedFile = null;

  function showAttached() {
    attached.textContent = "";
    if (pickedBook) {
      const chip = el("div", "composer-chip");
      chip.appendChild(makeCover({ title: pickedBook.title, author: pickedBook.author, cover_url: pickedBook.coverUrl }, "cover-tiny"));
      chip.appendChild(el("span", "post-book-title", pickedBook.title));
      chip.appendChild(makeLinkButton("×", () => { pickedBook = null; showAttached(); }, "composer-remove"));
      chip.lastChild.setAttribute("aria-label", "Remove the book");
      attached.appendChild(chip);
    }
    if (pickedFile) {
      const chip = el("div", "composer-chip");
      const preview = document.createElement("img");
      preview.className = "composer-preview";
      preview.alt = "";
      preview.src = URL.createObjectURL(pickedFile);
      chip.append(preview, el("span", "muted", pickedFile.name));
      chip.appendChild(makeLinkButton("×", () => { pickedFile = null; showAttached(); }, "composer-remove"));
      chip.lastChild.setAttribute("aria-label", "Remove the picture");
      attached.appendChild(chip);
    }
  }

  // Book picker (opens on demand)
  const picker = makeBookPicker(function (book) {
    pickedBook = book;
    pickerArea.hidden = true;
    showAttached();
  });
  const pickerArea = el("div", "composer-picker");
  pickerArea.hidden = true;
  pickerArea.appendChild(picker.element);
  form.appendChild(pickerArea);

  // Picture input (hidden, opened by the button)
  const fileInput = el("input", "");
  fileInput.type = "file";
  fileInput.accept = "image/jpeg,image/png,image/webp";
  fileInput.hidden = true;
  form.appendChild(fileInput);

  const message = el("p", "hint hint-error");
  message.hidden = true;
  function problem(text) {
    message.textContent = text;
    message.hidden = !text;
  }

  fileInput.addEventListener("change", function () {
    const file = fileInput.files[0];
    fileInput.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return problem("Pictures must be JPG, PNG or WEBP.");
    if (file.size > POST_PICTURE_MAX_BYTES) return problem("That picture is bigger than 5 MB.");
    problem("");
    pickedFile = file;
    showAttached();
  });

  const bottom = el("div", "composer-bottom");
  const tools = el("div", "composer-tools");
  tools.appendChild(makeLinkButton("+ Book", function () {
    pickerArea.hidden = !pickerArea.hidden;
    if (!pickerArea.hidden) picker.input.focus();
  }));
  tools.appendChild(makeLinkButton("+ Picture", () => fileInput.click()));
  const counter = el("span", "hint", "0 / " + POST_MAX);
  box.addEventListener("input", () => (counter.textContent = box.value.length + " / " + POST_MAX));
  const send = el("button", "button", "Post");
  send.type = "submit";
  const right = el("div", "composer-send");
  right.append(counter, send);
  bottom.append(tools, right);
  form.append(bottom, message);

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    const text = box.value.trim();
    if (!text) return problem("Write something first.");
    send.disabled = true;
    send.textContent = "Posting...";
    problem("");
    let uploaded = null;
    try {
      const row = { user_id: currentUserId, body: text };
      if (settings.promptId) row.prompt_id = settings.promptId;
      if (pickedBook) row.book_id = (await savePickedBook(pickedBook)).id;
      if (pickedFile) {
        uploaded = await uploadPostPicture(pickedFile);
        row.image_url = uploaded.url;
      }
      const { data, error } = await db.from("posts").insert(row).select(POST_FIELDS).single();
      if (error) throw error;
      box.value = "";
      counter.textContent = "0 / " + POST_MAX;
      pickedBook = null;
      pickedFile = null;
      showAttached();
      if (settings.onPosted) settings.onPosted(data);
    } catch (error) {
      if (uploaded) db.storage.from("post-images").remove([uploaded.path]); // don't leave it behind
      problem(friendlyError(error, "Couldn't post it. "));
    } finally {
      send.disabled = false;
      send.textContent = "Post";
    }
  });
  return form;
}


// ---------- A mixed feed of logs and posts, newest first ----------
//
// sources: list of functions (before, count) => query for logs or posts
// older than `before` (an ISO time or null). Each source keeps its own
// place, and every page takes the newest 20 across all of them, so
// pages never repeat or skip.
function showMixedFeed(container, sources, emptyText, cardOptions) {
  const pageSize = PAGE_SIZE;
  const state = sources.map((source) => ({ fetch: source.fetch, kind: source.kind, buffer: [], before: null, finished: false }));
  const moreButton = el("button", "button button-secondary load-more", "Load more");
  moreButton.type = "button";
  let shown = 0;

  async function topUp(source) {
    if (source.finished || source.buffer.length >= pageSize) return;
    const { data, error } = await source.fetch(source.before, pageSize);
    if (error) throw error;
    if (data.length < pageSize) source.finished = true;
    if (data.length) source.before = data[data.length - 1].created_at;
    source.buffer.push(...data.map((row) => ({ kind: source.kind, row: row })));
  }

  async function nextPage() {
    moreButton.disabled = true;
    moreButton.textContent = "Loading...";
    try {
      await Promise.all(state.map(topUp));
    } catch (error) {
      moreButton.remove();
      if (shown === 0) container.textContent = "";
      container.appendChild(el("p", "status status-error", friendlyError(error, "Couldn't load the feed. ")));
      return;
    }
    const all = state.flatMap((source) => source.buffer.map((item) => Object.assign(item, { source: source })));
    all.sort((a, b) => (a.row.created_at < b.row.created_at ? 1 : -1));
    const page = all.slice(0, pageSize);
    for (const item of page) item.source.buffer.splice(item.source.buffer.indexOf(item), 1);

    moreButton.remove();
    if (shown === 0) container.textContent = "";
    if (shown === 0 && page.length === 0) {
      container.appendChild(makeEmptyState(emptyText));
      return;
    }
    const logIds = [];
    const postIds = [];
    for (const item of page) {
      if (item.kind === "log") {
        container.appendChild(makeLogCard(item.row, cardOptions));
        logIds.push(item.row.id);
      } else {
        container.appendChild(makePostCard(item.row));
        postIds.push(item.row.id);
      }
    }
    shown += page.length;
    fillLikes(logIds);
    fillPostLikes(postIds);
    fillCommentCounts("log", logIds);
    fillCommentCounts("post", postIds);
    const more = state.some((source) => source.buffer.length > 0 || !source.finished);
    if (more) {
      moreButton.disabled = false;
      moreButton.textContent = "Load more";
      container.appendChild(moreButton);
    }
  }

  moreButton.addEventListener("click", nextPage);
  return nextPage();
}

// A friendly empty message in the cosy style.
function makeEmptyState(text) {
  const box = el("div", "empty-note");
  box.appendChild(el("span", "empty-note-icon", "❧"));
  box.appendChild(el("p", "", text));
  return box;
}


// ---------- Book of the week and the weekly question ----------
// Both are chosen by the admin on the admin page; the newest one is
// "this week's". Book of the week has its own comment thread ("pick").

const PICK_FIELDS = "id, note, created_at, books!book_picks_book_id_fkey(id, external_id, title, author, cover_url, isbn)";
const PROMPT_FIELDS = "id, question, created_at";

async function fetchLatestPick() {
  const { data, error } = await db.from("book_picks").select(PICK_FIELDS)
    .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(1);
  if (error) throw error;
  return data[0] || null;
}

async function fetchLatestPrompt() {
  const { data, error } = await db.from("weekly_prompts").select(PROMPT_FIELDS)
    .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(1);
  if (error) throw error;
  return data[0] || null;
}

// "Week of 12 Oct" (or "12 Oct 2025" for older years)
function weekOf(dateText) {
  const date = new Date(dateText);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(undefined, sameYear ? { day: "numeric", month: "long" } : { day: "numeric", month: "long", year: "numeric" });
}

// A Book of the week: cover, title, the admin's note, a link to the
// book and "Join the discussion" (opens the comment thread).
// options: { label, open }
function makePickCard(pick, options) {
  const settings = options || {};
  const book = pick.books;
  const card = el("article", "pick-card");
  card.dataset.pickId = pick.id;

  const coverLink = el("a", "pick-cover");
  coverLink.href = bookLink(book.external_id);
  coverLink.setAttribute("aria-hidden", "true");
  coverLink.tabIndex = -1;
  coverLink.appendChild(makeCover(book, "cover-medium"));
  card.appendChild(coverLink);

  const text = el("div", "pick-text");
  const head = el("div", "pick-head"); // beside the cover, even on phones
  head.appendChild(el("p", "pick-label", (settings.label || "Book of the week") + " · " + weekOf(pick.created_at)));
  const title = el("h2", "pick-title");
  const titleLink = el("a", "", book.title);
  titleLink.href = bookLink(book.external_id);
  title.appendChild(titleLink);
  head.appendChild(title);
  if (book.author) head.appendChild(el("p", "muted pick-author", "by " + book.author));
  text.appendChild(head);
  if (pick.note) text.appendChild(el("p", "pick-note", pick.note));

  const comments = makeCommentArea("pick", pick.id, { open: settings.open });
  const buttons = el("div", "pick-buttons");
  const see = el("a", "button", "See the book");
  see.href = bookLink(book.external_id);
  const join = el("button", "button button-secondary", "Join the discussion");
  join.type = "button";
  join.addEventListener("click", function () {
    if (comments.thread.hidden) comments.button.click();
    // Jump to the comment box once it's there.
    setTimeout(function () {
      const box = comments.thread.querySelector("textarea, a");
      if (box) box.focus();
    }, 300);
  });
  buttons.append(see, join, comments.button);
  text.appendChild(buttons);
  card.appendChild(text);
  card.appendChild(comments.thread);
  return card;
}

// This week's question with an answer box (logged in).
// options: { onPosted(post), showLink }
function makePromptCard(prompt, options) {
  const settings = options || {};
  const box = el("section", "prompt-card");
  box.appendChild(el("p", "pick-label", "This week's question · " + weekOf(prompt.created_at)));
  box.appendChild(el("h2", "prompt-question", prompt.question));
  if (currentUserId) {
    box.appendChild(makePostComposer({
      promptId: prompt.id,
      placeholder: "Your answer...",
      onPosted: settings.onPosted,
    }));
  } else {
    const login = el("p", "muted");
    const link = el("a", "", "Log in");
    link.href = "login.html";
    login.append(link, " to answer.");
    box.appendChild(login);
  }
  if (settings.showLink !== false) {
    const all = el("a", "see-all prompt-link", "See all answers");
    all.href = "prompt.html?id=" + prompt.id;
    box.appendChild(all);
  }
  return box;
}
