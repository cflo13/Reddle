// Pages that are mostly text (Privacy, Terms, Delete account) need little
// code of their own. The header and footer are handled by auth.js.

// Contact links: the address is written in the page (so it works without
// JavaScript) and kept in step with CONTACT_EMAIL in js/config.js here.
if (typeof CONTACT_EMAIL !== "undefined" && CONTACT_EMAIL) {
  document.querySelectorAll("[data-contact-email]").forEach(function (link) {
    const subject = link.dataset.contactEmail; // e.g. "Delete my Reddle account"
    link.href = "mailto:" + CONTACT_EMAIL + (subject ? "?subject=" + encodeURIComponent(subject) : "");
    link.textContent = CONTACT_EMAIL;
  });
}
