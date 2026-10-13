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
      showStatus(usernameMessage, "error", taken ? "Sorry, that username was just taken." : friendlyError(error, "Could not save. "));
      return;
    }

    settingsProfile.username = newName;
    showStatus(usernameMessage, "ok", "Saved. You're now @" + newName + ".");
    // Update the name in the header too.
    const headerName = document.querySelector(".nav-username");
    if (headerName) headerName.textContent = "@" + newName;
    const profileItem = document.querySelector("a.nav-profile");
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
    showStatus(emailMessage, "error", friendlyError(error, "Could not change your email. "));
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
    showStatus(passwordMessage, "error", friendlyError(error, "Could not change your password. "));
    return;
  }
  showStatus(passwordMessage, "ok", "Your password is changed.");
  passwordForm.reset();
});


// ---------- Delete account ----------

const deleteForm = document.getElementById("delete-form");
const deleteInput = document.getElementById("delete-confirm");
const deleteButton = deleteForm.querySelector("button[type=submit]");
const deleteMessage = document.getElementById("delete-message");

// The button only works once the username is typed exactly.
deleteInput.addEventListener("input", function () {
  deleteButton.disabled = deleteInput.value.trim().toLowerCase() !== settingsProfile.username;
});

deleteForm.addEventListener("submit", async function (event) {
  event.preventDefault();
  if (deleteInput.value.trim().toLowerCase() !== settingsProfile.username) return;

  deleteButton.disabled = true;
  showStatus(deleteMessage, "waiting", "Deleting your account...");

  // 1. Delete the account. The database deletes the profile, logs,
  //    follows and shelves with it (supabase/step9-delete-account.sql).
  const { error } = await db.rpc("delete_my_account");
  if (error) {
    const missing = error.code === "PGRST202"; // the function isn't installed
    showStatus(
      deleteMessage,
      "error",
      missing
        ? "Deleting accounts isn't switched on yet. Nothing was deleted. Please contact us and we'll delete it for you."
        : friendlyError(error, "Could not delete your account. ") + " Nothing was deleted."
    );
    deleteButton.disabled = false;
    return;
  }

  // 2. Delete the profile picture and the pictures attached to posts.
  //    Pictures live in Storage, so the database can't delete them
  //    itself. Your login still works for a few more seconds, which is
  //    enough for this. Fine if there aren't any.
  await db.storage.from("avatars").remove([settingsProfile.id + "/avatar.jpg"]);
  await removeUserPictures(settingsProfile.id).catch(() => {});

  // 3. Forget the login on this device and say goodbye.
  await db.auth.signOut({ scope: "local" });
  window.location.href = "index.html?deleted=1";
});


// ---------- Start ----------

// ---------- Privacy: private profile ----------

function setUpPrivacy(profile) {
  const box = document.getElementById("private-input");
  const message = document.getElementById("private-message");
  box.checked = !!profile.is_private;
  box.addEventListener("change", async function () {
    box.disabled = true;
    const { error } = await db.from("profiles").update({ is_private: box.checked }).eq("id", profile.id);
    box.disabled = false;
    if (error) {
      box.checked = !box.checked;
      showStatus(message, "error", friendlyError(error, "Could not save. "));
      return;
    }
    profile.is_private = box.checked;
    showStatus(message, "ok", box.checked
      ? "Your profile is private. New followers will send you a request."
      : "Your profile is public. Anyone can see your books.");
  });
}


// ---------- Email notifications (supabase/step21) ----------
// No saved row means everything is on.

async function setUpEmailPrefs(profile) {
  // Only shown once notification emails are switched on (js/config.js).
  if (typeof EMAILS_ON === "undefined" || !EMAILS_ON) return;
  document.getElementById("email-section").hidden = false;
  const boxes = document.querySelectorAll(".email-pref");
  const message = document.getElementById("email-pref-message");
  const { data } = await db.from("email_prefs").select("new_followers, follow_requests, comments").eq("user_id", profile.id).maybeSingle();
  boxes.forEach(function (box) {
    box.checked = data ? data[box.dataset.pref] !== false : true;
    box.addEventListener("change", async function () {
      box.disabled = true;
      const { error } = await db.from("email_prefs").upsert(
        { user_id: profile.id, [box.dataset.pref]: box.checked, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );
      box.disabled = false;
      if (error) {
        box.checked = !box.checked;
        showStatus(message, "error", friendlyError(error, "Could not save. "));
        return;
      }
      showStatus(message, "ok", "Saved.");
    });
  });
}


// ---------- Blocked and muted ----------

async function loadBlockedAndMuted() {
  const list = document.getElementById("blocked-list");
  const { data, error } = await db.rpc("my_blocks_and_mutes");
  list.textContent = "";
  if (error) {
    list.appendChild(el("p", "status status-error", friendlyError(error, "Couldn't load this list. ")));
    return;
  }
  if (data.length === 0) {
    list.appendChild(el("p", "muted", "You haven't blocked or muted anyone."));
    return;
  }
  for (const row of data) {
    const item = el("div", "person-row");
    item.appendChild(makeAvatar(row, "avatar-small"));
    item.appendChild(el("span", "person-row-name", "@" + row.username));
    item.appendChild(el("span", "muted", row.kind === "block" ? "Blocked" : "Muted"));
    const undo = el("button", "button button-secondary", row.kind === "block" ? "Unblock" : "Unmute");
    undo.type = "button";
    undo.addEventListener("click", async function () {
      undo.disabled = true;
      try {
        if (row.kind === "block") await unblockPerson(row.user_id);
        else await setMuted(row.user_id, false);
        await loadBlockedAndMuted();
      } catch (error) {
        undo.disabled = false;
        window.alert(friendlyError(error, "Something went wrong. "));
      }
    });
    item.appendChild(undo);
    list.appendChild(item);
  }
}


(async function () {
  const { user, profile } = await authReady;
  if (!user || !profile) {
    window.location.href = "login.html";
    return;
  }
  settingsUser = user;
  settingsProfile = profile;

  usernameInput.value = profile.username;
  document.getElementById("delete-username").textContent = profile.username;
  showEmails();

  setUpPrivacy(profile);
  setUpEmailPrefs(profile).catch(() => {});
  loadBlockedAndMuted();

  document.getElementById("loading").hidden = true;
  document.getElementById("settings").hidden = false;
})();
