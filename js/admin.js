// ------------------------------------------------------------
// Admin page: see reports, remove reviews or users, or dismiss.
// Also reads the feedback people sent (and can delete it).
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
  "logs(id, rating, review, user_id, profiles(id, username), books(external_id, title))";

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
  if (!error) await db.storage.from("avatars").remove([userId + "/avatar.jpg"]);
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
  await Promise.all([loadReports(), loadFeedback()]);
})();
