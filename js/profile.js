// ------------------------------------------------------------
// Profile page: u/USERNAME (or the old profile.html?u=USERNAME)
// ------------------------------------------------------------
// Anyone can view a profile. If it's your own, you also get the
// "Edit profile" section to change your bio and picture.
// ------------------------------------------------------------

const MAX_BIO_LENGTH = 300;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB, in bytes
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const AVATAR_SIZE = 256; // pixels, width and height

const profileArea = document.getElementById("profile");
const notFoundArea = document.getElementById("not-found");
const loadingArea = document.getElementById("loading");

// The profile being shown on this page. Kept up to date after edits.
let shownProfile = null;


// ---------- Showing the profile ----------

function showProfile(profile) {
  shownProfile = profile;

  const avatarSpot = document.getElementById("profile-avatar");
  avatarSpot.textContent = "";
  avatarSpot.appendChild(makeAvatar(profile, "avatar-large"));

  document.getElementById("profile-username").textContent = "@" + profile.username;

  const bio = document.getElementById("profile-bio");
  if (profile.bio) {
    bio.textContent = profile.bio; // textContent is safe: it never runs code
    bio.classList.remove("muted");
  } else {
    bio.textContent = "No bio yet.";
    bio.classList.add("muted");
  }

  setPageInfo("@" + profile.username + " \u00b7 Reddle",
    profile.bio || "@" + profile.username + " on Reddle: the books they read, their ratings and reviews.");
  loadingArea.hidden = true;
  profileArea.hidden = false;
}

function showNotFound(text) {
  document.getElementById("not-found-text").textContent = text;
  loadingArea.hidden = true;
  notFoundArea.hidden = false;
}

async function loadPage() {
  const { profile: myProfile } = await authReady;

  if (!db) {
    showNotFound("This profile couldn't load.");
    return;
  }

  // Read the ?u=USERNAME part of the address.
  // Read the username from the address (u/NAME or ?u=NAME).
  const username = (pageParam("u") || "").toLowerCase().trim();

  // No username in the address: show your own profile if you're logged in.
  if (!username) {
    if (myProfile) {
      window.location.href = profileLink(myProfile.username);
    } else {
      showNotFound("No user with that name.");
    }
    return;
  }

  const { data: profile, error } = await db
    .from("profiles")
    .select("*")
    .eq("username", username)
    .maybeSingle(); // null when there is no such user

  if (error) {
    showNotFound(friendlyError(error, "Could not load this profile. "));
    return;
  }
  if (!profile) {
    // Maybe they changed their username. If so, go to the new one.
    const newName = await findRenamedUser(username);
    if (newName) {
      window.location.replace(profileLink(newName));
      return;
    }
    showNotFound("No user with that name.");
    return;
  }

  showProfile(profile);
  useCleanAddress(profileLink(profile.username));

  const isMe = myProfile && myProfile.id === profile.id;
  document.getElementById("diary-link").href = diaryLink(profile.username);
  const yearLinkEl = document.getElementById("year-link");
  yearLinkEl.href = yearLink(profile.username, new Date().getFullYear());
  yearLinkEl.textContent = new Date().getFullYear() + " in review";
  if (isMe) setUpGoalEditing();
  const actions = document.getElementById("profile-report");
  actions.appendChild(makeShareButton("@" + profile.username + " on Reddle", "See what @" + profile.username + " is reading on Reddle", profileLink(profile.username)));
  if (isMe) {
    const invite = el("button", "link-button", "Invite friends");
    invite.type = "button";
    invite.addEventListener("click", () => openInviteDialog(profile));
    actions.appendChild(invite);
  }
  if (isMe) {
    // Your own profile: show the edit section.
    setUpEditing();
  } else if (myProfile) {
    // Someone else's profile while logged in: show the follow button
    // and a Report button.
    await setUpFollowButton(myProfile);
    const report = makeReportButton("user", profile.id, profile.id);
    if (report) actions.appendChild(report);
    await setUpBlockAndMute(actions);
  } else {
    // Logged out: invite them to log in to follow.
    document.getElementById("follow-login").hidden = false;
  }

  // Followers / Following open a list (a private profile's lists only
  // for them, approved followers and admins).
  setUpFriendLists(isMe);

  // Private profile you aren't approved for: just the top part.
  if (profile.is_private && !isMe) {
    const { data: allowed } = await db.rpc("can_see_activity", { owner: profile.id });
    if (!allowed) {
      listsAllowed = false;
      showPrivateNotice();
      await loadStats();
      return;
    }
  }

  setUpUniverseFilter();
  await Promise.all([loadStats(), loadGoal(isMe), loadShelves(isMe), loadProfileLogs()]);
}


// Looks up an old username (see supabase/step8-old-usernames.sql).
// Returns the person's current username, or null.
async function findRenamedUser(oldName) {
  const { data, error } = await db
    .from("old_usernames")
    .select("profiles(username)")
    .eq("username", oldName)
    .maybeSingle();
  if (error || !data || !data.profiles) return null;
  return data.profiles.username;
}


// ---------- Counts: books, followers, following ----------

// Counts rows in a table without downloading them ("head: true").
async function countRows(table, column, value) {
  const { count, error } = await db
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq(column, value);
  if (error) throw error;
  return count;
}

function plural(count, word) {
  return count + " " + word + (count === 1 ? "" : "s");
}

// Followers and following counts (supabase/step28-friends-lists.sql:
// the numbers show even on a private profile; the lists don't).
async function followCounts(personId) {
  const { data, error } = await db.rpc("follow_counts", { p_person: personId });
  if (!error && data) return [Number(data.followers) || 0, Number(data.following) || 0];
  return Promise.all([countRows("follows", "following_id", personId), countRows("follows", "follower_id", personId)]);
}

async function loadStats() {
  const [books, [followers, following]] = await Promise.all([
    countRows("logs", "user_id", shownProfile.id),
    followCounts(shownProfile.id),
  ]);
  document.getElementById("stat-books").textContent = plural(books, "book");
  document.getElementById("stat-followers").textContent = plural(followers, "follower");
  document.getElementById("stat-following").textContent = following + " following";
}


// ---------- Followers / Following lists ----------
// The counts are buttons; each opens a pop-up list (a sheet on phones):
// picture, @username (links to the profile) and a Follow / Following
// button, newest first, 30 at a time. Your own profile also has "Mutual
// friends" (people you follow who follow you back). The database decides
// who may see what (step28: private profiles, blocks); muted people
// show as normal.

const FRIENDS_PAGE = 30;
let listsAllowed = true; // false on a private profile you aren't approved for

const FRIEND_LISTS = {
  followers: { title: "Followers", empty: "No followers yet" },
  following: { title: "Following", empty: "Not following anyone yet" },
  mutual: { title: "Mutual friends", empty: "No mutual friends yet" },
};

function setUpFriendLists(isMe) {
  document.getElementById("stat-followers").addEventListener("click", () => openFriendList("followers", isMe));
  document.getElementById("stat-following").addEventListener("click", () => openFriendList("following", isMe));
}

// One page of a list: { people: [profile...], more: boolean }.
// One query each, with the profiles joined (the link is named because
// follows has two links to profiles).
async function fetchFriendPage(kind, offset) {
  let rows;
  if (kind === "mutual") {
    const { data, error } = await db.rpc("mutual_friends", { p_limit: FRIENDS_PAGE + 1, p_offset: offset });
    if (error) throw error;
    rows = data;
  } else {
    const followers = kind === "followers";
    const { data, error } = await db
      .from("follows")
      .select(followers
        ? "created_at, profiles!follows_follower_id_fkey(id, username, avatar_url, is_private)"
        : "created_at, profiles!follows_following_id_fkey(id, username, avatar_url, is_private)")
      .eq(followers ? "following_id" : "follower_id", shownProfile.id)
      .order("created_at", { ascending: false })
      .order(followers ? "follower_id" : "following_id", { ascending: true })
      .range(offset, offset + FRIENDS_PAGE);
    if (error) throw error;
    rows = data.map((row) => row.profiles).filter(Boolean);
  }
  return { people: rows.slice(0, FRIENDS_PAGE), more: rows.length > FRIENDS_PAGE };
}

// Your follow state for each person on a page: id -> "following" |
// "requested" | "none" (two small queries for the whole page).
async function followStates(people) {
  const states = new Map(people.map((person) => [person.id, "none"]));
  if (!currentUserId || people.length === 0) return states;
  const ids = people.map((person) => person.id);
  const [follows, requests] = await Promise.all([
    db.from("follows").select("following_id").eq("follower_id", currentUserId).in("following_id", ids),
    db.from("follow_requests").select("target_id").eq("requester_id", currentUserId).in("target_id", ids),
  ]);
  (requests.data || []).forEach((row) => states.set(row.target_id, "requested"));
  (follows.data || []).forEach((row) => states.set(row.following_id, "following"));
  return states;
}

// The Follow / Following button on a row (existing follow helpers).
function makeRowFollowButton(person, startState) {
  if (!currentUserId) {
    const link = el("a", "button friend-follow", "Follow");
    link.href = "login.html"; // remembers this page (js/auth.js)
    return link;
  }
  let state = startState;
  const button = el("button", "button friend-follow");
  button.type = "button";
  function show() {
    button.textContent = { following: "Following", requested: "Requested", none: person.is_private ? "Request" : "Follow" }[state];
    button.classList.toggle("button-secondary", state !== "none");
    button.setAttribute("aria-label", button.textContent + " @" + person.username);
  }
  show();
  button.addEventListener("click", async function () {
    button.disabled = true;
    try {
      state = state === "none" ? await followPerson(person) : await unfollowPerson(person.id);
    } catch (error) {
      alert(friendlyError(error, "Something went wrong. "));
    } finally {
      button.disabled = false;
    }
    show();
  });
  return button;
}

function makeFriendRow(person, state) {
  const row = el("li", "friend-row");
  const link = el("a", "friend-link");
  link.href = profileLink(person.username);
  link.append(makeAvatar(person, "avatar-small"), el("span", "friend-name", "@" + person.username));
  row.appendChild(link);
  if (person.id !== currentUserId) row.appendChild(makeRowFollowButton(person, state));
  return row;
}

function friendSkeleton() {
  const box = el("li", "skeleton-group");
  box.setAttribute("role", "status");
  box.setAttribute("aria-label", "Loading");
  for (let i = 0; i < 4; i++) {
    const line = el("div", "friend-skeleton");
    line.setAttribute("aria-hidden", "true");
    line.append(el("span", "skeleton sk-avatar-small"), el("span", "skeleton sk-line sk-short"));
    box.appendChild(line);
  }
  return box;
}

function openFriendList(kind, isMe) {
  const { dialog, body } = makeDialog(FRIEND_LISTS[kind].title);
  dialog.classList.add("friends-dialog");
  const heading = dialog.querySelector(".dialog-head h2");

  // The chips: Followers, Following (and Mutual friends on your own profile).
  const chips = el("div", "friend-chips");
  chips.setAttribute("role", "tablist");
  const kinds = isMe ? ["followers", "following", "mutual"] : ["followers", "following"];
  const chipButtons = {};
  for (const name of kinds) {
    const chip = el("button", "friend-chip", FRIEND_LISTS[name].title);
    chip.type = "button";
    chip.setAttribute("role", "tab");
    chip.addEventListener("click", () => show(name));
    chipButtons[name] = chip;
    chips.appendChild(chip);
  }
  body.appendChild(chips);
  const list = el("ul", "friend-list");
  body.appendChild(list);
  const more = el("button", "button button-secondary friend-more", "Load more");
  more.type = "button";
  more.hidden = true;
  const moreBox = el("p", "center");
  moreBox.appendChild(more);
  body.appendChild(moreBox);

  let current = null;
  let offset = 0;
  let loading = 0; // which load is the newest (switching chips cancels older ones)

  async function nextPage() {
    const mine = loading;
    more.disabled = true;
    try {
      const page = await fetchFriendPage(current, offset);
      const states = await followStates(page.people);
      if (mine !== loading) return;
      if (offset === 0) list.textContent = "";
      if (offset === 0 && page.people.length === 0) list.appendChild(el("li", "friend-empty", FRIEND_LISTS[current].empty));
      page.people.forEach((person) => list.appendChild(makeFriendRow(person, states.get(person.id))));
      offset += page.people.length;
      more.hidden = !page.more;
    } catch (error) {
      if (mine !== loading) return;
      list.textContent = "";
      list.appendChild(el("li", "status status-error", friendlyError(error, "The list didn't load. ")));
    } finally {
      more.disabled = false;
    }
  }

  function show(name) {
    current = name;
    offset = 0;
    loading++;
    heading.textContent = FRIEND_LISTS[name].title + (isMe ? "" : " of @" + shownProfile.username);
    for (const other of kinds) {
      chipButtons[other].classList.toggle("friend-chip-active", other === name);
      chipButtons[other].setAttribute("aria-selected", other === name ? "true" : "false");
    }
    more.hidden = true;
    list.textContent = "";
    if (!listsAllowed) {
      list.appendChild(el("li", "friend-empty", "This account is private"));
      return;
    }
    list.appendChild(friendSkeleton());
    nextPage();
  }

  more.addEventListener("click", nextPage);
  dialog.addEventListener("close", function () {
    dialog.remove();
    loadStats().catch(() => {}); // following someone in the list changes the numbers
  });
  dialog.showModal();
  show(kind);
}


// ---------- Reading goal (supabase/step19-reading-goals.sql) ----------

const goalYear = new Date().getFullYear();
let myGoal = null; // this year's target, or null

async function loadGoal(isMe) {
  const section = document.getElementById("goal-section");
  document.getElementById("goal-title").textContent = goalYear + " reading goal";
  const [goalResult, readResult] = await Promise.all([
    db.from("reading_goals").select("target").eq("user_id", shownProfile.id).eq("year", goalYear).maybeSingle(),
    db.from("logs").select("id", { count: "exact", head: true })
      .eq("user_id", shownProfile.id)
      .gte("date_read", goalYear + "-01-01")
      .lte("date_read", goalYear + "-12-31"),
  ]);
  myGoal = goalResult.data ? goalResult.data.target : null;
  const done = readResult.count || 0;

  if (!myGoal && !isMe) {
    section.hidden = true;
    return;
  }
  section.hidden = false;
  document.getElementById("goal-progress").hidden = !myGoal;
  document.getElementById("goal-set").hidden = !isMe || !!myGoal;
  document.getElementById("goal-edit").hidden = !isMe || !myGoal;
  if (myGoal) {
    const percent = Math.min(100, Math.round((done / myGoal) * 100));
    document.getElementById("goal-fill").style.width = percent + "%";
    document.getElementById("goal-text").textContent =
      done + " of " + myGoal + " books" + (done >= myGoal ? " \u2014 goal reached!" : " (" + percent + "%)");
  }
}

function setUpGoalEditing() {
  const form = document.getElementById("goal-form");
  const input = document.getElementById("goal-input");
  const message = document.getElementById("goal-message");
  const open = function () {
    form.hidden = false;
    input.value = myGoal || "";
    document.getElementById("goal-remove").hidden = !myGoal;
    document.getElementById("goal-set").hidden = true;
    input.focus();
  };
  const finish = async function (error, text) {
    message.textContent = error ? friendlyError(error, "Could not save. ") : text;
    message.classList.toggle("hint-error", !!error);
    message.hidden = false;
    if (!error) {
      form.hidden = true;
      await loadGoal(true);
    }
  };
  document.getElementById("goal-set").addEventListener("click", open);
  document.getElementById("goal-edit").addEventListener("click", open);
  document.getElementById("goal-cancel").addEventListener("click", function () {
    form.hidden = true;
    loadGoal(true);
  });
  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    const target = Number(input.value);
    if (!Number.isInteger(target) || target < 1 || target > 1000) {
      return finish({ message: "Pick a whole number from 1 to 1000." });
    }
    const { error } = await db.from("reading_goals").upsert(
      { user_id: shownProfile.id, year: goalYear, target: target },
      { onConflict: "user_id,year" }
    );
    finish(error, "Goal saved.");
  });
  document.getElementById("goal-remove").addEventListener("click", async function () {
    if (!window.confirm("Remove your " + goalYear + " reading goal?")) return;
    const { error } = await db.from("reading_goals").delete().eq("user_id", shownProfile.id).eq("year", goalYear);
    finish(error, "Goal removed.");
  });
}


// ---------- Follow / Unfollow ----------

async function setUpFollowButton(myProfile) {
  const button = document.getElementById("follow-button");
  // "following", "requested" (private profile, waiting) or "none"
  let state = await followState(shownProfile.id);

  function updateButton() {
    const words = {
      following: "Following",
      requested: "Requested",
      none: shownProfile.is_private ? "Request to follow" : "Follow",
    };
    button.textContent = words[state];
    button.classList.toggle("button-secondary", state !== "none");
  }

  updateButton();
  button.hidden = false;

  // Show "Unfollow" / "Cancel request" when hovering, like Letterboxd.
  button.addEventListener("mouseenter", function () {
    if (state === "following") button.textContent = "Unfollow";
    if (state === "requested") button.textContent = "Cancel request";
  });
  button.addEventListener("mouseleave", updateButton);

  button.addEventListener("click", async function () {
    button.disabled = true;
    try {
      state = state === "none" ? await followPerson(shownProfile) : await unfollowPerson(shownProfile.id);
    } catch (error) {
      alert(friendlyError(error, "Something went wrong. "));
    } finally {
      button.disabled = false;
    }
    updateButton();
    await loadStats();
  });
}

// Block and Mute, on other people's profiles (when logged in).
async function setUpBlockAndMute(actions) {
  const { data: muteRow } = await db.from("mutes").select("muted_id")
    .eq("muter_id", currentUserId).eq("muted_id", shownProfile.id).maybeSingle();
  let muted = !!muteRow;

  const mute = el("button", "link-button", muted ? "Unmute" : "Mute");
  mute.type = "button";
  mute.title = "Muted people's reviews stay out of your feed. They aren't told.";
  mute.addEventListener("click", async function () {
    mute.disabled = true;
    try {
      await setMuted(shownProfile.id, !muted);
      muted = !muted;
      mute.textContent = muted ? "Unmute" : "Mute";
    } catch (error) {
      alert(friendlyError(error, "Something went wrong. "));
    } finally {
      mute.disabled = false;
    }
  });

  const block = el("button", "link-button", "Block");
  block.type = "button";
  block.addEventListener("click", async function () {
    const name = "@" + shownProfile.username;
    if (!confirm("Block " + name + "? You won't see each other's profiles, logs or likes, and any follows between you are removed. They aren't told. You can undo this in Settings.")) return;
    block.disabled = true;
    try {
      await blockPerson(shownProfile.id);
      profileArea.hidden = true;
      showNotFound("You blocked " + name + ". You can undo this in Settings.");
    } catch (error) {
      block.disabled = false;
      alert(friendlyError(error, "Something went wrong. "));
    }
  });
  actions.append(mute, block);
}

// A private profile you're not approved for: only the name, picture and
// bio show. (The database hides the rest anyway.)
function showPrivateNotice() {
  document.getElementById("private-notice").hidden = false;
  ["goal-section", "reading-section", "want-section", "logs-section"].forEach(function (id) {
    const section = document.getElementById(id);
    if (section) section.hidden = true;
  });
  document.getElementById("stat-books").hidden = true;
  document.querySelector(".profile-links").hidden = true;
}


// ---------- Shelves: Currently reading / Want to read ----------

// Fills one shelf with covers, or shows `emptyText`.
function showShelf(container, books, emptyText) {
  container.textContent = "";
  if (books.length === 0) {
    container.appendChild(el("p", "muted", emptyText));
    return;
  }
  for (const book of books) container.appendChild(makeCoverLink(book));
}

// Currently reading: each cover with a progress bar underneath when
// they've saved the page they're on.
function showReadingShelf(container, rows) {
  container.textContent = "";
  for (const row of rows) {
    const item = el("div", "reading-item");
    item.appendChild(makeCoverLink(row.books));
    const total = row.books.page_count;
    if (row.current_page != null) {
      const percent = total ? Math.max(0, Math.min(100, Math.round((row.current_page / total) * 100))) : null;
      if (percent !== null) {
        const bar = el("div", "progress-bar progress-bar-small");
        const fill = el("span", "");
        fill.style.width = percent + "%";
        bar.appendChild(fill);
        item.appendChild(bar);
      }
      item.appendChild(el("span", "reading-note", percent !== null ? percent + "%" : "p. " + row.current_page));
      item.title = "Page " + row.current_page + (total ? " of " + total : "");
    }
    container.appendChild(item);
  }
}

async function loadShelves(isMe) {
  // Every shelf row for this person, newest first, with the book joined in.
  const { data: rows, error } = await db
    .from("shelves")
    .select("status, current_page, books(external_id, title, author, cover_url, page_count)")
    .eq("user_id", shownProfile.id)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const reading = rows.filter((row) => row.status === "currently_reading");
  const want = rows.filter((row) => row.status === "want_to_read").map((row) => row.books);

  document.getElementById("reading-section").hidden = reading.length === 0;
  showReadingShelf(document.getElementById("reading-books"), reading);
  showShelf(
    document.getElementById("want-books"),
    want,
    isMe ? "Nothing yet. Open a book and click \u201cWant to read\u201d." : "Nothing yet."
  );
}


// ---------- Their books ----------

// All, Books, Comics or Manga: a small filter above the list. Everything
// shows by default, whichever universe you're in.
let profileShelf = "all";

async function loadProfileLogs() {
  const universe = profileShelf;
  await showPagedLogs(
    document.getElementById("profile-logs"),
    (from, to) => {
      let query = db.from("logs");
      if (universe === "all") {
        query = query.select(LOG_FIELDS);
      } else {
        // books!inner: only logs whose book is in that universe.
        query = onlyThisUniverse(
          query.select(logFieldsWithGenres()),
          "books.genres",
          universe
        );
      }
      return query
        .eq("user_id", shownProfile.id)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to);
    },
    { showBook: true },
    universe === "all" ? "No books logged yet." : "No " + UNIVERSES[universe].noun + " logged yet."
  );
}

function setUpUniverseFilter() {
  const box = document.getElementById("universe-filter");
  if (!box || box.dataset.ready) return;
  box.dataset.ready = "yes";
  box.hidden = false;
  box.querySelectorAll("button").forEach(function (button) {
    button.addEventListener("click", function () {
      if (button.dataset.filter === profileShelf) return;
      profileShelf = button.dataset.filter;
      const buttons = box.querySelectorAll("button");
      buttons.forEach((other) => {
        other.setAttribute("aria-pressed", String(other === button));
        other.disabled = true; // one list at a time
      });
      loadProfileLogs()
        .catch((error) => console.error("Logs didn't load:", error))
        .finally(() => buttons.forEach((other) => (other.disabled = false)));
    });
  });
}


// ---------- Edit profile: bio ----------

const bioInput = document.getElementById("bio-input");
const bioCounter = document.getElementById("bio-counter");
const bioMessage = document.getElementById("bio-message");

function updateBioCounter() {
  bioCounter.textContent = bioInput.value.length + " / " + MAX_BIO_LENGTH;
}

function showSmallMessage(element, kind, text) {
  element.className = "status status-" + kind;
  element.textContent = text;
  element.hidden = false;
}

async function saveBio(event) {
  event.preventDefault();

  const newBio = bioInput.value.trim();
  if (newBio.length > MAX_BIO_LENGTH) {
    showSmallMessage(bioMessage, "error", "Your bio can be at most 300 characters.");
    return;
  }

  showSmallMessage(bioMessage, "waiting", "Saving...");

  // An empty box means "no bio", which we store as null.
  const { error } = await db
    .from("profiles")
    .update({ bio: newBio || null })
    .eq("id", shownProfile.id);

  if (error) {
    showSmallMessage(bioMessage, "error", friendlyError(error, "Could not save. "));
    return;
  }

  shownProfile.bio = newBio || null;
  showProfile(shownProfile);
  showSmallMessage(bioMessage, "ok", "Bio saved.");
}


// ---------- Edit profile: picture ----------

const avatarInput = document.getElementById("avatar-input");
const avatarMessage = document.getElementById("avatar-message");

// Turns the chosen file into a 256 x 256 JPEG, cropped from the centre.
// Returns a "Blob", which is the browser's word for a file in memory.
function makeSquareJpeg(file) {
  return new Promise(function (resolve, reject) {
    const img = new Image();
    const tempLink = URL.createObjectURL(file); // lets the <img> read the file

    img.onload = function () {
      // The biggest square that fits in the picture, in the middle.
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      const left = (img.naturalWidth - side) / 2;
      const top = (img.naturalHeight - side) / 2;

      // An invisible drawing area, 256 x 256 pixels.
      const canvas = document.createElement("canvas");
      canvas.width = AVATAR_SIZE;
      canvas.height = AVATAR_SIZE;
      const ctx = canvas.getContext("2d");

      // A plain background, so see-through PNGs don't turn black as a JPEG.
      ctx.fillStyle = themeColour("--surface");
      ctx.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);

      // Copy the square part of the picture, shrunk to 256 x 256.
      ctx.drawImage(img, left, top, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
      URL.revokeObjectURL(tempLink);

      // Save as JPEG at 85% quality. Usually about 10 to 30 KB.
      canvas.toBlob(function (blob) {
        if (blob) resolve(blob);
        else reject(new Error("Could not convert the picture."));
      }, "image/jpeg", 0.85);
    };

    img.onerror = function () {
      URL.revokeObjectURL(tempLink);
      reject(new Error("That file doesn't look like a picture we can read."));
    };

    img.src = tempLink;
  });
}

async function uploadAvatar() {
  const file = avatarInput.files[0];
  if (!file) return;

  // Rule 1: only JPG, PNG or WEBP pictures.
  if (!ALLOWED_TYPES.includes(file.type)) {
    showSmallMessage(avatarMessage, "error", "Please choose a JPG, PNG or WEBP picture.");
    avatarInput.value = "";
    return;
  }
  // Rule 2: nothing over 5 MB.
  if (file.size > MAX_FILE_SIZE) {
    const sizeInMb = (file.size / 1024 / 1024).toFixed(1);
    showSmallMessage(
      avatarMessage,
      "error",
      "That picture is " + sizeInMb + " MB. The limit is 5 MB, please choose a smaller one."
    );
    avatarInput.value = "";
    return;
  }

  avatarInput.disabled = true;
  showSmallMessage(avatarMessage, "waiting", "Uploading...");

  try {
    const smallPicture = await makeSquareJpeg(file);

    // Each user has one picture at USERID/avatar.jpg. "upsert" means
    // replace it if it already exists.
    const path = shownProfile.id + "/avatar.jpg";
    const { error: uploadError } = await db.storage
      .from("avatars")
      .upload(path, smallPicture, { upsert: true, contentType: "image/jpeg" });
    if (uploadError) throw uploadError;

    // The public web link to the picture. The "?v=..." part changes every
    // upload, so browsers show the new picture instead of an old saved copy.
    const { data } = db.storage.from("avatars").getPublicUrl(path);
    const newLink = data.publicUrl + "?v=" + Date.now();

    // Remember the link in the profiles table.
    const { error: saveError } = await db
      .from("profiles")
      .update({ avatar_url: newLink })
      .eq("id", shownProfile.id);
    if (saveError) throw saveError;

    // Show the new picture straight away, on the page and in the header.
    shownProfile.avatar_url = newLink;
    showProfile(shownProfile);
    const headerAvatar = document.getElementById("header-avatar");
    if (headerAvatar) fillAvatar(headerAvatar, shownProfile);

    showSmallMessage(avatarMessage, "ok", "Picture updated.");
  } catch (error) {
    showSmallMessage(avatarMessage, "error", friendlyError(error, "Upload failed. "));
  } finally {
    avatarInput.disabled = false;
    avatarInput.value = ""; // so choosing the same file again still works
  }
}


// ---------- Turn on the edit section ----------

function setUpEditing() {
  document.getElementById("edit-profile").hidden = false;

  bioInput.maxLength = MAX_BIO_LENGTH;
  bioInput.value = shownProfile.bio || "";
  updateBioCounter();

  bioInput.addEventListener("input", updateBioCounter);
  document.getElementById("bio-form").addEventListener("submit", saveBio);
  avatarInput.addEventListener("change", uploadAvatar);

  // Your own picture is the upload button: click it (or press Enter or
  // Space when it has focus) to choose a new one.
  const avatarSpot = document.getElementById("profile-avatar");
  avatarSpot.classList.add("avatar-editable");
  avatarSpot.setAttribute("role", "button");
  avatarSpot.setAttribute("tabindex", "0");
  avatarSpot.setAttribute("aria-label", "Change profile picture");
  avatarSpot.title = "Change profile picture";

  function chooseNewPicture() {
    if (!avatarInput.disabled) avatarInput.click(); // disabled while uploading
  }
  avatarSpot.addEventListener("click", chooseNewPicture);
  avatarSpot.addEventListener("keydown", function (event) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      chooseNewPicture();
    }
  });
}


loadPage().catch(function (error) {
  showNotFound(friendlyError(error, "This profile couldn't load. "));
});
