// Log in page: email + password, or Google.

const loginForm = document.getElementById("login-form");
const loginMessage = document.getElementById("form-message");

function showLoginMessage(kind, text) {
  loginMessage.className = "status status-" + kind;
  loginMessage.textContent = text;
  loginMessage.hidden = false;
}

// Already logged in? Go to your profile instead.
(async function () {
  const { profile } = await authReady;
  if (profile) window.location.href = profileLink(profile.username);
})();

loginForm.addEventListener("submit", async function (event) {
  event.preventDefault(); // stop the browser reloading the page

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  const button = loginForm.querySelector("button[type=submit]");
  button.disabled = true;
  showLoginMessage("ok", "Logging in...");

  try {
    const { data, error } = await db.auth.signInWithPassword({
      email: email,
      password: password,
    });
    if (error) {
      showLoginMessage("error", error.message);
      return;
    }

    // First login after confirming the email creates the profile here.
    const profile = await ensureProfile(data.user);
    if (profile) {
      window.location.href = profileLink(profile.username);
    } else {
      window.location.href = "choose-username.html";
    }
  } catch (error) {
    showLoginMessage("error", "Something went wrong: " + error.message);
  } finally {
    button.disabled = false;
  }
});

document.getElementById("google-button").addEventListener("click", function () {
  signInWithGoogle(showLoginMessage);
});
