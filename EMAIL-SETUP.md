# Turning on Reddle's notification emails

Reddle can email people when someone follows them, asks to follow them, or
comments on their review or post. Everything is built and switched on in the
database, but **no email is sent until you finish these steps**. Until then the
site works exactly as before.

We use **Resend** (resend.com) to deliver the emails:

- Free: 3,000 emails a month (100 a day), no card needed.
- Made for developers, with a simple setup: one key, and a few DNS records so
  emails come from `@reddle.org` and don't land in spam.
- It works well with Supabase Edge Functions (that's where Reddle's email code runs).

It takes about 20 minutes. You only need your browser.

---

## Step 1: Make a Resend account

1. Go to https://resend.com and press **Sign up**. Sign up with your email or GitHub.
2. Confirm your email if Resend asks you to.

## Step 2: Add reddle.org to Resend

1. In Resend, open **Domains** (left menu) and press **Add Domain**.
2. Type `reddle.org`. If it asks for a region, pick the one closest to you
   (for example "Ireland (eu-west-1)"). Press **Add**.
3. Resend now shows a short list of **DNS records** (usually 3 or 4: an `MX`
   record, one or two `TXT` records, and sometimes a `DMARC` TXT record). Keep
   this page open.

## Step 3: Add those records in Cloudflare

**Easiest:** if Resend shows an **Auto configure** / **Sign in to Cloudflare**
button next to the records, press it, log in to Cloudflare and allow it.
Resend adds the records itself. Then skip to point 4 below.

Otherwise, by hand:

1. Open https://dash.cloudflare.com, click **reddle.org**, then **DNS → Records**.
2. For **each** record Resend shows, press **Add record** and copy it across
   exactly:
   - **Type**: the same as in Resend (`MX` or `TXT`).
   - **Name**: what Resend shows in its "Name" column (for example `send` or
     `resend._domainkey`). Type only that part; Cloudflare adds `.reddle.org`
     itself.
   - **Content / Value**: copy Resend's value exactly (use Resend's copy button).
   - **Priority** (MX only): the number Resend shows (usually `10`).
   - **Proxy status**: these record types have no orange cloud. If you see one,
     set it to **DNS only** (grey).
   - Press **Save**.
3. Don't change or delete the GitHub Pages records (the A, AAAA and `www`
   records) that are already there.
4. Back in Resend, press **Verify DNS Records**. It can take a few minutes (rarely
   up to a few hours). Wait until the domain says **Verified**.

## Step 4: Make an API key in Resend

1. In Resend, open **API Keys** and press **Create API Key**.
2. Name: `Reddle Supabase`. Permission: **Sending access**. Domain: `reddle.org`.
3. Press **Add**, then **copy the key** (it starts with `re_`). Resend only shows
   it once.
4. **Don't paste this key anywhere except Supabase** (next step). Never put it in
   the project files, in GitHub, or in a chat.

## Step 5: Give the key to Supabase (as a secret)

**Easiest:** tell Claude "the Resend key is ready". Claude asks Supabase to
store the two secrets, and Supabase shows **you** a box to paste each value
into, so the key never goes through the chat:

- `RESEND_API_KEY`: the key you copied (starts with `re_`)
- `EMAIL_FROM`: `Reddle <notifications@reddle.org>`

Or do it yourself in the dashboard:

1. Open https://supabase.com/dashboard and open the Reddle project.
2. Go to **Edge Functions** (left menu), then **Secrets** (it may be under
   Edge Functions → **Manage secrets**, or **Project Settings → Edge Functions**).
3. Add two secrets (press **Add new secret** for each):
   - Name `RESEND_API_KEY`, value: the key you copied (starts with `re_`).
   - Name `EMAIL_FROM`, value: `Reddle <notifications@reddle.org>`
4. Press **Save**.

That's it: emails start straight away. The function is called `notify-email`;
it's already deployed, so you don't need to touch it.

## Step 6: Test it

1. Make a second account on reddle.org (use another email address you can read).
2. From the second account, follow your main account.
3. Within a minute your main email should get "@... started following you on Reddle".
   Check the spam folder the first time.
4. From the second account, comment on one of your main account's reviews or
   posts: you should get a "commented on your..." email.
5. Turn on **Private profile** in Settings on your main account, and ask to
   follow it from the second account: you should get a follow-request email.
6. Click **Stop emails about new followers** at the bottom of an email, press
   **Yes, unsubscribe**, then check Settings: that switch is now off.

If nothing arrives: in Resend open **Emails** (or **Logs**) to see whether it
tried, and tell Claude what it says.

---

**How it works:** when someone follows you (or asks to, or comments on your
review or post), the database calls
the `notify-email` Edge Function. It checks the follow (or comment) really happened, that
the email for it is switched on, that it hasn't already emailed you about
this, and that you've had fewer than 20 emails today. Then it asks Resend to
send it. People can switch each kind of email off in **Settings → Email
notifications**, or with the links in every email.
