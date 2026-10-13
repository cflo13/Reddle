# Turning on "Continue with Google"

The Google button on the Log in and Sign up pages is already built. It works
as soon as Google and Supabase know about each other. That takes two parts:
Google Cloud gives you a **Client ID** and a **Client secret**, and you paste
them into Supabase. About 15 minutes, browser only, free.

New Google users pick a username on their first visit (Reddle already does
this), then see the welcome page like everyone else.

---

## Part 1: Google Cloud (get the Client ID and secret)

### 1. Make a project

1. Go to https://console.cloud.google.com and sign in with your Google account.
   Accept the terms if asked.
2. At the top left, click the project picker (it may say "Select a project"),
   then **New project**.
3. Project name: `Reddle`. Press **Create**, and make sure the new project is
   selected at the top.

### 2. Describe the app (the screen people see when they sign in)

1. Open the menu (☰) → **APIs & Services** → **OAuth consent screen**.
   (On newer screens it's called **Google Auth Platform** → **Branding**;
   press **Get started** if you see it.)
2. Fill in:
   - **App name**: `Reddle`
   - **User support email**: your email
   - **Audience / User type**: **External**
   - **Contact email**: your email
3. Press **Create** / **Save and continue**.
4. In **Branding** (if there are more boxes), add:
   - **App home page**: `https://reddle.org/`
   - **Privacy policy**: `https://reddle.org/privacy.html`
   - **Terms of service**: `https://reddle.org/terms.html`
   - **Authorized domains**: add `reddle.org` and `supabase.co`
   - Save.
5. **Scopes**: you don't need to add any. Reddle only asks for the basics
   (email, name, picture), which Google allows without a review.
6. **Audience** → press **Publish app** (so it's "In production"). If you leave
   it in "Testing", only people you list as test users can sign in.

### 3. Make the Client ID

1. Go to **APIs & Services** → **Credentials** (or **Google Auth Platform** →
   **Clients**) → **Create credentials** / **Create client** → **OAuth client ID**.
2. **Application type**: **Web application**. **Name**: `Reddle website`.
3. **Authorized JavaScript origins** → **Add URI**: `https://reddle.org`
4. **Authorized redirect URIs** → **Add URI**, copy this exactly:

   `https://trfgztdvecpswcwoakyz.supabase.co/auth/v1/callback`

5. Press **Create**. Google shows a **Client ID** (ends in
   `.apps.googleusercontent.com`) and a **Client secret** (starts with `GOCSPX-`).
   Keep this window open, or download the JSON.

Don't put the Client secret in the project files, GitHub or a chat. It only
goes into Supabase (next part).

## Part 2: Supabase (switch Google on)

1. Open https://supabase.com/dashboard → the Reddle project.
2. **Authentication** (left menu) → **Sign In / Providers** (or **Providers**)
   → **Google**.
3. Switch **Enable Sign in with Google** on.
4. Paste the **Client ID** into "Client IDs" and the **Client secret** into
   "Client Secret (for OAuth)".
5. Leave the other options as they are and press **Save**.
6. Still under **Authentication** → **URL Configuration**, check that Site URL
   is `https://reddle.org` and that `https://reddle.org/**` is in Redirect URLs
   (you already did this for the domain switch).

## Part 3: Test it

1. Open https://reddle.org in a private/incognito window and press **Log in**
   → **Continue with Google**.
2. Pick your Google account. The first time, Google shows "Sign in to Reddle".
3. Back on Reddle you're asked to choose a username, then you see the welcome
   page.
4. Log out and press **Continue with Google** again: this time you go straight
   in.

If Google says **"redirect_uri_mismatch"**, the redirect URI in step 3.4 doesn't
match exactly (check for a missing `/auth/v1/callback` or a typo). If it says
**"Access blocked: app is in testing"**, press **Publish app** (step 2.6).
If anything else goes wrong, tell Claude the exact message.
