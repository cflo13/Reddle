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

// The address of a page on this site, for links in emails.
// Works both on the live site and when testing from a file.
function pageAddress(fileName) {
  return new URL(fileName, window.location.href).href;
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
  return "Could not save your username: " + error.message;
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
  return "profile.html?u=" + encodeURIComponent(username);
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

  const homePage = new URL("index.html", window.location.href).href;
  const { error } = await db.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: homePage },
  });
  if (error) showMessage("error", error.message);
  // If there was no error the browser is now on its way to Google.
  // When the user comes back, auth.js sees they have no username yet and
  // sends them to choose-username.html.
}


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

async function setupHeader() {
  const nav = document.getElementById("site-nav");

  // Supabase not set up yet (js/config.js still empty): show nothing.
  if (!db) return { user: null, profile: null };

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

  // Logged in with a profile: picture + @username (both link to the
  // profile page) and a log out button.
  const link = document.createElement("a");
  link.className = "nav-profile";
  link.href = profileLink(profile.username);

  const avatar = makeAvatar(profile, "avatar-small");
  avatar.id = "header-avatar"; // profile.js updates this after an upload
  link.appendChild(avatar);

  const name = document.createElement("span");
  name.textContent = "@" + profile.username;
  link.appendChild(name);

  const logOutButton = document.createElement("button");
  logOutButton.type = "button";
  logOutButton.className = "link-button";
  logOutButton.textContent = "Log out";
  logOutButton.addEventListener("click", logOut);

  nav.textContent = "";
  nav.appendChild(link);
  nav.appendChild(logOutButton);

  return { user: user, profile: profile };
}

// Start straight away. Page scripts use `await authReady`.
const authReady = setupHeader().catch(function (error) {
  console.error("Header could not load:", error);
  return { user: null, profile: null };
});
