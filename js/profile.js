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

  document.title = "@" + profile.username + " · Reddle";
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
  if (isMe) {
    // Your own profile: show the edit section.
    setUpEditing();
  } else if (myProfile) {
    // Someone else's profile while logged in: show the follow button
    // and a Report button.
    await setUpFollowButton(myProfile);
    const report = makeReportButton("user", profile.id, profile.id);
    if (report) document.getElementById("profile-report").appendChild(report);
  } else {
    // Logged out: invite them to log in to follow.
    document.getElementById("follow-login").hidden = false;
  }

  await Promise.all([loadStats(), loadShelves(isMe), loadProfileLogs()]);
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

async function loadStats() {
  const [books, followers, following] = await Promise.all([
    countRows("logs", "user_id", shownProfile.id),
    countRows("follows", "following_id", shownProfile.id), // people who follow them
    countRows("follows", "follower_id", shownProfile.id),  // people they follow
  ]);
  document.getElementById("stat-books").textContent = plural(books, "book");
  document.getElementById("stat-followers").textContent = plural(followers, "follower");
  document.getElementById("stat-following").textContent = following + " following";
}


// ---------- Follow / Unfollow ----------

async function setUpFollowButton(myProfile) {
  const button = document.getElementById("follow-button");
  let following = false;

  function updateButton() {
    button.textContent = following ? "Following" : "Follow";
    button.classList.toggle("button-secondary", following);
  }

  // Do I already follow this person?
  const { data, error } = await db
    .from("follows")
    .select("follower_id")
    .eq("follower_id", myProfile.id)
    .eq("following_id", shownProfile.id)
    .maybeSingle();
  if (error) throw error;
  following = data !== null;

  updateButton();
  button.hidden = false;

  // Show "Unfollow" when hovering over "Following", like Letterboxd.
  button.addEventListener("mouseenter", function () {
    if (following) button.textContent = "Unfollow";
  });
  button.addEventListener("mouseleave", updateButton);

  button.addEventListener("click", async function () {
    button.disabled = true;
    const result = following
      ? await db
          .from("follows")
          .delete()
          .eq("follower_id", myProfile.id)
          .eq("following_id", shownProfile.id)
      : await db
          .from("follows")
          .insert({ follower_id: myProfile.id, following_id: shownProfile.id });
    button.disabled = false;

    if (result.error) {
      alert(friendlyError(result.error, "Something went wrong. "));
      return;
    }
    following = !following;
    updateButton();
    await loadStats();
  });
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

async function loadShelves(isMe) {
  // Every shelf row for this person, newest first, with the book joined in.
  const { data: rows, error } = await db
    .from("shelves")
    .select("status, books(external_id, title, author, cover_url)")
    .eq("user_id", shownProfile.id)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const reading = rows.filter((row) => row.status === "currently_reading").map((row) => row.books);
  const want = rows.filter((row) => row.status === "want_to_read").map((row) => row.books);

  document.getElementById("reading-section").hidden = reading.length === 0;
  showShelf(document.getElementById("reading-books"), reading, "");
  showShelf(
    document.getElementById("want-books"),
    want,
    isMe ? "Nothing yet. Open a book and click \u201cWant to read\u201d." : "Nothing yet."
  );
}


// ---------- Their books ----------

async function loadProfileLogs() {
  await showPagedLogs(
    document.getElementById("profile-logs"),
    (from, to) =>
      db
        .from("logs")
        .select(LOG_FIELDS)
        .eq("user_id", shownProfile.id)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to),
    { showBook: true },
    "No books logged yet."
  );
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

      // White background, so see-through PNGs don't turn black as a JPEG.
      ctx.fillStyle = "#ffffff";
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
