// ------------------------------------------------------------
// Profile page: profile.html?u=USERNAME
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
    showNotFound("The site isn't connected to Supabase yet. Fill in js/config.js.");
    return;
  }

  // Read the ?u=USERNAME part of the address.
  const params = new URLSearchParams(window.location.search);
  const username = (params.get("u") || "").toLowerCase().trim();

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
    showNotFound("Could not load this profile: " + error.message);
    return;
  }
  if (!profile) {
    showNotFound("No user with that name.");
    return;
  }

  showProfile(profile);

  // Your own profile? Show the edit section.
  if (myProfile && myProfile.id === profile.id) {
    setUpEditing();
  }
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
    showSmallMessage(bioMessage, "error", "Could not save: " + error.message);
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
    showSmallMessage(avatarMessage, "error", "Upload failed: " + error.message);
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
}


loadPage().catch(function (error) {
  showNotFound("Something went wrong: " + error.message);
});
