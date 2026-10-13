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


// ---------- Going back after logging in ----------
//
// When a logged-out visitor clicks Log in or Sign up, we remember the page
// they were on (in this browser, for 2 hours). After logging in, signing up
// or choosing a username they go back there instead of the home page.

const RETURN_KEY = "reddle-return-to";
const RETURN_FOR_MS = 2 * 60 * 60 * 1000;

// Pages that make no sense to go back to.
const NO_RETURN_PAGES = [
  "login.html", "signup.html", "choose-username.html", "welcome.html",
  "forgot-password.html", "reset-password.html", "404.html",
];

// Turns an address into a safe one on our own site, like "book/OL45804W"
// or "search.html?q=dune", or null. Outside websites are never allowed.
function safeReturnPath(address) {
  if (!address) return null;
  let url;
  try {
    url = new URL(address, document.baseURI);
  } catch (error) {
    return null;
  }
  const root = new URL("./", document.baseURI).href; // the site's main folder
  if (url.origin !== new URL(root).origin || !url.href.startsWith(root)) return null;
  const path = url.href.slice(root.length);
  const fileName = path.split(/[?#]/)[0];
  if (NO_RETURN_PAGES.includes(fileName)) return null;
  return path || "index.html";
}

function rememberReturnPage(address) {
  const path = safeReturnPath(address);
  try {
    if (path) localStorage.setItem(RETURN_KEY, JSON.stringify({ path: path, at: Date.now() }));
  } catch (error) {
    // Storage blocked (private mode): they just go to the home page.
  }
}

// The remembered page, or null. `forget` clears it once used.
function returnPage(forget) {
  try {
    const saved = JSON.parse(localStorage.getItem(RETURN_KEY) || "null");
    if (forget) localStorage.removeItem(RETURN_KEY);
    if (!saved || Date.now() - saved.at > RETURN_FOR_MS) return null;
    return safeReturnPath(saved.path);
  } catch (error) {
    return null;
  }
}

// Go to the remembered page, or the home page.
function goBackAfterLogin() {
  window.location.href = returnPage(true) || "index.html";
}

// Any click on a Log in or Sign up link remembers the current page.
document.addEventListener("click", function (event) {
  const link = event.target.closest && event.target.closest("a[href]");
  if (!link) return;
  const fileName = new URL(link.href).pathname.split("/").pop();
  if (fileName === "login.html" || fileName === "signup.html") {
    rememberReturnPage(window.location.href);
  }
});


// ---------- Resend the confirmation email ----------

// A "Resend the email" button for people whose email isn't confirmed yet.
// It can be pressed once a minute (Supabase also limits how often emails
// go out). Messages go in `messageBox` (a .status element).
const resendLastPressed = {}; // email -> time, so a new button keeps the wait
function makeResendButton(email, messageBox) {
  const button = el("button", "button button-secondary resend-button", "Resend the email");
  button.type = "button";
  let waitTimer = null;

  // Counts down on the button so people know when they can press again.
  function waitBeforeNextTry(seconds) {
    button.disabled = true;
    clearInterval(waitTimer);
    waitTimer = setInterval(function () {
      seconds -= 1;
      if (seconds <= 0) {
        clearInterval(waitTimer);
        button.disabled = false;
        button.textContent = "Resend the email";
      } else {
        button.textContent = "Resend again in " + seconds + "s";
      }
    }, 1000);
    button.textContent = "Resend again in " + seconds + "s";
  }

  const secondsLeft = Math.ceil(((resendLastPressed[email] || 0) + 60000 - Date.now()) / 1000);
  if (secondsLeft > 0) waitBeforeNextTry(secondsLeft);

  button.addEventListener("click", async function () {
    button.disabled = true;
    resendLastPressed[email] = Date.now();
    const { error } = await db.auth.resend({ type: "signup", email: email });
    if (error) {
      const tooSoon = error.status === 429 || /rate limit|only request this after|seconds/i.test(error.message || "");
      showStatus(
        messageBox,
        "error",
        tooSoon
          ? "We just sent one. Please wait a minute before asking again, and check your spam folder."
          : friendlyError(error, "Couldn't send the email. ")
      );
      waitBeforeNextTry(60);
      return;
    }
    showStatus(messageBox, "ok", "Sent! We emailed a new confirmation link to " + email + ". Check your inbox (and spam folder).");
    waitBeforeNextTry(60);
  });
  return button;
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
  // id: book/OL45804W, u: u/maria, a: author/OL23919A
  const at = parts.lastIndexOf({ id: "book", u: "u", a: "author" }[name]);
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

// Link to a book page: book/OL45804W (or book.html?id= as a local file).
function bookLink(externalId) {
  return cleanAddresses
    ? "book/" + encodeURIComponent(externalId)
    : "book.html?id=" + encodeURIComponent(externalId);
}

// Link to an author page: author/OL23919A (or author.html?a= as a local file).
function authorLink(authorId) {
  return cleanAddresses
    ? "author/" + encodeURIComponent(authorId)
    : "author.html?a=" + encodeURIComponent(authorId);
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


// ---------- Share, invite and feedback ----------

// The full web address of one of our links, like "u/maria".
function fullAddress(link) {
  return new URL(link, document.baseURI).href;
}

// Copies text, or asks the browser to show it for copying by hand.
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    window.prompt("Copy this:", text);
    return false;
  }
}

// Shares with the phone's share sheet when there is one, otherwise
// copies the link. `button` briefly says what happened.
async function shareLink(button, title, text, url) {
  if (navigator.share) {
    try {
      await navigator.share({ title: title, text: text, url: url });
      return;
    } catch (error) {
      if (error.name === "AbortError") return; // they closed the share sheet
    }
  }
  if (await copyText(url)) flashButtonText(button, "Link copied!");
}

function flashButtonText(button, text) {
  const before = button.dataset.label || button.textContent;
  button.dataset.label = before;
  button.textContent = text;
  setTimeout(() => (button.textContent = before), 2000);
}

// A small "Share" button for a profile or a book page.
function makeShareButton(title, text, link) {
  const button = el("button", "link-button share-button", "Share");
  button.type = "button";
  button.addEventListener("click", () => shareLink(button, title, text, fullAddress(link)));
  return button;
}

// A pop-up box (<dialog>) with a heading. Returns { dialog, body }.
function makeDialog(title) {
  const dialog = el("dialog", "dialog");
  const box = el("div", "dialog-box");
  const head = el("div", "dialog-head");
  head.appendChild(el("h2", "", title));
  const close = el("button", "link-button dialog-close", "\u00d7");
  close.type = "button";
  close.setAttribute("aria-label", "Close");
  close.addEventListener("click", () => dialog.close());
  head.appendChild(close);
  box.appendChild(head);
  const body = el("div", "dialog-body");
  box.appendChild(body);
  dialog.appendChild(box);
  // Clicking the dark area around the box closes it.
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  document.body.appendChild(dialog);
  return { dialog: dialog, body: body };
}

// "Invite friends": a ready-to-send message with Share and Copy buttons.
function openInviteDialog(profile) {
  const { dialog, body } = makeDialog("Invite friends");
  const message =
    "I'm using Reddle to keep track of the books I read. Come and join me, and follow me (@" +
    profile.username + "): " + fullAddress(profileLink(profile.username));
  body.appendChild(el("p", "muted", "Send this to your friends. You can change the words first."));
  const text = el("textarea", "invite-text");
  text.rows = 4;
  text.value = message;
  body.appendChild(text);
  const buttons = el("div", "form-buttons");
  if (navigator.share) {
    const share = el("button", "button", "Share");
    share.type = "button";
    share.addEventListener("click", () => navigator.share({ title: "Join me on Reddle", text: text.value }).catch(() => {}));
    buttons.appendChild(share);
  }
  const copy = el("button", navigator.share ? "button button-secondary" : "button", "Copy message");
  copy.type = "button";
  copy.addEventListener("click", async () => {
    if (await copyText(text.value)) flashButtonText(copy, "Copied!");
  });
  buttons.appendChild(copy);
  body.appendChild(buttons);
  dialog.addEventListener("close", () => dialog.remove());
  dialog.showModal();
}

// "Feedback": a message to the site owner (saved in the feedback table,
// supabase/step16-feedback.sql; only admins can read it).
const FEEDBACK_MAX = 2000;

function openFeedbackDialog() {
  const { dialog, body } = makeDialog("Send feedback");
  const form = el("form", "form");
  const label = el("label", "", "Ideas, problems, anything. Only the site owner reads these.");
  label.htmlFor = "feedback-text";
  const text = el("textarea", "");
  text.id = "feedback-text";
  text.rows = 6;
  text.maxLength = FEEDBACK_MAX;
  text.required = true;
  const counter = el("p", "hint", "0 / " + FEEDBACK_MAX);
  text.addEventListener("input", () => (counter.textContent = text.value.length + " / " + FEEDBACK_MAX));
  const send = el("button", "button", "Send");
  send.type = "submit";
  const message = el("p", "status");
  message.hidden = true;
  form.append(label, text, counter, send, message);
  body.appendChild(form);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const words = text.value.trim();
    if (!words) return showStatus(message, "error", "Please write something first.");
    send.disabled = true;
    const page = (window.location.pathname + window.location.search).slice(0, 300);
    const { error } = await db.from("feedback").insert({ message: words, page: page });
    send.disabled = false;
    if (error) {
      showStatus(message, "error", friendlyError(error, "Couldn't send it. "));
      return;
    }
    text.value = "";
    showStatus(message, "ok", "Thank you! Your message was sent.");
    setTimeout(() => dialog.close(), 1500);
  });
  dialog.addEventListener("close", () => dialog.remove());
  dialog.showModal();
  text.focus();
}

// Logged in: Feedback and Invite friends links in the footer.
function addFooterExtras(profile) {
  const links = document.querySelector(".footer-links");
  if (!links || links.querySelector(".footer-feedback")) return;
  const feedback = el("button", "link-button footer-feedback", "Feedback");
  feedback.type = "button";
  feedback.addEventListener("click", openFeedbackDialog);
  const invite = el("button", "link-button", "Invite friends");
  invite.type = "button";
  invite.addEventListener("click", () => openInviteDialog(profile));
  links.append(feedback, invite);
}


// ---------- Day and night mode ----------
//
// The little script at the top of every page already set data-theme on
// <html> (your saved choice, or the device setting). This adds the
// sun/moon switch, and follows the device setting while you haven't chosen.

const THEME_KEY = "reddle-theme";
const THEME_COLOURS = { dark: "#14181c", light: "#f4ecd8" }; // = --bg in style.css

function savedTheme() {
  try {
    return localStorage.getItem(THEME_KEY);
  } catch (error) {
    return null;
  }
}

function showTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", THEME_COLOURS[theme]);
  const toggle = document.getElementById("theme-toggle");
  if (toggle) {
    const label = theme === "light" ? "Switch to night mode" : "Switch to day mode";
    toggle.setAttribute("aria-label", label);
    toggle.title = label;
  }
}

function setUpThemeToggle() {
  showTheme(document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark");
  const toggle = document.getElementById("theme-toggle");
  if (toggle && !toggle.dataset.ready) {
    toggle.dataset.ready = "yes";
    toggle.addEventListener("click", function () {
      const next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch (error) {
        // can't remember it (private mode); it still switches for this page
      }
      showTheme(next);
    });
  }
}

setUpThemeToggle();

// No choice saved: follow the device when it switches (e.g. at sunset).
if (window.matchMedia) {
  window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", function (event) {
    if (!savedTheme()) showTheme(event.matches ? "light" : "dark");
  });
}


// ---------- Installable app ----------
//
// sw.js (the service worker) lets the site be installed like an app and
// shows a friendly page when offline. It needs a real web address (https),
// so nothing happens when the site is opened as a file.

if ("serviceWorker" in navigator && window.isSecureContext && window.location.protocol !== "file:") {
  // sw.js sits in the site's main folder (/Reddle/ on github.io, / on
  // reddle.org), so it looks after every page.
  navigator.serviceWorker.register(new URL("sw.js", document.baseURI).href).catch(function (error) {
    console.warn("Offline support could not start:", error);
  });
}

// Already opened as an installed app?
function isInstalledApp() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

// The footer gets an "Install app" button where the browser allows it
// (Chrome, Edge, Android), or a short how-to on iPhone and iPad Safari.
let installPrompt = null;

function installBox() {
  const footer = document.querySelector(".site-footer");
  if (!footer) return null;
  let box = document.getElementById("install-app");
  if (!box) {
    box = el("p", "footer-install");
    box.id = "install-app";
    footer.prepend(box);
  }
  return box;
}

window.addEventListener("beforeinstallprompt", function (event) {
  event.preventDefault(); // we show our own button instead
  installPrompt = event;
  const box = installBox();
  if (!box) return;
  box.textContent = "";
  const button = el("button", "button button-secondary", "Install app");
  button.type = "button";
  button.addEventListener("click", async function () {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    box.remove();
  });
  box.appendChild(button);
});

window.addEventListener("appinstalled", function () {
  const box = document.getElementById("install-app");
  if (box) box.remove();
});

(function showIphoneHint() {
  const isApple = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); // iPads say "Mac"
  if (!isApple || isInstalledApp() || window.location.protocol !== "https:") return;
  const show = function () {
    const box = installBox();
    if (box) box.textContent = "Get the app: tap Share, then \u201cAdd to Home Screen\u201d.";
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", show);
  else show();
})();


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
  // "local": log out on this device only, so your other devices stay logged in.
  await db.auth.signOut({ scope: "local" });
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


// Small icons for the header buttons (fixed drawings, no user text).
const ICON_GEAR =
  '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>';
const ICON_LOG_OUT =
  '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>';
const ICON_SHIELD =
  '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>';

// One header button: an icon plus a word. On phones only the icon shows,
// so the word is also the button's accessible name and tooltip.
function makeNavButton(tag, href, label, icon) {
  const button = el(tag, "nav-button");
  if (href) button.href = href;
  if (tag === "button") button.type = "button";
  button.title = label;
  button.setAttribute("aria-label", label);
  button.innerHTML = icon;
  button.appendChild(el("span", "nav-label", label));
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

  // Logged in with a profile: separate buttons that are always visible.
  // Profile (your picture + @username), Admin (admins only), Settings
  // (gear) and Log out. On phones only the icons show (see style.css).
  const profileButton = el("a", "nav-button nav-profile");
  profileButton.href = profileLink(profile.username);
  profileButton.title = "Your profile";
  const avatar = makeAvatar(profile, "avatar-small");
  avatar.id = "header-avatar"; // profile.js updates this after an upload
  profileButton.appendChild(avatar);
  profileButton.appendChild(el("span", "nav-username", "@" + profile.username));

  const buttons = [profileButton];
  if (currentIsAdmin) {
    buttons.push(makeNavButton("a", "admin.html", "Admin", ICON_SHIELD));
  }
  buttons.push(makeNavButton("a", "settings.html", "Settings", ICON_GEAR));
  const logOutButton = makeNavButton("button", null, "Log out", ICON_LOG_OUT);
  logOutButton.classList.add("nav-log-out");
  logOutButton.addEventListener("click", logOut);
  buttons.push(logOutButton);

  nav.textContent = "";
  nav.append(...buttons);
  addFooterExtras(profile);

  // Google sign in and email confirmation links land on the home page.
  // If they started logging in from another page, go back there.
  const onHomePage = isOnPage("index.html") || window.location.pathname.endsWith("/");
  if (onHomePage && profile.onboarded && returnPage(false)) goBackAfterLogin();

  return { user: user, profile: profile };
}

// Start straight away. Page scripts use `await authReady`.
const authReady = setupHeader().catch(function (error) {
  console.error("Header could not load:", error);
  return { user: null, profile: null };
});
