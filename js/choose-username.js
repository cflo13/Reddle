// Choose username page. People land here when they are logged in but have
// no username yet, for example after signing in with Google for the first
// time, or if their username was taken while they were confirming their email.

const chooseForm = document.getElementById("username-form");
const chooseInput = document.getElementById("username");
const chooseHint = document.getElementById("username-hint");
const chooseMessage = document.getElementById("form-message");

function showChooseMessage(kind, text) {
  chooseMessage.className = "status status-" + kind;
  chooseMessage.textContent = text;
  chooseMessage.hidden = false;
}

chooseInput.addEventListener("input", function () {
  chooseInput.value = chooseInput.value.toLowerCase().trim();
  const problem = checkUsernameFormat(chooseInput.value);
  chooseHint.textContent = problem || "Your profile link: " + profileLink(chooseInput.value);
  chooseHint.classList.toggle("hint-error", problem !== "");
});

(async function () {
  const { user, profile } = await authReady;

  // Not logged in: nothing to do here.
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  // Already has a username: go to the profile.
  if (profile) {
    window.location.href = profileLink(profile.username);
    return;
  }

  chooseForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    const username = chooseInput.value;
    const problem = checkUsernameFormat(username);
    if (problem) return showChooseMessage("error", problem);

    const button = chooseForm.querySelector("button[type=submit]");
    button.disabled = true;

    try {
      if (await isUsernameTaken(username)) {
        showChooseMessage("error", "That username is taken. Try another one.");
        return;
      }
      const saveProblem = await createProfile(user.id, username);
      if (saveProblem) {
        showChooseMessage("error", saveProblem);
        return;
      }
      window.location.href = profileLink(username);
    } catch (error) {
      showChooseMessage("error", "Something went wrong: " + error.message);
    } finally {
      button.disabled = false;
    }
  });
})();
