# Setup: connect Reddle to Supabase

You only do this once. Everything happens in your web browser, nothing to install.

## 1. Create a free Supabase project

1. Go to https://supabase.com and sign up for a free account.
2. Click **New project**.
3. Pick a name (for example `reddle`), choose a strong database password
   (save it somewhere, you rarely need it), pick the region closest to you.
4. Wait a minute or two while the project is created.

## 2. Create the database tables

1. In the left menu, open **SQL Editor**.
2. Click **New query**.
3. Open the file `supabase/schema.sql` from this project, copy everything, and paste it in.
4. Click **Run**. You should see "Success. No rows returned".

This creates the four tables (profiles, books, logs, follows) and the security
rules that decide who can read and change what.

Run it only once. If you run it a second time you will get "already exists" errors.
Those are harmless, nothing is broken.

## 3. Copy your project URL and key

1. Click the **Connect** button at the top of the dashboard
   (or go to **Project Settings -> API Keys** / **Data API**).
2. Copy the **Project URL** (looks like `https://abcdefgh.supabase.co`).
3. Copy the **publishable** key (starts with `sb_publishable_`).
   If you only see "anon public", that one works too.
4. Open `js/config.js` in this project and paste them between the quotes:

   ```js
   const SUPABASE_URL = "https://abcdefgh.supabase.co";
   const SUPABASE_KEY = "sb_publishable_xxxxxxxx";
   ```

Do **not** use the key labelled **secret** or **service_role**. That one must stay private.

## 4. Check it works

Open `index.html` in your browser (double click it, or drag it into a browser window).

- Green bar "Connected to Supabase. Books saved so far: 0." means you're done.
- "Not connected: open js/config.js..." means the values in step 3 are still missing.
- "Connected to Supabase, but the tables are missing" means step 2 didn't run.
- Anything else: press F12, open the **Console** tab, and share the red error message.

## 5. Step 3: storage for profile pictures

1. In Supabase, open **SQL Editor** and click **New query**.
2. Open `supabase/step3-avatars.sql`, copy everything, paste it in, click **Run**.
3. You should see "Success. No rows returned".
4. Check: open **Storage** in the left menu. There is now a bucket called **avatars**
   marked **Public**.
