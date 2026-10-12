// Sign up page: email, password and username.

const signupForm = document.getElementById("signup-form");
const usernameInput = document.getElementById("username");
const usernameHint = document.getElementById("username-hint");
const signupMessage = document.getElementById("form-message");

// Show a message under the form. kind is "ok" or "error".
function showSignupMessage(kind, text) {
  signupMessage.className = "status status-" + kind;
  signupMessage.textContent = text;
  signupMessage.hidden = false;
}

// Usernames are always lowercase, so lowercase whatever is typed and
// check the format while the user types.
usernameInput.addEventListener("input", function () {
  usernameInput.value = usernameInput.value.toLowerCase().trim();
  const problem = checkUsernameFormat(usernameInput.value);
  usernameHint.textContent = problem || "Your profile link: " + profileLink(usernameInput.value);
  usernameHint.classList.toggle("hint-error", problem !== "");
});

signupForm.addEventListener("submit", async function (event) {
  event.preventDefault(); // stop the browser reloading the page

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const username = usernameInput.value;

  const problem = checkUsernameFormat(username);
  if (problem) return showSignupMessage("error", problem);
  if (password.length < 6) {
    return showSignupMessage("error", "Passwords need at least 6 characters.");
  }

  const button = signupForm.querySelector("button[type=submit]");
  button.disabled = true;
  showSignupMessage("ok", "Creating your account...");

  try {
    if (await isUsernameTaken(username)) {
      showSignupMessage("error", "That username is taken. Try another one.");
      return;
    }

    // Create the login. The username is stored on the account too, so we
    // can create the profile later if Supabase asks for email confirmation.
    const { data, error } = await db.auth.signUp({
      email: email,
      password: password,
      options: { data: { username: username } },
    });
    if (error) {
      showSignupMessage("error", friendlyError(error));
      return;
    }

    if (!data.session) {
      // Supabase sent a confirmation email. The database already created
      // the profile; if it couldn't, ensureProfile in auth.js deals with it
      // when they log in.
      showSignupMessage(
        "ok",
        "Almost done! Check your email and click the confirmation link, then log in."
      );
      signupForm.reset();
      signupMessage.after(makeResendButton(email, signupMessage));
      return;
    }

    // Logged in straight away. The database usually created the profile
    // already (supabase/step2-profile-trigger.sql); ensureProfile finds it,
    // or creates it if not.
    // New accounts go to the welcome page first.
    const profile = await ensureProfile(data.user);
    window.location.href = profile ? "welcome.html" : "choose-username.html";
  } catch (error) {
    showSignupMessage("error", friendlyError(error, "Something went wrong. "));
  } finally {
    button.disabled = false;
  }
});

document.getElementById("google-button").addEventListener("click", function () {
  signInWithGoogle(showSignupMessage);
});
