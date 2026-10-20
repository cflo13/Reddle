// Highlights today's opening hours and says whether the salon is open now (UK time).
(function showOpenNow() {
  var parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date());

  var get = function (type) {
    return parts.find(function (p) { return p.type === type; }).value;
  };
  var day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  var minutes = Number(get("hour")) * 60 + Number(get("minute"));

  var row = document.querySelector('.hours-table tr[data-day="' + day + '"]');
  if (row) row.classList.add("is-today");

  // Tuesday (2) to Saturday (6), 9:30am to 5pm
  var openDay = day >= 2 && day <= 6;
  var isOpen = openDay && minutes >= 9 * 60 + 30 && minutes < 17 * 60;

  var note = document.getElementById("open-now");
  if (!note) return;
  if (isOpen) {
    note.textContent = "Open now until 5pm";
  } else {
    note.textContent = "Closed now";
    note.classList.add("is-closed");
  }
  note.hidden = false;
})();

// On phones, a call bar slides up once the hero buttons are off screen.
(function setUpCallBar() {
  var bar = document.getElementById("call-bar");
  var actions = document.querySelector(".hero-actions");
  var contact = document.getElementById("contact");
  if (!bar || !actions || !("IntersectionObserver" in window)) return;

  var heroVisible = true;
  var contactVisible = false;

  function update() {
    var show = !heroVisible && !contactVisible;
    bar.classList.toggle("is-visible", show);
    bar.setAttribute("aria-hidden", show ? "false" : "true");
    bar.querySelectorAll("a").forEach(function (link) {
      link.tabIndex = show ? 0 : -1;
    });
  }

  new IntersectionObserver(function (entries) {
    heroVisible = entries[0].isIntersecting;
    update();
  }).observe(actions);

  // Hide it again over the contact section, which has its own buttons
  new IntersectionObserver(function (entries) {
    contactVisible = entries[0].isIntersecting;
    update();
  }, { threshold: 0.3 }).observe(contact);

  document.body.classList.add("has-call-bar");
})();
