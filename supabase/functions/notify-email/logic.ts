// ------------------------------------------------------------
// notify-email: what to send, and to whom (no Supabase or Resend code
// here, so it can be tested on its own; index.ts plugs those in).
// ------------------------------------------------------------
// Two ways in:
//  1. POST { type: "follows" | "follow_requests" | "comments", record }
//     from the database (supabase/step21-email-notifications.sql and
//     step22-social-feed.sql).
//  2. POST ?unsubscribe=TOKEN&kind=... : from our unsubscribe.html page
//     (the link in every email) or an email app's one-click unsubscribe.
//     (Supabase shows HTML from Edge Functions as plain text, so the page
//     people see lives on reddle.org, not here.)
// It sends nothing until RESEND_API_KEY and EMAIL_FROM are set.
// ------------------------------------------------------------

export type Kind = "new_followers" | "follow_requests" | "comments";

export type Prefs = {
  new_followers: boolean;
  follow_requests: boolean;
  comments: boolean;
  unsubscribe_token: string;
};

// A comment, looked up again (never trusting what was posted to us):
// who wrote it, whose review or post it's on, and where to see it.
// Comments on Book of the week have no owner, so nobody is emailed.
export type CommentInfo = {
  author: string;
  recipient: string | null;
  body: string;
  on: "review" | "post";
  bookTitle: string | null;
  path: string; // e.g. "book.html?id=OL45804W" or "post.html?id=12"
};

export type Deps = {
  env: (name: string) => string | undefined;
  followExists: (follower: string, following: string) => Promise<boolean>;
  requestExists: (requester: string, target: string) => Promise<boolean>;
  commentInfo: (commentId: string) => Promise<CommentInfo | null>;
  isBlocked: (a: string, b: string) => Promise<boolean>;
  getPrefs: (userId: string) => Promise<Prefs>; // creates default prefs if missing
  unsubscribe: (token: string, kind: Kind | "all") => Promise<boolean>;
  emailsToday: (userId: string) => Promise<number>;
  logEvent: (key: string, recipient: string) => Promise<boolean>; // false = already sent
  username: (userId: string) => Promise<string | null>;
  userEmail: (userId: string) => Promise<string | null>;
  sendEmail: (email: { to: string; subject: string; html: string; text: string; headers: Record<string, string> }) => Promise<void>;
};

export const DAILY_LIMIT = 20;
const KINDS = ["new_followers", "follow_requests", "comments", "all"];

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS } });
}

// Our own pages (unsubscribe.html) call this function from the browser.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
};

export async function handle(req: Request, deps: Deps): Promise<Response> {
  const url = new URL(req.url);
  const siteUrl = (deps.env("SITE_URL") || "https://reddle.org/").replace(/\/?$/, "/");

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  // ---- Unsubscribe (POST only, so link checkers can't do it by accident) ----
  const token = url.searchParams.get("unsubscribe");
  if (token) {
    const kind = url.searchParams.get("kind") || "all";
    if (req.method !== "POST") return json({ error: "Use POST" }, 405);
    if (!KINDS.includes(kind) || !/^[0-9a-f-]{36}$/i.test(token)) return json({ unsubscribed: false });
    return json({ unsubscribed: await deps.unsubscribe(token, kind as Kind | "all") });
  }

  if (req.method !== "POST") return json({ error: "Not found" }, 404);

  // ---- Not set up yet: send nothing ----
  if (!deps.env("RESEND_API_KEY") || !deps.env("EMAIL_FROM")) {
    return json({ skipped: "email not set up yet" });
  }

  let payload: { type?: string; record?: Record<string, string> };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Bad request" }, 400);
  }
  const record = payload.record || {};

  // Work out who gets what, and check it really happened.
  let recipient: string, actor: string, kind: Kind, eventKey: string;
  let comment: CommentInfo | null = null;
  if (payload.type === "follows" && record.follower_id && record.following_id) {
    actor = record.follower_id;
    recipient = record.following_id;
    kind = "new_followers";
    eventKey = "follow:" + actor + ":" + recipient;
    if (!(await deps.followExists(actor, recipient))) return json({ skipped: "no such follow" });
  } else if (payload.type === "follow_requests" && record.requester_id && record.target_id) {
    actor = record.requester_id;
    recipient = record.target_id;
    kind = "follow_requests";
    eventKey = "request:" + actor + ":" + recipient;
    if (!(await deps.requestExists(actor, recipient))) return json({ skipped: "no such request" });
  } else if (payload.type === "comments" && record.id) {
    comment = await deps.commentInfo(String(record.id));
    if (!comment) return json({ skipped: "no such comment" });
    if (!comment.recipient || comment.recipient === comment.author) return json({ skipped: "nobody to tell" });
    actor = comment.author;
    recipient = comment.recipient;
    kind = "comments";
    eventKey = "comment:" + record.id;
  } else {
    return json({ skipped: "unknown event" });
  }

  if (await deps.isBlocked(actor, recipient)) return json({ skipped: "blocked" });

  const prefs = await deps.getPrefs(recipient);
  if (!prefs[kind]) return json({ skipped: "turned off" });
  if ((await deps.emailsToday(recipient)) >= DAILY_LIMIT) return json({ skipped: "daily limit" });

  const [actorName, to] = await Promise.all([deps.username(actor), deps.userEmail(recipient)]);
  if (!actorName || !to) return json({ skipped: "missing person" });

  // Only once per event (following, unfollowing and following again
  // doesn't send a second email).
  if (!(await deps.logEvent(eventKey, recipient))) return json({ skipped: "already sent" });

  // Links people click open our page; the header is for email apps'
  // own one-click Unsubscribe button (they POST to the function).
  const unsubscribePage = siteUrl + "unsubscribe.html?token=" + prefs.unsubscribe_token + "&kind=";
  const unsubscribeKind = unsubscribePage + kind;
  const unsubscribeAll = unsubscribePage + "all";
  const oneClick = deps.env("SUPABASE_URL") + "/functions/v1/notify-email?unsubscribe=" + prefs.unsubscribe_token + "&kind=all";
  const profile = siteUrl + "u/" + encodeURIComponent(actorName);
  const name = "@" + actorName;

  let subject: string, line: string, action: string, actionUrl: string, what: string;
  if (kind === "new_followers") {
    subject = name + " started following you on Reddle";
    line = name + " is now following you on Reddle.";
    action = "See their profile";
    actionUrl = profile;
    what = "new followers";
  } else if (kind === "follow_requests") {
    subject = name + " wants to follow you on Reddle";
    line = name + " asked to follow you. Your profile is private, so they can see your books once you accept.";
    action = "Accept or decline";
    actionUrl = siteUrl + "notifications.html";
    what = "follow requests";
  } else {
    const c = comment as CommentInfo;
    const onWhat = c.on === "review" ? "your review" + (c.bookTitle ? " of " + c.bookTitle : "") : "your post";
    const said = c.body.length > 300 ? c.body.slice(0, 300) + "..." : c.body;
    subject = name + " commented on " + onWhat;
    line = name + " commented on " + onWhat + ": \u201c" + said + "\u201d";
    action = "See the comment";
    actionUrl = siteUrl + c.path;
    what = "comments";
  }

  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#3a2a20;background:#fbf5e6">
<p style="font-size:20px;font-weight:700;margin:0 0 16px">Reddle</p>
<p style="font-size:16px;line-height:1.5">${escapeHtml(line)}</p>
<p><a href="${escapeHtml(actionUrl)}" style="display:inline-block;padding:10px 18px;background:#93552a;color:#fbf5e6;border-radius:999px;text-decoration:none;font-weight:600">${escapeHtml(action)}</a></p>
<p style="font-size:12px;color:#72604b;margin-top:32px">You get this because email for ${what} is on in your Reddle settings.<br>
<a href="${escapeHtml(unsubscribeKind)}" style="color:#72604b">Stop emails about ${what}</a> · <a href="${escapeHtml(unsubscribeAll)}" style="color:#72604b">Unsubscribe from all Reddle emails</a> · <a href="${escapeHtml(siteUrl)}settings.html" style="color:#72604b">Email settings</a></p>
</div>`;
  const text = `${line}\n\n${action}: ${actionUrl}\n\n--\nStop emails about ${what}: ${unsubscribeKind}\nUnsubscribe from all Reddle emails: ${unsubscribeAll}\nEmail settings: ${siteUrl}settings.html\n`;

  await deps.sendEmail({
    to,
    subject,
    html,
    text,
    headers: {
      "List-Unsubscribe": "<" + oneClick + ">",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });
  return json({ sent: true });
}
