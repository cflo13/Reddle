// ------------------------------------------------------------
// Welcome page: shown once to new users after they sign up.
// Suggests logging a first book and following active readers.
// ------------------------------------------------------------

const peopleBox = document.getElementById("suggested-people");

// The people who logged the most books recently (up to 6), not you.
async function findActiveReaders(myId) {
  const { data: recent, error } = await db
    .from("logs")
    .select("user_id, profiles(id, username, avatar_url, bio)")
    .neq("user_id", myId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;

  // Count how many recent logs each person has.
  const people = new Map();
  for (const log of recent) {
    const entry = people.get(log.user_id) || { profile: log.profiles, count: 0 };
    entry.count += 1;
    people.set(log.user_id, entry);
  }
  return [...people.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
}

// A Follow / Following button for one person.
function makeFollowButton(myId, personId) {
  const button = el("button", "button", "Follow");
  button.type = "button";
  let following = false;

  button.addEventListener("click", async function () {
    button.disabled = true;
    const result = following
      ? await db.from("follows").delete().eq("follower_id", myId).eq("following_id", personId)
      : await db.from("follows").insert({ follower_id: myId, following_id: personId });
    button.disabled = false;
    if (result.error) {
      window.alert(friendlyError(result.error, "Couldn't update. "));
      return;
    }
    following = !following;
    button.textContent = following ? "Following" : "Follow";
    button.classList.toggle("button-secondary", following);
  });
  return button;
}

async function showSuggestedPeople(myId) {
  const readers = await findActiveReaders(myId);
  peopleBox.textContent = "";

  if (readers.length === 0) {
    peopleBox.appendChild(el("p", "muted",
      "You're one of the first readers here! Once others join, you'll find them through search."));
    return;
  }

  for (const reader of readers) {
    const row = el("div", "suggested-person");
    const link = el("a", "suggested-person-name");
    link.href = profileLink(reader.profile.username);
    link.appendChild(makeAvatar(reader.profile, "avatar-small"));
    const text = el("span", "");
    text.appendChild(el("strong", "", "@" + reader.profile.username));
    text.appendChild(el("span", "muted", reader.count + (reader.count === 1 ? " book" : " books") + " logged recently"));
    link.appendChild(text);
    row.append(link, makeFollowButton(myId, reader.profile.id));
    peopleBox.appendChild(row);
  }
}

(async function () {
  const { profile } = await authReady;
  if (!profile) {
    window.location.href = "login.html";
    return;
  }
  document.getElementById("welcome-title").textContent = "Welcome to Reddle, @" + profile.username + "!";

  // They've seen the welcome page now, so don't send them here again.
  if (!profile.onboarded) {
    await db.from("profiles").update({ onboarded: true }).eq("id", profile.id);
  }

  await showSuggestedPeople(profile.id);
})();
