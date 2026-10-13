// ------------------------------------------------------------
// Admin page: see reports, remove reviews or users, or dismiss.
// Also: reported posts and comments, choosing the Book of the week and
// the weekly question, and the feedback people sent.
// ------------------------------------------------------------
// Only admins can open it (the `admins` table). The database checks
// this too, so nobody else can read reports even if they open this page.
// ------------------------------------------------------------

const reportsList = document.getElementById("reports");
const adminMessage = document.getElementById("admin-message");

// Each report, with the reporter, the reported profile, and the
// reported review (with its author and book) joined in. Two links go
// from reports to profiles, so we name which one each time.
const REPORT_FIELDS =
  "id, reason, created_at, log_id, reported_user_id, " +
  "reporter:profiles!reports_reporter_id_fkey(username), " +
  "reported:profiles!reports_reported_user_id_fkey(id, username, bio, avatar_url), " +
  "logs(id, rating, review, user_id, profiles!logs_user_id_fkey(id, username), books(external_id, title))";

function userLink(username) {
  const link = el("a", "", "@" + username);
  link.href = profileLink(username);
  return link;
}

function actionButton(text, className, onClick) {
  const button = el("button", "button " + className, text);
  button.type = "button";
  button.addEventListener("click", onClick);
  return button;
}


// ---------- Actions ----------

async function removeReview(report) {
  if (!window.confirm("Remove this review for good?")) return;
  const { error } = await db.from("logs").delete().eq("id", report.log_id);
  finish(error, "Review removed.");
}

async function removeUser(userId, username) {
  if (!window.confirm("Remove @" + username + " and everything they posted? This can't be undone.")) return;
  // Delete the login (supabase/step11-admin-remove-user.sql). Their
  // profile, logs, follows, shelves and reports go with it.
  const { error } = await db.rpc("admin_delete_user", { target: userId });
  if (error && error.code === "PGRST202") {
    finish({ message: "Removing users isn't switched on yet: run supabase/step11-admin-remove-user.sql in the Supabase SQL Editor." });
    return;
  }
  if (!error) {
    await db.storage.from("avatars").remove([userId + "/avatar.jpg"]);
    await removePostPictures(userId).catch(() => {});
  }
  finish(error, "@" + username + " removed.");
}

async function dismiss(report) {
  const { error } = await db.from("reports").update({ status: "dismissed" }).eq("id", report.id);
  finish(error, "Report dismissed.");
}

// After an action: show what happened and reload the list.
async function finish(error, doneText) {
  if (error) {
    showStatus(adminMessage, "error", friendlyError(error, "That didn't work. "));
    return;
  }
  showStatus(adminMessage, "ok", doneText);
  await loadReports();
}


// ---------- The list ----------

function makeReportCard(report) {
  const card = el("article", "card report-card");

  // Who reported what, and when
  const top = el("p", "muted");
  top.append(
    report.log_id ? "Review reported by " : "Profile reported by ",
    report.reporter ? userLink(report.reporter.username) : "a deleted user",
    " on " + new Date(report.created_at).toLocaleString()
  );
  card.appendChild(top);
  card.appendChild(el("p", "report-reason", report.reason ? "“" + report.reason + "”" : "No reason given."));

  const target = el("div", "report-target");
  const buttons = el("div", "report-buttons");

  if (report.logs) {
    // A review
    const log = report.logs;
    const about = el("p", "");
    const book = el("a", "", log.books.title);
    book.href = bookLink(log.books.external_id);
    about.append(userLink(log.profiles.username), " on ", book, log.rating ? "  " + starsText(log.rating) : "");
    target.append(about, el("p", "log-review", log.review || "(no review text)"));
    buttons.append(
      actionButton("Remove review", "button-danger", () => removeReview(report)),
      actionButton("Remove user", "button-secondary", () => removeUser(log.profiles.id, log.profiles.username))
    );
  } else if (report.reported) {
    // A profile
    const person = report.reported;
    const about = el("p", "report-person");
    about.append(makeAvatar(person, "avatar-small"), userLink(person.username));
    target.append(about, el("p", "log-review", person.bio || "(no bio)"));
    buttons.append(
      actionButton("Remove user", "button-danger", () => removeUser(person.id, person.username))
    );
  }

  buttons.appendChild(actionButton("Dismiss", "button-secondary", () => dismiss(report)));
  card.append(target, buttons);
  return card;
}

async function loadReports() {
  const { data: reports, error } = await db
    .from("reports")
    .select(REPORT_FIELDS)
    .eq("status", "open")
    .order("created_at", { ascending: false });

  reportsList.textContent = "";
  if (error) {
    reportsList.appendChild(el("p", "status status-error", friendlyError(error, "Could not load reports. ")));
    return;
  }
  if (reports.length === 0) {
    reportsList.appendChild(el("p", "muted", "No open reports. All quiet."));
    return;
  }
  for (const report of reports) reportsList.appendChild(makeReportCard(report));
}


// ---------- Feedback ----------

const feedbackList = document.getElementById("feedback-list");

async function deleteFeedback(id) {
  if (!window.confirm("Delete this message?")) return;
  const { error } = await db.from("feedback").delete().eq("id", id);
  if (error) {
    showStatus(adminMessage, "error", friendlyError(error, "That didn't work. "));
    return;
  }
  showStatus(adminMessage, "ok", "Message deleted.");
  await loadFeedback();
}

function makeFeedbackCard(item) {
  const card = el("article", "card report-card");
  const top = el("p", "muted");
  top.append(
    "From ",
    item.profiles ? userLink(item.profiles.username) : "a deleted user",
    " on " + new Date(item.created_at).toLocaleString(),
    item.page ? " \u00b7 sent from " + item.page : ""
  );
  card.append(top, el("p", "log-review", item.message));
  const buttons = el("div", "report-buttons");
  buttons.appendChild(actionButton("Delete", "button-secondary", () => deleteFeedback(item.id)));
  card.appendChild(buttons);
  return card;
}

async function loadFeedback() {
  const { data, error } = await db
    .from("feedback")
    .select("id, message, page, created_at, profiles(username)")
    .order("created_at", { ascending: false })
    .limit(100);
  feedbackList.textContent = "";
  if (error) {
    feedbackList.appendChild(el("p", "status status-error", friendlyError(error, "Could not load feedback. ")));
    return;
  }
  if (data.length === 0) {
    feedbackList.appendChild(el("p", "muted", "No feedback yet."));
    return;
  }
  for (const item of data) feedbackList.appendChild(makeFeedbackCard(item));
}


// ---------- Reported posts and comments ----------

const contentReportsList = document.getElementById("content-reports");
const CONTENT_REPORT_FIELDS =
  "id, reason, created_at, post_id, comment_id, " +
  "reporter:profiles!content_reports_reporter_id_fkey(username), " +
  "posts(id, body, image_url, user_id, profiles!posts_user_id_fkey(id, username)), " +
  "comments(id, body, user_id, post_id, log_id, pick_id, profiles!comments_user_id_fkey(id, username))";

async function contentAction(error, doneText) {
  if (error) {
    showStatus(adminMessage, "error", friendlyError(error, "That didn't work. "));
    return;
  }
  showStatus(adminMessage, "ok", doneText);
  await loadContentReports();
}

async function removePost(post) {
  if (!window.confirm("Remove this post for good?")) return;
  const { error } = await db.from("posts").delete().eq("id", post.id);
  const path = !error && post.image_url && post.image_url.split("/post-images/")[1];
  if (path) await db.storage.from("post-images").remove([path]);
  contentAction(error, "Post removed.");
}

async function removeComment(comment) {
  if (!window.confirm("Remove this comment for good?")) return;
  const { error } = await db.from("comments").delete().eq("id", comment.id);
  contentAction(error, "Comment removed.");
}

async function dismissContent(report) {
  const { error } = await db.from("content_reports").update({ status: "dismissed" }).eq("id", report.id);
  contentAction(error, "Report dismissed.");
}

function makeContentReportCard(report) {
  const card = el("article", "card report-card");
  const top = el("p", "muted");
  top.append(
    report.post_id ? "Post reported by " : "Comment reported by ",
    report.reporter ? userLink(report.reporter.username) : "a deleted user",
    " on " + new Date(report.created_at).toLocaleString()
  );
  card.appendChild(top);
  card.appendChild(el("p", "report-reason", report.reason ? "“" + report.reason + "”" : "No reason given."));

  const target = el("div", "report-target");
  const buttons = el("div", "report-buttons");
  const item = report.posts || report.comments;
  if (item) {
    const author = item.profiles;
    const about = el("p", "");
    about.append(author ? userLink(author.username) : "someone", report.posts ? " posted:" : " commented:");
    target.append(about, el("p", "log-review", item.body));
    if (report.posts && item.image_url) {
      const picture = document.createElement("img");
      picture.className = "post-picture";
      picture.src = item.image_url;
      picture.alt = "The post's picture";
      target.appendChild(picture);
    }
    if (report.posts) {
      const open = el("a", "", "Open the post");
      open.href = "post.html?id=" + item.id;
      target.appendChild(el("p", "")).appendChild(open);
    } else if (item.post_id) {
      const open = el("a", "", "Open the post it's on");
      open.href = "post.html?id=" + item.post_id;
      target.appendChild(el("p", "")).appendChild(open);
    }
    buttons.appendChild(actionButton(report.posts ? "Remove post" : "Remove comment", "button-danger",
      () => (report.posts ? removePost(item) : removeComment(item))));
    if (author) buttons.appendChild(actionButton("Remove user", "button-secondary", () => removeUser(author.id, author.username)));
  } else {
    target.appendChild(el("p", "muted", "Already removed."));
  }
  buttons.appendChild(actionButton("Dismiss", "button-secondary", () => dismissContent(report)));
  card.append(target, buttons);
  return card;
}

async function loadContentReports() {
  const { data, error } = await db
    .from("content_reports")
    .select(CONTENT_REPORT_FIELDS)
    .eq("status", "open")
    .order("created_at", { ascending: false });
  contentReportsList.textContent = "";
  if (error) {
    contentReportsList.appendChild(el("p", "status status-error", friendlyError(error, "Could not load reports. ")));
    return;
  }
  if (data.length === 0) {
    contentReportsList.appendChild(el("p", "muted", "No reported posts or comments."));
    return;
  }
  for (const report of data) contentReportsList.appendChild(makeContentReportCard(report));
}


// ---------- Book of the week ----------

const pickList = document.getElementById("pick-list");
let chosenBook = null;

async function loadPicks() {
  const { data, error } = await db.from("book_picks").select(PICK_FIELDS)
    .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(10);
  pickList.textContent = "";
  if (error) {
    pickList.appendChild(el("p", "status status-error", friendlyError(error, "Could not load the picks. ")));
    return;
  }
  data.forEach(function (pick, index) {
    const row = el("div", "admin-row");
    const text = el("p", "");
    const link = el("a", "", pick.books ? pick.books.title : "(book removed)");
    if (pick.books) link.href = bookLink(pick.books.external_id);
    text.append(index === 0 ? "Now: " : "", link, el("span", "muted", " · " + weekOf(pick.created_at)));
    row.append(text, actionButton("Delete", "button-secondary", async function () {
      if (!window.confirm("Delete this pick and its discussion?")) return;
      const { error } = await db.from("book_picks").delete().eq("id", pick.id);
      if (error) return showStatus(adminMessage, "error", friendlyError(error, "That didn't work. "));
      showStatus(adminMessage, "ok", "Pick deleted.");
      loadPicks();
    }));
    pickList.appendChild(row);
  });
}

function setUpPickForm() {
  const chosen = document.getElementById("pick-chosen");
  const picker = makeBookPicker(function (book) {
    chosenBook = book;
    chosen.textContent = "Chosen: " + book.title + (book.author ? " by " + book.author : "");
  });
  document.getElementById("pick-picker").appendChild(picker.element);

  const form = document.getElementById("pick-form");
  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (!chosenBook) return showStatus(adminMessage, "error", "Search for a book and choose it first.");
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      const book = await savePickedBook(chosenBook);
      const note = document.getElementById("pick-note").value.trim();
      const { error } = await db.from("book_picks").insert({ book_id: book.id, note: note || null });
      if (error) throw error;
      showStatus(adminMessage, "ok", book.title + " is now the Book of the week.");
      chosenBook = null;
      chosen.textContent = "No book chosen yet.";
      document.getElementById("pick-note").value = "";
      loadPicks();
    } catch (error) {
      showStatus(adminMessage, "error", friendlyError(error, "That didn't work. "));
    } finally {
      button.disabled = false;
    }
  });
}


// ---------- Question of the week ----------

const promptList = document.getElementById("prompt-list");

async function loadPrompts() {
  const { data, error } = await db.from("weekly_prompts").select(PROMPT_FIELDS)
    .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(10);
  promptList.textContent = "";
  if (error) {
    promptList.appendChild(el("p", "status status-error", friendlyError(error, "Could not load the questions. ")));
    return;
  }
  data.forEach(function (prompt, index) {
    const row = el("div", "admin-row");
    const text = el("p", "");
    const link = el("a", "", prompt.question);
    link.href = "prompt.html?id=" + prompt.id;
    text.append(index === 0 ? "Now: " : "", link, el("span", "muted", " · " + weekOf(prompt.created_at)));
    row.append(text, actionButton("Delete", "button-secondary", async function () {
      if (!window.confirm("Delete this question? Its answers stay as normal posts.")) return;
      const { error } = await db.from("weekly_prompts").delete().eq("id", prompt.id);
      if (error) return showStatus(adminMessage, "error", friendlyError(error, "That didn't work. "));
      showStatus(adminMessage, "ok", "Question deleted.");
      loadPrompts();
    }));
    promptList.appendChild(row);
  });
}

function setUpPromptForm() {
  const form = document.getElementById("prompt-form");
  const input = document.getElementById("prompt-question");
  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    const question = input.value.trim();
    if (question.length < 3) return showStatus(adminMessage, "error", "The question needs at least 3 characters.");
    const { error } = await db.from("weekly_prompts").insert({ question: question });
    if (error) return showStatus(adminMessage, "error", friendlyError(error, "That didn't work. "));
    showStatus(adminMessage, "ok", "This week's question is set.");
    input.value = "";
    loadPrompts();
  });
}


// ---------- Start ----------

(async function () {
  const { user } = await authReady;
  const status = document.getElementById("admin-status");
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  if (!currentIsAdmin) {
    status.textContent = "This page is only for the site admin.";
    return;
  }
  status.hidden = true;
  document.getElementById("admin-area").hidden = false;
  setUpPickForm();
  setUpPromptForm();
  await Promise.all([loadReports(), loadContentReports(), loadPicks(), loadPrompts(), loadFeedback()]);
})();
