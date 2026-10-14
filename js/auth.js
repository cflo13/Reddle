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
  } else if (/going a bit fast|rate.?limit/i.test(text)) {
    plain = "You're going a bit fast. Please wait a few minutes and try again.";
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
  // id: book/OL45804W, u: u/maria, a: author/OL23919A, d: diary/maria
  const at = parts.lastIndexOf({ id: "book", u: "u", a: "author", d: "diary" }[name]);
  return at >= 0 && parts[at + 1] ? decodeURIComponent(parts[at + 1]) : null;
}

// Sets the tab title and the page description (also the share-preview
// copies, for apps and search engines that run the page's code).
// `description` is shortened to about 155 characters.
function setPageInfo(title, description) {
  document.title = title;
  const set = function (selector, value) {
    const tag = document.querySelector(selector);
    if (tag && value) tag.setAttribute("content", value);
  };
  let text = String(description || "").replace(/\s+/g, " ").trim();
  if (text.length > 155) text = text.slice(0, 152).replace(/\s+\S*$/, "") + "\u2026";
  set('meta[property="og:title"]', title);
  set('meta[name="description"]', text);
  set('meta[property="og:description"]', text);
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

// Link to someone's diary: diary/maria (or diary.html?u= as a local file).
function diaryLink(username) {
  return cleanAddresses
    ? "diary/" + encodeURIComponent(username)
    : "diary.html?u=" + encodeURIComponent(username);
}

// Link to someone's year in review (year.html?u=maria&y=2026).
function yearLink(username, year) {
  return "year.html?u=" + encodeURIComponent(username) + "&y=" + year;
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
    img.loading = "lazy";
    img.decoding = "async";
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


// ---------- Following, private profiles, blocks and mutes ----------
// (supabase/step20-privacy-safety.sql: the database enforces all of it)

// "following", "requested" (asked a private person) or "none".
async function followState(personId) {
  const [follow, request] = await Promise.all([
    db.from("follows").select("follower_id").eq("follower_id", currentUserId).eq("following_id", personId).maybeSingle(),
    db.from("follow_requests").select("target_id").eq("requester_id", currentUserId).eq("target_id", personId).maybeSingle(),
  ]);
  if (follow.data) return "following";
  if (request.data) return "requested";
  return "none";
}

// Follows a public person, or sends a follow request to a private one.
// `person` needs id and is_private. Returns the new state.
async function followPerson(person) {
  if (person.is_private) {
    const { error } = await db.from("follow_requests").insert({ requester_id: currentUserId, target_id: person.id });
    if (error && error.code !== "23505") throw error; // 23505 = already asked
    return "requested";
  }
  const { error } = await db.from("follows").insert({ follower_id: currentUserId, following_id: person.id });
  if (error && error.code !== "23505") throw error;
  return "following";
}

// Unfollows, or takes back a follow request.
async function unfollowPerson(personId) {
  const [a, b] = await Promise.all([
    db.from("follows").delete().eq("follower_id", currentUserId).eq("following_id", personId),
    db.from("follow_requests").delete().eq("requester_id", currentUserId).eq("target_id", personId),
  ]);
  if (a.error) throw a.error;
  if (b.error) throw b.error;
  return "none";
}

// Blocks someone: neither of you sees the other any more, and any
// follows or follow requests between you are removed.
async function blockPerson(personId) {
  const { error } = await db.from("blocks").insert({ blocker_id: currentUserId, blocked_id: personId });
  if (error && error.code !== "23505") throw error;
  await Promise.all([
    db.from("follows").delete().eq("follower_id", currentUserId).eq("following_id", personId),
    db.from("follows").delete().eq("follower_id", personId).eq("following_id", currentUserId),
    db.from("follow_requests").delete().eq("requester_id", currentUserId).eq("target_id", personId),
    db.from("follow_requests").delete().eq("requester_id", personId).eq("target_id", currentUserId),
  ]);
}

async function unblockPerson(personId) {
  const { error } = await db.from("blocks").delete().eq("blocker_id", currentUserId).eq("blocked_id", personId);
  if (error) throw error;
}

async function setMuted(personId, mute) {
  const { error } = mute
    ? await db.from("mutes").insert({ muter_id: currentUserId, muted_id: personId })
    : await db.from("mutes").delete().eq("muter_id", currentUserId).eq("muted_id", personId);
  if (error && error.code !== "23505") throw error;
}

// The people you muted (their reviews stay out of your feed).
// Deletes every picture a person attached to posts and every screenshot
// they sent with feedback (their folder in the post-images and
// feedback-pictures buckets). Used when deleting an account (your own)
// and when the admin removes a user. Pictures live in Storage, so the
// database can't delete them itself.
async function removeUserPictures(userId) {
  for (const bucket of ["post-images", "feedback-pictures"]) {
    for (let round = 0; round < 20; round++) {
      const { data } = await db.storage.from(bucket).list(userId, { limit: 100 });
      if (!data || data.length === 0) break;
      const { error } = await db.storage.from(bucket).remove(data.map((file) => userId + "/" + file.name));
      if (error) break;
    }
  }
}

async function mutedIds() {
  if (!currentUserId) return [];
  const { data } = await db.from("mutes").select("muted_id").eq("muter_id", currentUserId);
  return (data || []).map((row) => row.muted_id);
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

// ---------- Feedback and bug reports ----------
// The pop-up behind "Feedback" and "Report a bug" in the footer. Saved in
// the feedback table (supabase/step16-feedback.sql + step23-bug-reports.sql);
// only admins can read it. Logged-out visitors can send one too, with an
// email address so we can reply. Logged-in people can add a screenshot
// (private "feedback-pictures" bucket, their own folder, admins only).
const FEEDBACK_MAX = 2000;                       // both boxes together
const FEEDBACK_PICTURE_MAX_BYTES = 5 * 1024 * 1024;
const FEEDBACK_PICTURE_SIZE = 1600;              // longest side after shrinking
const FEEDBACK_KINDS = [["bug", "Bug"], ["idea", "Idea"], ["other", "Something else"]];

// Shrinks a picture so its longest side is at most `maxSide` pixels and
// gives it back as a JPEG. Used for post pictures and screenshots.
function shrinkPicture(file, maxSide) {
  return new Promise(function (resolve, reject) {
    const img = new Image();
    const link = URL.createObjectURL(file);
    img.onload = function () {
      const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = themeColour("--surface"); // behind see-through parts
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(link);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The picture couldn't be read."))), "image/jpeg", 0.85);
    };
    img.onerror = function () {
      URL.revokeObjectURL(link);
      reject(new Error("That file doesn't look like a picture."));
    };
    img.src = link;
  });
}

// "Chrome 129 on Android": the browser and device in a few words, from
// the browser's own description of itself (the user agent).
function deviceSummary() {
  const ua = navigator.userAgent || "";
  let browser = "Unknown browser";
  const browsers = [
    [/Edg\/(\d+)/, "Edge"], [/OPR\/(\d+)/, "Opera"], [/SamsungBrowser\/(\d+)/, "Samsung Internet"],
    [/Firefox\/(\d+)/, "Firefox"], [/FxiOS\/(\d+)/, "Firefox"], [/CriOS\/(\d+)/, "Chrome"],
    [/Chrome\/(\d+)/, "Chrome"], [/Version\/(\d+)[\d.]* .*Safari\//, "Safari"],
  ];
  for (const [pattern, name] of browsers) {
    const match = ua.match(pattern);
    if (match) {
      browser = name + " " + match[1];
      break;
    }
  }
  let device = "unknown device";
  if (/iPhone/.test(ua)) device = "iPhone";
  else if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) device = "iPad";
  else if (/Android/.test(ua)) device = /Mobile/.test(ua) ? "Android phone" : "Android tablet";
  else if (/Windows/.test(ua)) device = "Windows";
  else if (/CrOS/.test(ua)) device = "Chromebook";
  else if (/Macintosh|Mac OS X/.test(ua)) device = "Mac";
  else if (/Linux/.test(ua)) device = "Linux";
  return (browser + " on " + device).slice(0, 200);
}

// Was the site opened as the installed app (from the home screen)?
function isInstalledApp() {
  return (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
}

function looksLikeEmail(text) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(text) && text.length <= 254;
}

// startKind: "bug" (from "Report a bug") or "other" (from "Feedback").
function openFeedbackDialog(startKind) {
  const loggedIn = !!currentUserId;
  const { dialog, body } = makeDialog(startKind === "bug" ? "Report a bug" : "Send feedback");
  const form = el("form", "form feedback-form");
  form.noValidate = true; // we check it ourselves, with friendlier words

  // 1. What kind
  const kinds = el("div", "feedback-kinds");
  kinds.setAttribute("role", "radiogroup");
  kinds.setAttribute("aria-label", "What kind of message is this?");
  let kind = startKind === "bug" ? "bug" : "other";
  const kindButtons = FEEDBACK_KINDS.map(function ([value, label]) {
    const button = el("button", "genre-choice", label);
    button.type = "button";
    button.setAttribute("role", "radio");
    button.addEventListener("click", function () {
      kind = value;
      showKind();
    });
    button.dataset.kind = value;
    kinds.appendChild(button);
    return button;
  });

  // 2. The words: one box, or two for a bug
  const stepsLabel = el("label", "", "What were you trying to do?");
  stepsLabel.htmlFor = "feedback-steps";
  const steps = el("textarea", "");
  steps.id = "feedback-steps";
  steps.rows = 3;
  const textLabel = el("label", "");
  textLabel.htmlFor = "feedback-text";
  const text = el("textarea", "");
  text.id = "feedback-text";
  text.rows = 5;
  const counter = el("p", "hint", "0 / " + FEEDBACK_MAX);

  function used() {
    return text.value.length + (kind === "bug" ? steps.value.length : 0);
  }
  function updateCounter() {
    // Both boxes share the 2000 characters.
    text.maxLength = FEEDBACK_MAX - (kind === "bug" ? steps.value.length : 0);
    steps.maxLength = FEEDBACK_MAX - text.value.length;
    counter.textContent = used() + " / " + FEEDBACK_MAX;
  }
  text.addEventListener("input", updateCounter);
  steps.addEventListener("input", updateCounter);

  function showKind() {
    kindButtons.forEach((button) => {
      const on = button.dataset.kind === kind;
      button.setAttribute("aria-checked", on ? "true" : "false");
      button.setAttribute("aria-pressed", on ? "true" : "false");
    });
    const bug = kind === "bug";
    stepsLabel.hidden = !bug;
    steps.hidden = !bug;
    textLabel.textContent = bug ? "What happened instead?" : kind === "idea" ? "Your idea" : "Your message";
    text.placeholder = bug ? "For example: the stars didn't save" : "";
    updateCounter();
  }

  // 3. Screenshot (logged in only)
  let picture = null;
  const pictureArea = el("div", "feedback-picture");
  const pictureInput = el("input", "");
  pictureInput.type = "file";
  pictureInput.accept = "image/jpeg,image/png,image/webp";
  pictureInput.hidden = true;
  const pictureButton = el("button", "link-button", "+ Add a screenshot (optional)");
  pictureButton.type = "button";
  pictureButton.addEventListener("click", () => pictureInput.click());
  const pictureChip = el("div", "composer-chip");
  pictureChip.hidden = true;
  function showPicture() {
    pictureChip.textContent = "";
    pictureChip.hidden = !picture;
    pictureButton.hidden = !!picture;
    if (!picture) return;
    const preview = document.createElement("img");
    preview.className = "composer-preview";
    preview.alt = "";
    preview.src = URL.createObjectURL(picture);
    const remove = el("button", "link-button composer-remove", "×");
    remove.type = "button";
    remove.setAttribute("aria-label", "Remove the screenshot");
    remove.addEventListener("click", () => { picture = null; showPicture(); });
    pictureChip.append(preview, el("span", "muted", picture.name), remove);
  }
  pictureInput.addEventListener("change", function () {
    const file = pictureInput.files[0];
    pictureInput.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return problem("Screenshots must be JPG, PNG or WEBP.");
    if (file.size > FEEDBACK_PICTURE_MAX_BYTES) return problem("That picture is bigger than 5 MB.");
    message.hidden = true;
    picture = file;
    showPicture();
  });
  pictureArea.append(pictureInput, pictureButton, pictureChip);

  // 4. Reply address (logged out only)
  const emailLabel = el("label", "", "Your email, so we can reply");
  emailLabel.htmlFor = "feedback-email";
  const email = el("input", "");
  email.id = "feedback-email";
  email.type = "email";
  email.autocomplete = "email";
  email.maxLength = 254;
  const emailHint = el("p", "hint", "We only use it to answer this report.");

  const sentWith = el("p", "hint feedback-sent-with",
    "Sent with it: this page's address, your browser and device, your screen width, and whether you're using the installed app.");
  const send = el("button", "button", "Send");
  send.type = "submit";
  const message = el("p", "status");
  message.hidden = true;
  // An error message, scrolled into view (the pop-up can be taller than a phone screen).
  function problem(text) {
    showStatus(message, "error", text);
    message.scrollIntoView({ block: "nearest" });
  }

  form.appendChild(kinds);
  form.append(stepsLabel, steps, textLabel, text, counter);
  if (loggedIn) form.appendChild(pictureArea);
  else form.append(emailLabel, email, emailHint);
  form.append(sentWith, send, message);
  body.appendChild(form);
  showKind();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const words = text.value.trim();
    const stepWords = kind === "bug" ? steps.value.trim() : "";
    if (kind === "bug" && !stepWords) return problem("Please say what you were trying to do.");
    if (!words) return problem(kind === "bug" ? "Please say what happened instead." : "Please write something first.");
    if (words.length + stepWords.length > FEEDBACK_MAX) return problem("That's a bit long: " + FEEDBACK_MAX + " characters at most.");
    const reply = email.value.trim();
    if (!loggedIn && !looksLikeEmail(reply)) return problem("Please type an email address we can reply to.");

    send.disabled = true;
    send.textContent = "Sending...";
    message.hidden = true;
    const row = {
      kind: kind,
      message: words,
      steps: stepWords || null,
      page: (window.location.pathname + window.location.search).slice(0, 300),
      device_info: deviceSummary(),
      screen_width: Math.round(window.innerWidth),
      installed_app: isInstalledApp(),
    };
    if (!loggedIn) row.contact_email = reply;
    let uploaded = null;
    try {
      if (picture) {
        const blob = await shrinkPicture(picture, FEEDBACK_PICTURE_SIZE);
        uploaded = currentUserId + "/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + ".jpg";
        const { error } = await db.storage.from("feedback-pictures").upload(uploaded, blob, { contentType: "image/jpeg" });
        if (error) {
          uploaded = null;
          throw error;
        }
        row.picture_path = uploaded;
      }
      const { error } = await db.from("feedback").insert(row);
      if (error) throw error;
    } catch (error) {
      if (uploaded) db.storage.from("feedback-pictures").remove([uploaded]); // don't leave it behind
      send.disabled = false;
      send.textContent = "Send";
      problem(friendlyError(error, "Couldn't send it. "));
      return;
    }
    // Done: just the thank-you.
    body.textContent = "";
    body.appendChild(el("p", "feedback-thanks", "Thanks, we've got it"));
    setTimeout(() => dialog.close(), 2500);
  });
  dialog.addEventListener("close", () => dialog.remove());
  dialog.showModal();
  (kind === "bug" ? steps : text).focus();
}

// Footer links. Logged in: Feedback, Report a bug and Invite friends.
// Logged out: Report a bug (with an email box in the pop-up).
function footerLinkButton(text, className, onClick) {
  const button = el("button", "link-button " + className, text);
  button.type = "button";
  button.addEventListener("click", onClick);
  return button;
}

function addFooterExtras(profile) {
  const links = document.querySelector(".footer-links");
  if (!links || links.querySelector(".footer-feedback")) return;
  links.append(
    footerLinkButton("Feedback", "footer-feedback", () => openFeedbackDialog("other")),
    footerLinkButton("Report a bug", "footer-bug", () => openFeedbackDialog("bug")),
    footerLinkButton("Invite friends", "footer-invite", () => openInviteDialog(profile))
  );
}

function addLoggedOutFooter() {
  const links = document.querySelector(".footer-links");
  if (!links || links.querySelector(".footer-bug")) return;
  links.append(footerLinkButton("Report a bug", "footer-bug", () => openFeedbackDialog("bug")));
}


// ---------- Day and night mode ----------
//
// The little script at the top of every page already set data-theme on
// <html> (your saved choice, or the device setting). This adds the
// sun/moon switch, and follows the device setting while you haven't chosen.

const THEME_KEY = "reddle-theme";

// A colour token from style.css, like themeColour("--bg").
function themeColour(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function savedTheme() {
  try {
    return localStorage.getItem(THEME_KEY);
  } catch (error) {
    return null;
  }
}

// `fade`: colours fade over a moment (when the button is pressed).
function showTheme(theme, fade) {
  const root = document.documentElement;
  if (fade && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    root.classList.add("theme-fading");
    clearTimeout(showTheme.timer);
    showTheme.timer = setTimeout(() => root.classList.remove("theme-fading"), 450);
  }
  root.setAttribute("data-theme", theme);
  // The phone's status bar matches the header.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", themeColour("--surface"));
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
      showTheme(next, true);
    });
  }
}

setUpThemeToggle();

// No choice saved: follow the device when it switches (e.g. at sunset).
if (window.matchMedia) {
  window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", function (event) {
    if (!savedTheme()) showTheme(event.matches ? "light" : "dark", true);
  });
}


// ---------- Universes: Books, Comics, Manga ----------
//
// Three "universes" share one site. Books is the cosy default; Comics and
// Manga look different and (from part b on) only show their own world.
// The choice is kept in local storage (reddle-universe) and the little
// script at the top of every page puts data-universe on <html> before
// the CSS loads, so there's no flash. Works logged out too.

const UNIVERSE_KEY = "reddle-universe";
const UNIVERSES = {
  books: { name: "Books", noun: "books" },
  comics: { name: "Comics", noun: "comics" },
  manga: { name: "Manga", noun: "manga" },
};

function currentUniverse() {
  const universe = document.documentElement.getAttribute("data-universe");
  return UNIVERSES[universe] ? universe : "books";
}

function saveUniverse(universe) {
  try {
    localStorage.setItem(UNIVERSE_KEY, universe);
  } catch (error) {
    // can't remember it (private mode); it still switches for this page
  }
}

// Switch the colours in place (no reload), e.g. when a link from another
// universe opens a book that belongs there.
function showUniverse(universe) {
  if (!UNIVERSES[universe]) universe = "books";
  saveUniverse(universe);
  document.documentElement.setAttribute("data-universe", universe);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", themeColour("--surface"));
}

// The switch buttons: save the choice and reload, so every row, search
// and feed on the page comes from the new universe.
function goToUniverse(universe) {
  if (!UNIVERSES[universe] || universe === currentUniverse()) return;
  saveUniverse(universe);
  const root = document.documentElement;
  const reload = () => window.location.reload();
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return reload();
  root.classList.add("universe-leaving");
  setTimeout(reload, 170);
}

function setUpUniverseSwitch() {
  const button = document.getElementById("universe-button");
  const menu = document.getElementById("universe-menu");
  if (!button || button.dataset.ready) return;
  button.dataset.ready = "yes";
  const name = () => currentUniverse() === "books" ? "Comics and Manga modes" : "Back to Books";
  button.title = name();

  function closeMenu(focusButton) {
    if (!menu || menu.hidden) return;
    menu.hidden = true;
    button.setAttribute("aria-expanded", "false");
    if (focusButton) button.focus();
  }

  button.addEventListener("click", function () {
    // Comics and Manga: straight back to Books. Books: the little menu.
    if (currentUniverse() !== "books") return goToUniverse("books");
    if (!menu) return;
    if (!menu.hidden) return closeMenu(false);
    menu.hidden = false;
    button.setAttribute("aria-expanded", "true");
    const first = menu.querySelector("button");
    if (first) first.focus();
  });

  if (menu) {
    menu.addEventListener("keydown", function (event) {
      const options = [...menu.querySelectorAll("button")];
      const at = options.indexOf(document.activeElement);
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        options[(at + step + options.length) % options.length].focus();
      } else if (event.key === "Escape") {
        closeMenu(true);
      }
    });
    document.addEventListener("click", function (event) {
      if (!event.target.closest(".universe-switch")) closeMenu(false);
    });
  }
}

// Any button with data-go-universe="comics" (header menu, footer, phone
// menu) switches.
document.addEventListener("click", function (event) {
  const target = event.target.closest("[data-go-universe]");
  if (target) goToUniverse(target.getAttribute("data-go-universe"));
});

setUpUniverseSwitch();


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

// The footer gets an "Install app" button, and phones get one in the menu
// and a small card on the home page. Chrome, Edge and Android offer their
// own install box (installPrompt); everywhere else (iPhone, iPad, other
// browsers) the button opens a short how-to.
let installPrompt = null;

function isApple() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); // iPads say "Mac"
}

// Worth offering? Not inside the app itself, and only on a real web
// address (installing needs https; localhost is for trying it out).
function canOfferInstall() {
  if (isInstalledApp()) return false;
  return window.location.protocol === "https:" || window.location.hostname === "localhost";
}

function startInstall() {
  if (installPrompt) {
    const prompt = installPrompt;
    installPrompt = null; // each prompt can only be shown once
    prompt.prompt();
    return;
  }
  openInstallHelp();
}

// How to add Reddle to the home screen, for browsers without a button.
function openInstallHelp() {
  const { dialog, body } = makeDialog("Put Reddle on your home screen");
  const steps = el("ol", "install-steps");
  const lines = isApple()
    ? ["Tap the Share button (the square with an arrow). In Safari it's at the bottom of the screen on iPhone, at the top on iPad; in Chrome it's at the top.",
       "Scroll down and tap \u201cAdd to Home Screen\u201d.",
       "Tap Add. Reddle now opens from its own icon, full screen."]
    : /Android/.test(navigator.userAgent)
      ? ["Open your browser's menu (the \u22ee button, usually top right).",
         "Tap \u201cInstall app\u201d or \u201cAdd to Home screen\u201d.",
         "Tap Install. Reddle now opens from its own icon, full screen."]
      : ["In Chrome or Edge, click the install icon at the right end of the address bar (or open the browser menu and choose Install).",
         "Click Install. Reddle opens in its own window."];
  lines.forEach((line) => steps.appendChild(el("li", "", line)));
  body.appendChild(steps);
  const done = el("button", "button", "Got it");
  done.type = "button";
  done.addEventListener("click", () => dialog.close());
  body.appendChild(done);
  dialog.addEventListener("close", () => dialog.remove());
  dialog.showModal();
}

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

function showFooterInstall() {
  if (!canOfferInstall() || (!installPrompt && !isApple())) return;
  const box = installBox();
  if (!box || box.firstChild) return;
  const button = el("button", "button button-secondary", "Install app");
  button.type = "button";
  button.addEventListener("click", startInstall);
  box.appendChild(button);
  box.appendChild(el("span", "", isApple() ? " Adds Reddle to your home screen." : ""));
}

// Home page on phones: a small card, until it's dismissed (for 60 days)
// or the app is installed.
const INSTALL_CARD_KEY = "reddle-install-card-hidden";

function showInstallCard() {
  const layout = document.querySelector(".page-home .home-layout");
  if (!layout || document.getElementById("install-card") || !canOfferInstall()) return;
  if (!window.matchMedia("(max-width: 767px), (max-height: 500px) and (pointer: coarse)").matches) return;
  if (!installPrompt && !isApple() && !/Android/.test(navigator.userAgent)) return;
  try {
    const hiddenAt = Number(localStorage.getItem(INSTALL_CARD_KEY));
    if (hiddenAt && Date.now() - hiddenAt < 60 * 24 * 3600 * 1000) return;
  } catch (error) {}
  const card = el("section", "install-card");
  card.id = "install-card";
  const icon = el("img", "install-card-icon");
  icon.src = "images/icon-192.png";
  icon.alt = "";
  icon.width = 48;
  icon.height = 48;
  card.appendChild(icon);
  const words = el("div", "install-card-words");
  words.appendChild(el("h2", "", "Reddle on your home screen"));
  words.appendChild(el("p", "", "Opens full screen with one tap, like an app."));
  const buttons = el("div", "install-card-buttons");
  const install = el("button", "button", "Install");
  install.type = "button";
  install.addEventListener("click", startInstall);
  const later = el("button", "link-button", "Not now");
  later.type = "button";
  later.addEventListener("click", () => {
    try { localStorage.setItem(INSTALL_CARD_KEY, String(Date.now())); } catch (error) {}
    card.remove();
  });
  buttons.append(install, later);
  words.appendChild(buttons);
  card.appendChild(words);
  layout.before(card);
}

window.addEventListener("beforeinstallprompt", function (event) {
  event.preventDefault(); // we show our own buttons instead
  installPrompt = event;
  showFooterInstall();
  showInstallCard();
});

window.addEventListener("appinstalled", function () {
  installPrompt = null;
  document.querySelectorAll("#install-app, #install-card").forEach((box) => box.remove());
});

function whenPageReady(run) {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
  else run();
}

whenPageReady(function () {
  showFooterInstall();
  showInstallCard();
  // Inside the installed app: no browser bar, so no bounce at the ends.
  document.documentElement.classList.toggle("installed-app", isInstalledApp());
});


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
// Asks why something is being reported, in a pop-up (a sheet from the
// bottom on phones). Resolves with the reason ("" when they skip it) or
// null when they close it without sending.
function askReportReason(what) {
  return new Promise(function (resolve) {
    const { dialog, body } = makeDialog("Report this " + what);
    let answer = null;
    const form = el("form", "form report-form");
    form.appendChild(el("p", "muted", "Only the site owner sees reports. Why are you reporting it? (optional)"));
    const reasons = el("div", "feedback-kinds");
    const box = el("textarea", "");
    box.rows = 3;
    box.maxLength = 500;
    box.setAttribute("aria-label", "Reason");
    for (const reason of ["Spam", "Harassment", "Spoilers", "Offensive"]) {
      const chip = el("button", "genre-choice", reason);
      chip.type = "button";
      chip.addEventListener("click", () => {
        box.value = reason;
        reasons.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b === chip ? "true" : "false"));
      });
      reasons.appendChild(chip);
    }
    const buttons = el("div", "form-buttons");
    const send = el("button", "button", "Send report");
    send.type = "submit";
    const cancel = el("button", "button button-secondary", "Cancel");
    cancel.type = "button";
    cancel.addEventListener("click", () => dialog.close());
    buttons.append(send, cancel);
    form.append(reasons, box, buttons);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      answer = box.value.trim().slice(0, 500);
      dialog.close();
    });
    body.appendChild(form);
    dialog.addEventListener("close", () => {
      dialog.remove();
      resolve(answer);
    });
    dialog.showModal();
  });
}

async function sendReport(kind, id, button) {
  const what = kind === "log" ? "review" : "profile";
  const reason = await askReportReason(what);
  if (reason === null) return; // they closed it

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
const ICON_BELL =
  '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>';
const ICON_SHIELD =
  '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>';

// A small number on the bell: follow requests waiting for you, plus
// likes and comments on your reviews and posts since you last opened
// the notifications page (that moment is kept in this browser).
const ACTIVITY_SEEN_KEY = "reddle-activity-seen-";

function activitySeenAt() {
  try {
    const key = ACTIVITY_SEEN_KEY + currentUserId;
    let seen = localStorage.getItem(key);
    if (!seen) {
      // First time on this device: start counting from now.
      seen = new Date().toISOString();
      localStorage.setItem(key, seen);
    }
    return seen;
  } catch (error) {
    return new Date().toISOString();
  }
}

function markActivitySeen() {
  try {
    localStorage.setItem(ACTIVITY_SEEN_KEY + currentUserId, new Date().toISOString());
  } catch (error) {
    // private window: the badge just stays as it is
  }
}

// Admins: how many feedback reports are still "new", on the shield.
async function showNewFeedbackBadge(button) {
  const { count } = await db.from("feedback").select("id", { count: "exact", head: true }).eq("status", "new");
  if (!count) return;
  button.appendChild(el("span", "nav-badge", count > 9 ? "9+" : String(count)));
  button.setAttribute("aria-label", "Admin (" + count + " new " + (count === 1 ? "report" : "reports") + ")");
}

async function showRequestBadge(bell) {
  const onNotificationsPage = /notifications\.html$/.test(window.location.pathname);
  const [requests, activity] = await Promise.all([
    db.from("follow_requests").select("requester_id", { count: "exact", head: true }).eq("target_id", currentUserId),
    onNotificationsPage ? Promise.resolve({ data: 0 }) : db.rpc("unread_activity_count", { since: activitySeenAt() }),
  ]);
  const count = (requests.count || 0) + (Number(activity.data) || 0);
  if (!count) return;
  const badge = el("span", "nav-badge", count > 9 ? "9+" : String(count));
  bell.appendChild(badge);
  bell.setAttribute("aria-label", "Notifications (" + count + " new)");
}

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

// Inside the installed app iPhones have no browser Back button, so
// every page but the home page gets one at the left of the header.
function addAppBackButton() {
  if (!isInstalledApp() || document.querySelector(".page-home") || document.getElementById("app-back")) return;
  const logo = document.querySelector(".site-header .logo");
  if (!logo) return;
  const back = el("button", "app-back");
  back.id = "app-back";
  back.type = "button";
  back.setAttribute("aria-label", "Back");
  back.title = "Back";
  back.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>';
  back.addEventListener("click", () => {
    if (window.history.length > 1) window.history.back();
    else window.location.href = "index.html";
  });
  logo.before(back);
}

async function setupHeader() {
  const nav = document.getElementById("site-nav");
  addAppBackButton();

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
    addLoggedOutFooter();
    buildBottomBar(null);
    setUpPhoneMenu(null, false);
    return { user: null, profile: null };
  }

  const profile = await ensureProfile(user);

  if (!profile) {
    // Logged in but no username yet (for example after Google sign in).
    if (!isOnPage("choose-username.html")) {
      window.location.href = "choose-username.html";
    }
    const logOutButton = makeNavButton("button", null, "Log out", ICON_LOG_OUT);
    logOutButton.classList.add("nav-log-out");
    logOutButton.addEventListener("click", logOut);
    nav.textContent = "";
    nav.append(logOutButton);
    setUpPhoneMenu(null, true);
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
    const adminButton = makeNavButton("a", "admin.html", "Admin", ICON_SHIELD);
    adminButton.classList.add("nav-bell"); // room for the badge
    buttons.push(adminButton);
    showNewFeedbackBadge(adminButton).catch(() => {});
  }
  const bell = makeNavButton("a", "notifications.html", "Notifications", ICON_BELL);
  bell.classList.add("nav-bell");
  buttons.push(bell);
  showRequestBadge(bell).catch(() => {}); // the badge is a nice extra; never break the page
  buttons.push(makeNavButton("a", "settings.html", "Settings", ICON_GEAR));
  const logOutButton = makeNavButton("button", null, "Log out", ICON_LOG_OUT);
  logOutButton.classList.add("nav-log-out");
  logOutButton.addEventListener("click", logOut);
  buttons.push(logOutButton);

  nav.textContent = "";
  nav.append(...buttons);
  addFooterExtras(profile);
  buildBottomBar(profile);
  setUpPhoneMenu(profile, true);

  // Google sign in and email confirmation links land on the home page.
  // If they started logging in from another page, go back there.
  const onHomePage = isOnPage("index.html") || window.location.pathname.endsWith("/");
  if (onHomePage && profile.onboarded && returnPage(false)) goBackAfterLogin();

  return { user: user, profile: profile };
}

// ---------- Phones: bottom bar and menu ----------
//
// On phones (and phones turned sideways) the header is just the logo,
// the day/night switch and a menu button; the main places live in a bar
// at the bottom, where thumbs reach. CSS decides when it shows (see
// "Phones: bottom bar" in style.css); computers never see it.
//   Logged in:  Home, Search, Add (log a book), Alerts, Profile
//   Logged out: Home, Search, Log in, Sign up
// Everything else (Genres, Popular, Settings, Admin, Log out and the
// footer links) is in the menu.

const ICON_HOME =
  '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h5v-6h4v6h5V9.5"/></svg>';
const ICON_SEARCH =
  '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';
const ICON_ADD =
  '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>';
const ICON_LOG_IN =
  '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/></svg>';
const ICON_SIGN_UP =
  '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0"/><path d="M19 8v6M16 11h6"/></svg>';

// Which tab is the page we're on?
function currentTab(profile) {
  const params = new URLSearchParams(window.location.search);
  if (isOnPage("search.html")) return params.get("log") === "1" ? "add" : "search";
  if (isOnPage("notifications.html")) return "alerts";
  if (isOnPage("login.html")) return "login";
  if (isOnPage("signup.html")) return "signup";
  if (profile && pageParam("u") === profile.username) return "profile";
  if (isOnPage("index.html") || window.location.pathname.endsWith("/")) return "home";
  return "";
}

function makeTab(name, href, label, icon) {
  const tab = el("a", "tab-button");
  tab.href = href;
  tab.dataset.tab = name;
  tab.innerHTML = icon;
  tab.appendChild(el("span", "tab-label", label));
  return tab;
}

function buildBottomBar(profile) {
  if (document.querySelector(".bottom-bar")) return;
  const bar = el("nav", "bottom-bar");
  bar.setAttribute("aria-label", "Main");
  let tabs;
  if (profile) {
    const alerts = makeTab("alerts", "notifications.html", "Alerts", ICON_BELL.replace(/18/g, "24"));
    alerts.classList.add("nav-bell");
    showRequestBadge(alerts).catch(() => {});
    const me = makeTab("profile", profileLink(profile.username), "Profile", "");
    const avatar = makeAvatar(profile, "avatar-tab");
    me.prepend(avatar);
    tabs = [
      makeTab("home", "index.html", "Home", ICON_HOME),
      makeTab("search", "search.html", "Search", ICON_SEARCH),
      makeTab("add", "search.html?log=1", "Add", ICON_ADD),
      alerts,
      me,
    ];
  } else {
    tabs = [
      makeTab("home", "index.html", "Home", ICON_HOME),
      makeTab("search", "search.html", "Search", ICON_SEARCH),
      makeTab("login", "login.html", "Log in", ICON_LOG_IN),
      makeTab("signup", "signup.html", "Sign up", ICON_SIGN_UP),
    ];
  }
  const here = currentTab(profile);
  for (const tab of tabs) {
    if (tab.dataset.tab === here) tab.setAttribute("aria-current", "page");
    bar.appendChild(tab);
  }
  document.body.appendChild(bar);
  document.documentElement.classList.add("has-bottom-bar");
}

// The menu (top right on phones): a sheet with every other place.
function openPhoneMenu(profile) {
  const { dialog, body } = makeDialog("Menu");
  dialog.classList.add("menu-sheet");
  const list = el("nav", "menu-list");
  list.setAttribute("aria-label", "More");
  function link(text, href) {
    const a = el("a", "menu-item", text);
    a.href = href;
    list.appendChild(a);
    return a;
  }
  function action(text, onClick, className) {
    const button = el("button", "menu-item" + (className ? " " + className : ""), text);
    button.type = "button";
    button.addEventListener("click", () => {
      dialog.close();
      onClick();
    });
    list.appendChild(button);
    return button;
  }
  function divider() {
    list.appendChild(el("hr", "menu-divider"));
  }

  // Books, Comics, Manga
  if (currentUniverse() === "books") {
    action("Enter Comic Mode", () => goToUniverse("comics"), "menu-universe");
    action("Switch to Manga Mode", () => goToUniverse("manga"), "menu-universe");
  } else {
    action("Back to Books", () => goToUniverse("books"), "menu-universe");
  }
  divider();
  link("Genres", "genres.html");
  link("Popular this week", "popular.html");
  link("Book to screen", "screen.html");
  link("Reading news", "news.html");
  link("Books of the week", "picks.html");
  divider();
  if (profile) {
    link("Settings", "settings.html");
    if (currentIsAdmin) {
      const admin = link("Admin", "admin.html");
      admin.classList.add("nav-bell");
      showNewFeedbackBadge(admin).catch(() => {});
    }
    action("Feedback", () => openFeedbackDialog("other"));
    action("Report a bug", () => openFeedbackDialog("bug"));
    action("Invite friends", () => openInviteDialog(profile));
  } else if (!currentUserId) {
    action("Report a bug", () => openFeedbackDialog("bug"));
  }
  if (canOfferInstall()) action("Install app", startInstall);
  divider();
  link("About", "about.html");
  link("Privacy", "privacy.html");
  link("Terms", "terms.html");
  link("Contact", "about.html#contact");
  if (profile || phoneMenuLoggedIn) {
    divider();
    action("Log out", logOut, "menu-log-out");
  }
  body.appendChild(list);
  dialog.addEventListener("close", () => dialog.remove());
  dialog.showModal();
}

let phoneMenuLoggedIn = false; // logged in but no username yet

function setUpPhoneMenu(profile, loggedIn) {
  phoneMenuLoggedIn = loggedIn;
  const button = document.getElementById("menu-button");
  if (!button || button.dataset.ready) return;
  button.dataset.ready = "1";
  button.hidden = false;
  button.addEventListener("click", () => openPhoneMenu(profile));
}

// The on-screen keyboard: hide the bottom bar while typing, so it never
// covers the box you're typing in.
(function watchKeyboard() {
  const typing = (target) => target && target.matches &&
    target.matches("input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=submit]):not([type=button]), textarea, select, [contenteditable=true]");
  document.addEventListener("focusin", (event) => {
    if (!typing(event.target)) return;
    document.documentElement.classList.add("keyboard-open");
    // Once the keyboard is up, make sure the box isn't hidden behind it.
    const box = event.target;
    setTimeout(() => {
      const visible = window.visualViewport ? window.visualViewport.height : window.innerHeight;
      const rect = box.getBoundingClientRect();
      if (rect.bottom > visible - 16 || rect.top < 0) box.scrollIntoView({ block: "center" });
    }, 350);
  });
  document.addEventListener("focusout", () => {
    // Wait a moment: focus may be moving to the next box.
    setTimeout(() => {
      if (!typing(document.activeElement)) document.documentElement.classList.remove("keyboard-open");
    }, 100);
  });
})();

// How much of the screen the on-screen keyboard covers, as a CSS
// variable, so pop-up sheets can sit just above it.
(function trackKeyboardHeight() {
  const viewport = window.visualViewport;
  if (!viewport) return;
  const update = () => {
    const covered = Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop));
    document.documentElement.style.setProperty("--keyboard-offset", covered + "px");
  };
  viewport.addEventListener("resize", update);
  viewport.addEventListener("scroll", update);
})();

// Text boxes (reviews, comments, posts, feedback) grow as you type, up
// to half the screen, so what you've written stays in view.
function growTextarea(box) {
  box.style.height = "auto";
  const most = Math.max(120, Math.round(window.innerHeight * 0.5));
  box.style.height = Math.min(box.scrollHeight + 2, most) + "px";
}
document.addEventListener("input", (event) => {
  if (event.target.tagName === "TEXTAREA") growTextarea(event.target);
});
document.addEventListener("focusin", (event) => {
  if (event.target.tagName === "TEXTAREA" && event.target.value) growTextarea(event.target);
});

// Start straight away. Page scripts use `await authReady`.
const authReady = setupHeader().catch(function (error) {
  console.error("Header could not load:", error);
  return { user: null, profile: null };
});
