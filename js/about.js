// About page: shows the contact email from js/config.js.

const contactText = document.getElementById("contact-text");

if (CONTACT_EMAIL) {
  contactText.textContent = "Questions, ideas or problems? Email ";
  const link = el("a", "", CONTACT_EMAIL);
  link.href = "mailto:" + CONTACT_EMAIL;
  contactText.appendChild(link);
  contactText.appendChild(document.createTextNode("."));
} else {
  contactText.textContent = "Use the Feedback link at the bottom of any page (once you are logged in).";
}
