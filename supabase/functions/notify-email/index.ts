// ------------------------------------------------------------
// notify-email Edge Function: connects logic.ts to the database
// (with the service key Supabase gives every Edge Function) and to
// Resend (resend.com), which delivers the emails.
// Secrets the owner adds in Supabase (Edge Functions -> Secrets):
//   RESEND_API_KEY  the key from resend.com
//   EMAIL_FROM      e.g. "Reddle <notifications@reddle.org>"
//   SITE_URL        optional, defaults to https://reddle.org/
// Without RESEND_API_KEY and EMAIL_FROM it sends nothing.
// ------------------------------------------------------------

import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { handle, type Deps, type Kind, type Prefs } from "./logic.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const deps: Deps = {
  env: (name) => Deno.env.get(name),

  async followExists(follower, following) {
    const { data } = await db.from("follows").select("follower_id")
      .eq("follower_id", follower).eq("following_id", following)
      .gte("created_at", new Date(Date.now() - 15 * 60 * 1000).toISOString())
      .maybeSingle();
    return !!data;
  },

  async requestExists(requester, target) {
    const { data } = await db.from("follow_requests").select("requester_id")
      .eq("requester_id", requester).eq("target_id", target).maybeSingle();
    return !!data;
  },

  async commentInfo(commentId) {
    const { data } = await db.from("comments")
      .select("user_id, body, log_id, post_id, logs(user_id, books(external_id, title)), posts(user_id)")
      .eq("id", commentId).maybeSingle();
    if (!data) return null;
    // deno-lint-ignore no-explicit-any
    const row = data as any;
    if (row.log_id && row.logs) {
      return {
        author: row.user_id, recipient: row.logs.user_id, body: row.body, on: "review",
        bookTitle: row.logs.books ? row.logs.books.title : null,
        path: row.logs.books ? "book.html?id=" + row.logs.books.external_id : "",
      };
    }
    if (row.post_id && row.posts) {
      return { author: row.user_id, recipient: row.posts.user_id, body: row.body, on: "post", bookTitle: null, path: "post.html?id=" + row.post_id };
    }
    return { author: row.user_id, recipient: null, body: row.body, on: "post", bookTitle: null, path: "" }; // Book of the week
  },

  async isBlocked(a, b) {
    const { data } = await db.from("blocks").select("blocker_id")
      .or(`and(blocker_id.eq.${a},blocked_id.eq.${b}),and(blocker_id.eq.${b},blocked_id.eq.${a})`)
      .limit(1);
    return !!(data && data.length);
  },

  async getPrefs(userId) {
    await db.from("email_prefs").upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true });
    const { data, error } = await db.from("email_prefs")
      .select("new_followers, follow_requests, comments, unsubscribe_token").eq("user_id", userId).single();
    if (error) throw error;
    return data as Prefs;
  },

  async unsubscribe(token, kind) {
    const changes: Partial<Record<Kind, boolean>> = kind === "all"
      ? { new_followers: false, follow_requests: false, comments: false }
      : { [kind]: false };
    const { data } = await db.from("email_prefs")
      .update({ ...changes, updated_at: new Date().toISOString() })
      .eq("unsubscribe_token", token).select("user_id");
    return !!(data && data.length);
  },

  async emailsToday(userId) {
    const { count } = await db.from("email_log").select("event_key", { count: "exact", head: true })
      .eq("recipient_id", userId).gte("sent_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    return count || 0;
  },

  async logEvent(key, recipient) {
    const { error } = await db.from("email_log").insert({ event_key: key, recipient_id: recipient });
    return !error; // a duplicate key means it was already sent
  },

  async username(userId) {
    const { data } = await db.from("profiles").select("username").eq("id", userId).maybeSingle();
    return data ? data.username : null;
  },

  async userEmail(userId) {
    const { data } = await db.auth.admin.getUserById(userId);
    return data && data.user ? data.user.email || null : null;
  },

  async sendEmail(email) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + Deno.env.get("RESEND_API_KEY"),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: Deno.env.get("EMAIL_FROM"), ...email }),
    });
    if (!response.ok) throw new Error("Resend said " + response.status + ": " + (await response.text()));
  },
};

Deno.serve(async (req) => {
  try {
    return await handle(req, deps);
  } catch (error) {
    console.error("notify-email failed:", error);
    return new Response(JSON.stringify({ error: "failed" }), { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
  }
});
