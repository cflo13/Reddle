// Forgot password page: sends an email with a link to reset-password.html.

const forgotForm = document.getElementById("forgot-form");
const forgotMessage = document.getElementById("form-message");

forgotForm.addEventListener("submit", async function (event) {
  event.preventDefault(); // stop the browser reloading the page

  const email = document.getElementById("email").value.trim();
  const button = forgotForm.querySelector("button[type=submit]");
  button.disabled = true;
  showStatus(forgotMessage, "waiting", "Sending...");

  // Supabase emails a link. Clicking it opens reset-password.html,
  // already logged in, so the new password can be saved there.
  const { error } = await db.auth.resetPasswordForEmail(email, {
    redirectTo: pageAddress("reset-password.html"),
  });
  button.disabled = false;

  if (error) {
    showStatus(forgotMessage, "error", "Could not send the email: " + error.message);
    return;
  }

  // Same message whether or not the email has an account, so nobody can
  // use this page to find out who is signed up.
  showStatus(
    forgotMessage,
    "ok",
    "If there's an account for " + email + ", a reset link is on its way. " +
      "Check your inbox (and spam folder). The link works once and expires after an hour."
  );
  forgotForm.reset();
});
