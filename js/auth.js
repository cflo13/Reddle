// ------------------------------------------------------------
// Shared login helpers, used by every page.
// ------------------------------------------------------------
// Load this file after js/supabase-client.js and before the page's own script.
//
// What it does:
//   1. Fills in the top-right of the header: "Log in / Sign up" when logged
//      out, or your small picture + @username + "Log out" when logged in.
//   2. Makes sure every logged-in user has a profile (a username). If not,
//      it sends them to choose-username.html.
//   3. Gives page scripts some helpers (username checks, avatars).
//
// Page scripts wait for the header to be ready like this:
//   const { user, profile } = await authReady;
// `user` is the logged-in account (or null), `profile` is their row in the
// profiles table (or null).
// ------------------------------------------------------------


// ---------- Username rules ----------

// Lowercase letters, numbers and underscores, 3 to 20 characters.
// The same rule is also enforced by the database (supabase/schema.sql).
const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

// Returns an error message, or an empty string if the username looks fine.
function checkUsernameFormat(username) {
  if (username.length < 3) return "Usernames need at least 3 characters.";
  if (username.length > 20) return "Usernames can have at most 20 characters.";
  if (!USERNAME_PATTERN.test(username)) {
    return "Use only lowercase letters, numbers and underscores (_).";
  }
  return "";
}

// Asks the database whether someone already has this username.
async function isUsernameTaken(username) {
  const { data, error } = await db
    .from("profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle(); // gives null instead of an error when nobody has it
  if (error) throw error;
  return data !== null;
}


// ---------- Small helper for building HTML safely ----------

// Creates an element, for example el("p", "muted", "Hello").
// Text always goes in with textContent, which never runs code, so a review
// containing "<script>" just shows up as text.
function el(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined && text !== null) element.textContent = text;
  return element;
}


// ---------- Messages ----------

// Shows a message in a status box (a <p class="status"> element).
// kind is "ok", "error" or "waiting"; it picks the colour in style.css.
function showStatus(element, kind, text) {
  element.className = "status status-" + kind;
  element.textContent = text;
  element.hidden = false;
}

// Turns an error into a message people can understand. `start` is put
// in front, for example "Couldn't save your log. ".
function friendlyError(error, start) {
  const text = (error && error.message) || String(error);
  const code = error && error.code;
  let plain;

  if (/Failed to fetch|NetworkError|Load failed|network/i.test(text)) {
    plain = "We couldn't reach Reddle. Check your internet connection and try again.";
  } else if (/Invalid login credentials/i.test(text)) {
    plain = "That email and password don't match. Try again, or use \u201cForgot password?\u201d.";
  } else if (/Email not confirmed/i.test(text)) {
    plain = "Please confirm your email first: click the link in the email we sent you.";
  } else if (/already registered|already been registered/i.test(text)) {
    plain = "There's already an account with that email. Try logging in instead.";
  } else if (/JWT expired|session.*(missing|expired)|not logged in/i.test(text)) {
    plain = "Your login has expired. Please log in again.";
  } else if (code === "23514") {
    plain = "That's too long or not allowed here.";
  } else if (code === "23505") {
    plain = "That already exists.";
  } else if (code === "42501" || /row-level security|permission denied/i.test(text)) {
    plain = "You're not allowed to do that. Try logging out and in again.";
  } else {
    // Supabase's own messages are usually clear enough on their own.
    plain = text.endsWith(".") ? text : text + ".";
  }
  return (start || "") + plain;
}

// The address of a page on this site, for links in emails.
// Works both on the live site and when testing from a file.
function pageAddress(fileName) {
  // document.baseURI is the site's main folder (see the <base> tag), even
  // on clean addresses like /u/maria.
  return new URL(fileName, document.baseURI).href;
}


// ---------- Clean addresses ----------
//
// Profiles live at u/USERNAME and books at book/OL45804W. GitHub Pages
// has no such files, so it shows 404.html, which loads the real page
// (js/router.js). Old links (profile.html?u=..., book.html?id=...) still
// work. Every page has <base href="./"> (404.html sets the main folder),
// so links like "u/maria" always start from the site's main folder.

// Clean addresses need a web server; opened as files we use the old style.
const cleanAddresses = window.location.protocol !== "file:";

// The page's main value, from ?u= / ?id= or from a clean address.
// name is "u" (profile) or "id" (book).
function pageParam(name) {
  const fromQuery = new URLSearchParams(window.location.search).get(name);
  if (fromQuery) return fromQuery;
  const parts = window.location.pathname.split("/");
  const at = parts.lastIndexOf(name === "id" ? "book" : "u");
  return at >= 0 && parts[at + 1] ? decodeURIComponent(parts[at + 1]) : null;
}

// Opened with an old-style link? Show the clean address instead, without
// reloading. `cleanLink` is relative, like "u/maria".
function useCleanAddress(cleanLink) {
  const address = new URL(cleanLink, document.baseURI).href;
  // The share-preview address too (read by apps that run the page's code).
  const ogUrl = document.querySelector('meta[property="og:url"]');
  if (ogUrl && cleanAddresses) ogUrl.content = address;
  if (!cleanAddresses || !window.location.pathname.endsWith(".html")) return;
  history.replaceState(null, "", address);
}


// ---------- Profiles ----------

// Gets the logged-in account, or null if nobody is logged in.
async function getCurrentUser() {
  const { data } = await db.auth.getSession();
  return data.session ? data.session.user : null;
}

// Gets one profile row by user id, or null if it doesn't exist.
async function getProfileById(userId) {
  const { data, error } = await db
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Creates the profile row for a new user.
// Returns an error message, or an empty string when it worked.
async function createProfile(userId, username) {
  const { error } = await db
    .from("profiles")
    .insert({ id: userId, username: username });

  if (!error) return "";
  // 23505 is the database's code for "this value must be unique".
  if (error.code === "23505") return "Sorry, that username was just taken.";
  return friendlyError(error, "Couldn't save your username. ");
}

// Makes sure a logged-in user has a profile, and returns it.
// During email sign up we store the chosen username on the account
// ("user_metadata"), because when Supabase asks people to confirm their email
// we can't save the profile until they log in for the first time.
// Returns null if the user still needs to choose a username.
async function ensureProfile(user) {
  const existing = await getProfileById(user.id);
  if (existing) return existing;

  const wanted = user.user_metadata && user.user_metadata.username;
  if (wanted && checkUsernameFormat(wanted) === "") {
    const problem = await createProfile(user.id, wanted);
    if (problem === "") return await getProfileById(user.id);
  }
  return null;
}

// The link to someone's profile page.
function profileLink(username) {
  return cleanAddresses
    ? "u/" + encodeURIComponent(username)
    : "profile.html?u=" + encodeURIComponent(username);
}


// ---------- Avatars ----------

// Creates a round avatar for a profile. `sizeClass` is one of the
// avatar-small / avatar-large classes in style.css.
function makeAvatar(profile, sizeClass) {
  const avatar = document.createElement("span");
  avatar.className = "avatar " + sizeClass;
  fillAvatar(avatar, profile);
  return avatar;
}

// Puts the picture inside an avatar, or the default grey circle with the
// first letter of the username when there is no picture.
// Also used to swap in a new picture straight after an upload.
function fillAvatar(avatar, profile) {
  avatar.textContent = ""; // remove whatever was there before

  if (profile.avatar_url) {
    avatar.classList.remove("avatar-default");
    const img = document.createElement("img");
    img.src = profile.avatar_url;
    img.alt = "@" + profile.username;
    avatar.appendChild(img);
  } else {
    avatar.classList.add("avatar-default");
    avatar.textContent = profile.username.charAt(0).toUpperCase();
  }
}


// ---------- Google sign in ----------

// Sends the user to Google, which sends them back to our home page.
// `showMessage` is the page's own function for showing errors.
async function signInWithGoogle(showMessage) {
  // Google needs a real web address to send people back to, so this can't
  // work while the site is opened as a file from your computer.
  if (window.location.protocol === "file:") {
    showMessage(
      "error",
      "Google sign in only works once the site is online. Use email and password for now."
    );
    return;
  }

  const homePage = pageAddress("index.html");
  const { error } = await db.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: homePage },
  });
  if (error) showMessage("error", friendlyError(error));
  // If there was no error the browser is now on its way to Google.
  // When the user comes back, auth.js sees they have no username yet and
  // sends them to choose-username.html.
}


// ---------- Page-wide problems ----------

// Shows one red message at the top of the page (only the first one).
function showPageProblem(text) {
  if (document.getElementById("page-problem")) return;
  const main = document.querySelector("main");
  if (!main) return;
  const box = el("p", "status status-error page-problem", text + " ");
  box.id = "page-problem";
  const retry = el("button", "link-button", "Try again");
  retry.type = "button";
  retry.addEventListener("click", () => window.location.reload());
  box.appendChild(retry);
  main.prepend(box);
}

// Safety net: if something fails that the page didn't expect, tell the
// visitor instead of leaving a half-loaded page.
window.addEventListener("unhandledrejection", function (event) {
  console.error(event.reason);
  showPageProblem(friendlyError(event.reason, "Part of this page didn't load. "));
});


// ---------- Header ----------

// Pages where a user without a username may stay (everywhere else they get
// sent to choose-username.html).
function isOnPage(fileName) {
  return window.location.pathname.endsWith("/" + fileName);
}

async function logOut() {
  await db.auth.signOut();
  window.location.href = "index.html";
}

// Who is logged in, filled in by setupHeader below. Other files read
// these after `await authReady` (for example to show Report buttons).
let currentUserId = null;
let currentIsAdmin = false;

// Is the logged-in person an admin? (supabase/step10-reports-admin.sql)
async function checkAdmin(userId) {
  const { data } = await db.from("admins").select("user_id").eq("user_id", userId).maybeSingle();
  return data !== null && data !== undefined;
}


// ---------- Reporting ----------

// Sends a report about a review (kind "log", id = log id) or a profile
// (kind "user", id = user id). Asks for a reason first, then changes the
// button to "Reported". Only for logged-in people.
async function sendReport(kind, id, button) {
  const what = kind === "log" ? "review" : "profile";
  const reason = window.prompt(
    "Why are you reporting this " + what + "? (optional)\n" +
      "For example: spam, harassment, spoilers, offensive."
  );
  if (reason === null) return; // they pressed Cancel

  button.disabled = true;
  const report = { reason: reason.trim().slice(0, 500) || null };
  if (kind === "log") report.log_id = id;
  else report.reported_user_id = id;

  const { error } = await db.from("reports").insert(report);
  // 23505 = they already reported it, which is fine.
  if (error && error.code !== "23505") {
    button.disabled = false;
    window.alert(friendlyError(error, "Sorry, the report didn't go through. "));
    return;
  }
  button.textContent = "Reported";
  button.title = "Thanks. We'll take a look.";
}

// A small "Report" button. Returns null when it shouldn't show: logged
// out, or it's your own review / profile.
function makeReportButton(kind, id, ownerId) {
  if (!currentUserId || ownerId === currentUserId) return null;
  const button = el("button", "link-button report-button", "Report");
  button.type = "button";
  button.addEventListener("click", () => sendReport(kind, id, button));
  return button;
}


async function setupHeader() {
  const nav = document.getElementById("site-nav");

  // Couldn't connect (no internet, or js/config.js not filled in):
  // say so at the top of the page.
  if (!db) {
    showPageProblem(notConnectedText());
    return { user: null, profile: null };
  }

  const user = await getCurrentUser();

  if (!user) {
    nav.innerHTML =
      '<a href="login.html">Log in</a>' +
      '<a class="button" href="signup.html">Sign up</a>';
    return { user: null, profile: null };
  }

  const profile = await ensureProfile(user);

  if (!profile) {
    // Logged in but no username yet (for example after Google sign in).
    if (!isOnPage("choose-username.html")) {
      window.location.href = "choose-username.html";
    }
    nav.innerHTML = '<button type="button" class="link-button">Log out</button>';
    nav.querySelector("button").addEventListener("click", logOut);
    return { user: user, profile: null };
  }

  currentUserId = user.id;
  currentIsAdmin = await checkAdmin(user.id);

  // Logged in with a profile: your picture and @username open a small
  // menu with Profile, Settings and Log out. It's a <details> element,
  // which opens and closes on click without any extra code.
  const menu = el("details", "account-menu");
  const summary = el("summary", "nav-profile");
  summary.setAttribute("aria-label", "Your account menu");
  const avatar = makeAvatar(profile, "avatar-small");
  avatar.id = "header-avatar"; // profile.js updates this after an upload
  summary.appendChild(avatar);
  summary.appendChild(el("span", "nav-username", "@" + profile.username));
  menu.appendChild(summary);

  const items = el("div", "account-menu-items");
  const profileItem = el("a", "", "Your profile");
  profileItem.href = profileLink(profile.username);
  const settingsItem = el("a", "", "Settings");
  settingsItem.href = "settings.html";
  const logOutItem = el("button", "link-button", "Log out");
  logOutItem.type = "button";
  logOutItem.addEventListener("click", logOut);
  items.append(profileItem, settingsItem);
  if (currentIsAdmin) {
    const adminItem = el("a", "", "Admin");
    adminItem.href = "admin.html";
    items.appendChild(adminItem);
  }
  items.appendChild(logOutItem);
  menu.appendChild(items);

  // Close the menu when clicking anywhere else on the page.
  document.addEventListener("click", function (event) {
    if (!menu.contains(event.target)) menu.open = false;
  });

  nav.textContent = "";
  nav.appendChild(menu);

  return { user: user, profile: profile };
}

// Start straight away. Page scripts use `await authReady`.
const authReady = setupHeader().catch(function (error) {
  console.error("Header could not load:", error);
  return { user: null, profile: null };
});
