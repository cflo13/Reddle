// Log in page: email + password, or Google.

const loginForm = document.getElementById("login-form");
const loginMessage = document.getElementById("form-message");

function showLoginMessage(kind, text) {
  loginMessage.className = "status status-" + kind;
  loginMessage.textContent = text;
  loginMessage.hidden = false;
}

// Already logged in? Go back to where you were (or the home page).
(async function () {
  const { profile } = await authReady;
  if (profile) goBackAfterLogin();
})();

// Shown under the form when the email isn't confirmed yet.
let resendButton = null;

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
    if (resendButton) resendButton.remove();
    if (error) {
      showLoginMessage("error", friendlyError(error));
      if (/Email not confirmed/i.test(error.message || "")) {
        resendButton = makeResendButton(email, loginMessage);
        loginMessage.after(resendButton);
      }
      return;
    }

    // First login after confirming the email creates the profile here.
    const profile = await ensureProfile(data.user);
    if (!profile) {
      window.location.href = "choose-username.html";
    } else if (!profile.onboarded) {
      window.location.href = "welcome.html"; // first time: say hello
    } else {
      goBackAfterLogin(); // the page they were on, or the home page
    }
  } catch (error) {
    showLoginMessage("error", friendlyError(error, "Something went wrong. "));
  } finally {
    button.disabled = false;
  }
});

document.getElementById("google-button").addEventListener("click", function () {
  signInWithGoogle(showLoginMessage);
});
