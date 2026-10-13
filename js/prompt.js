// ------------------------------------------------------------
// A weekly question and its answers: prompt.html?id=3
// ------------------------------------------------------------
// Without an id it shows this week's question. Answers are posts tagged
// with the question, newest first, with likes and comments. Muted
// people are left out; the database leaves out private and blocked ones.
// ------------------------------------------------------------

const promptTop = document.getElementById("prompt-top");
const answersBox = document.getElementById("answers");

function promptProblem(text) {
  promptTop.textContent = "";
  document.getElementById("answers-section").hidden = true;
  showStatus(document.getElementById("prompt-status"), "error", text);
}

async function showEarlierPrompts(currentId) {
  const { data } = await db.from("weekly_prompts").select(PROMPT_FIELDS)
    .eq("universe", currentUniverse())
    .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(30);
  const others = (data || []).filter((prompt) => prompt.id !== currentId);
  if (others.length === 0) return;
  const list = document.getElementById("earlier-list");
  for (const prompt of others) {
    const item = el("li", "");
    const link = el("a", "", prompt.question);
    link.href = "prompt.html?id=" + prompt.id;
    item.append(link, el("span", "muted", " · " + weekOf(prompt.created_at)));
    list.appendChild(item);
  }
  document.getElementById("earlier-section").hidden = false;
}

(async function () {
  await authReady;
  if (!db) return;

  const id = Number(new URLSearchParams(window.location.search).get("id")) || null;
  let prompt;
  try {
    if (id) {
      const { data, error } = await db.from("weekly_prompts").select(PROMPT_FIELDS).eq("id", id).maybeSingle();
      if (error) throw error;
      prompt = data;
    } else {
      prompt = await fetchLatestPrompt();
    }
  } catch (error) {
    return promptProblem(friendlyError(error, "Couldn't load the question. "));
  }
  if (!prompt) return promptProblem(id ? "This question doesn't exist." : "There's no question this week yet. Check back soon.");
  // A link to a question from another universe switches to it.
  if (prompt.universe && prompt.universe !== currentUniverse()) {
    showUniverse(prompt.universe);
    showSearchPlaceholders();
  }

  setPageInfo(prompt.question + " · Reddle", "Answers from Reddle readers: " + prompt.question);
  promptTop.textContent = "";
  promptTop.appendChild(makePromptCard(prompt, {
    showLink: false,
    onPosted: function (post) {
      const empty = answersBox.querySelector(".empty-note");
      if (empty) empty.remove();
      answersBox.prepend(makePostCard(post));
    },
  }));

  const muted = await mutedIds();
  await showMixedFeed(answersBox, [{
    kind: "post",
    fetch: function (before, count) {
      let query = db.from("posts").select(POST_FIELDS).eq("prompt_id", prompt.id);
      if (muted.length) query = query.not("user_id", "in", "(" + muted.join(",") + ")");
      if (before) query = query.lt("created_at", before);
      return query.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(count);
    },
  }], "No answers yet. Be the first to answer.");
  showEarlierPrompts(prompt.id);
})();
