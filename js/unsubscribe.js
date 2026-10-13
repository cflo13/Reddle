// ------------------------------------------------------------
// Unsubscribe: unsubscribe.html?token=...&kind=...
// ------------------------------------------------------------
// The link at the bottom of every Reddle email. Pressing the button asks
// the notify-email Edge Function to turn those emails off. Works without
// logging in (the token in the link says who you are).
// ------------------------------------------------------------

const unsubParams = new URLSearchParams(window.location.search);
const unsubToken = unsubParams.get("token") || "";
const unsubKind = unsubParams.get("kind") || "all";
const unsubWhat = {
  all: "all Reddle notification emails",
  new_followers: "emails about new followers",
  follow_requests: "emails about follow requests",
  comments: "emails about comments on your reviews",
}[unsubKind];

const unsubButton = document.getElementById("unsubscribe-button");
const unsubMessage = document.getElementById("unsubscribe-message");

if (!unsubWhat || !/^[0-9a-f-]{36}$/i.test(unsubToken)) {
  document.getElementById("unsubscribe-question").textContent = "This unsubscribe link doesn't look right.";
  unsubButton.hidden = true;
} else {
  document.getElementById("unsubscribe-question").textContent = "Stop " + unsubWhat + "?";
}

unsubButton.addEventListener("click", async function () {
  unsubButton.disabled = true;
  showStatus(unsubMessage, "waiting", "Unsubscribing...");
  try {
    const response = await fetch(
      SUPABASE_URL + "/functions/v1/notify-email?unsubscribe=" + encodeURIComponent(unsubToken) + "&kind=" + encodeURIComponent(unsubKind),
      { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }
    );
    const result = await response.json();
    if (!result.unsubscribed) throw new Error("This unsubscribe link has expired. You can change your emails in Settings.");
    unsubButton.hidden = true;
    showStatus(unsubMessage, "ok", "Done. You won't get " + unsubWhat + " any more. You can turn them back on in Settings.");
  } catch (error) {
    unsubButton.disabled = false;
    showStatus(unsubMessage, "error", friendlyError(error));
  }
});
