// Reset password page. People arrive here from the link in the
// "reset your password" email. Supabase reads the link and logs them in,
// then they choose a new password.

const resetForm = document.getElementById("reset-form");
const resetMessage = document.getElementById("form-message");

// If the link was too old or already used, Supabase adds an error to the
// end of the address (after the #). Returns that message, or "".
function linkError() {
  const details = new URLSearchParams(window.location.hash.slice(1));
  return details.get("error_description") || "";
}

(async function () {
  const { user } = await authReady;

  if (!user) {
    const problem = linkError();
    resetMessage.className = "status status-error";
    resetMessage.textContent =
      (problem ? problem + ". " : "This reset link doesn't work any more. ") +
      "Links expire after an hour and work only once. ";
    const again = el("a", "", "Send a new link");
    again.href = "forgot-password.html";
    resetMessage.appendChild(again);
    return;
  }

  resetMessage.hidden = true;
  resetForm.hidden = false;
  document.getElementById("password").focus();
})();

resetForm.addEventListener("submit", async function (event) {
  event.preventDefault();

  const password = document.getElementById("password").value;
  const again = document.getElementById("password-again").value;
  if (password.length < 6) {
    return showStatus(resetMessage, "error", "Passwords need at least 6 characters.");
  }
  if (password !== again) {
    return showStatus(resetMessage, "error", "The two passwords don't match.");
  }

  const button = resetForm.querySelector("button[type=submit]");
  button.disabled = true;
  showStatus(resetMessage, "waiting", "Saving...");

  const { error } = await db.auth.updateUser({ password: password });
  button.disabled = false;

  if (error) {
    showStatus(resetMessage, "error", friendlyError(error, "Could not save. "));
    return;
  }

  resetForm.hidden = true;
  showStatus(resetMessage, "ok", "Your new password is saved and you're logged in. ");
  const { profile } = await authReady;
  const next = el("a", "", "Go to your profile");
  next.href = profile ? profileLink(profile.username) : "index.html";
  resetMessage.appendChild(next);
});
