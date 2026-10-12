// ------------------------------------------------------------
// Settings page: change your username, email and password.
// ------------------------------------------------------------

let settingsUser = null;
let settingsProfile = null;


// ---------- Username ----------

const usernameForm = document.getElementById("username-form");
const usernameInput = document.getElementById("username");
const usernameHint = document.getElementById("username-hint");
const usernameMessage = document.getElementById("username-message");

// Lowercase as you type and check the rules straight away.
usernameInput.addEventListener("input", function () {
  usernameInput.value = usernameInput.value.toLowerCase().trim();
  const problem = checkUsernameFormat(usernameInput.value);
  usernameHint.textContent =
    problem || "Your new profile link: " + profileLink(usernameInput.value);
  usernameHint.classList.toggle("hint-error", problem !== "");
});

usernameForm.addEventListener("submit", async function (event) {
  event.preventDefault();
  const newName = usernameInput.value;

  if (newName === settingsProfile.username) {
    return showStatus(usernameMessage, "ok", "That's already your username.");
  }
  const problem = checkUsernameFormat(newName);
  if (problem) return showStatus(usernameMessage, "error", problem);

  const button = usernameForm.querySelector("button[type=submit]");
  button.disabled = true;
  showStatus(usernameMessage, "waiting", "Saving...");

  try {
    if (await isUsernameTaken(newName)) {
      showStatus(usernameMessage, "error", "That username is taken. Try another one.");
      return;
    }
    // The database remembers the old name, so old links still work
    // (supabase/step8-old-usernames.sql).
    const { error } = await db
      .from("profiles")
      .update({ username: newName })
      .eq("id", settingsProfile.id);
    if (error) {
      const taken = error.code === "23505";
      showStatus(usernameMessage, "error", taken ? "Sorry, that username was just taken." : "Could not save: " + error.message);
      return;
    }

    settingsProfile.username = newName;
    showStatus(usernameMessage, "ok", "Saved. You're now @" + newName + ".");
    // Update the name in the header too.
    const headerName = document.querySelector(".nav-username");
    if (headerName) headerName.textContent = "@" + newName;
    const profileItem = document.querySelector(".account-menu-items a");
    if (profileItem) profileItem.href = profileLink(newName);
  } finally {
    button.disabled = false;
  }
});


// ---------- Email ----------

const emailForm = document.getElementById("email-form");
const emailMessage = document.getElementById("email-message");

function showEmails() {
  document.getElementById("current-email").textContent = settingsUser.email;
  const pending = document.getElementById("pending-email");
  // Supabase keeps the new address here until it's confirmed.
  if (settingsUser.new_email) {
    pending.textContent = "Waiting for you to confirm " + settingsUser.new_email + ". Check that inbox.";
    pending.hidden = false;
  } else {
    pending.hidden = true;
  }
}

emailForm.addEventListener("submit", async function (event) {
  event.preventDefault();
  const newEmail = document.getElementById("email").value.trim();
  if (newEmail.toLowerCase() === (settingsUser.email || "").toLowerCase()) {
    return showStatus(emailMessage, "ok", "That's already your email.");
  }

  const button = emailForm.querySelector("button[type=submit]");
  button.disabled = true;
  showStatus(emailMessage, "waiting", "Sending confirmation...");

  const { data, error } = await db.auth.updateUser(
    { email: newEmail },
    { emailRedirectTo: pageAddress("settings.html") }
  );
  button.disabled = false;

  if (error) {
    showStatus(emailMessage, "error", "Could not change your email: " + error.message);
    return;
  }
  settingsUser = data.user;
  showEmails();
  showStatus(
    emailMessage,
    "ok",
    "Almost done. We sent a confirmation link to " + newEmail +
      " (and maybe your old address too). Your email changes once you click it."
  );
  emailForm.reset();
});


// ---------- Password ----------

const passwordForm = document.getElementById("password-form");
const passwordMessage = document.getElementById("password-message");

passwordForm.addEventListener("submit", async function (event) {
  event.preventDefault();
  const password = document.getElementById("password").value;
  const again = document.getElementById("password-again").value;
  if (password.length < 6) {
    return showStatus(passwordMessage, "error", "Passwords need at least 6 characters.");
  }
  if (password !== again) {
    return showStatus(passwordMessage, "error", "The two passwords don't match.");
  }

  const button = passwordForm.querySelector("button[type=submit]");
  button.disabled = true;
  showStatus(passwordMessage, "waiting", "Saving...");
  const { error } = await db.auth.updateUser({ password: password });
  button.disabled = false;

  if (error) {
    showStatus(passwordMessage, "error", "Could not change your password: " + error.message);
    return;
  }
  showStatus(passwordMessage, "ok", "Your password is changed.");
  passwordForm.reset();
});


// ---------- Start ----------

(async function () {
  const { user, profile } = await authReady;
  if (!user || !profile) {
    window.location.href = "login.html";
    return;
  }
  settingsUser = user;
  settingsProfile = profile;

  usernameInput.value = profile.username;
  showEmails();

  document.getElementById("loading").hidden = true;
  document.getElementById("settings").hidden = false;
})();
