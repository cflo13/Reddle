# Reddle: Letterboxd for books

A social website for logging and reviewing books, like Letterboxd is for films.

## Goal for version 1

A user can sign up with a username, upload a profile picture, search for a book,
log it with a star rating and review, follow other users, and see a feed of what
the people they follow are reading.

## Decisions made

- **Friend system:** FOLLOW, like Letterboxd. No approval needed. The feed is the logs from people you follow.
- **Book library:** do not preload books. Search Open Library or Google Books live. The first time anyone logs or reviews a book, save a copy (title, author, cover, description, ISBN, external ID) into our own database. Reviews and scores attach to that saved copy.
- **Ratings:** half stars from 0.5 to 5. One log per user per book to start with. A log may have no rating (empty).
- **Username:** chosen at sign up, unique, lowercase letters, numbers and underscores only, 3 to 20 characters. It becomes the profile link (yoursite.com/username).
- **Profile picture:** JPG, PNG or WEBP up to 5 MB. Cropped to a square from the centre and resized to 256 x 256 JPEG in the browser (canvas), then uploaded to the public Supabase Storage bucket `avatars` as `USERID/avatar.jpg` (one picture per user, replaced on each upload). The public link plus `?v=timestamp` is saved in `profiles.avatar_url`, so browsers show the new picture instead of an old cached copy. No picture: grey circle with the first letter of the username (pure CSS).
- **Sign up:** email and password, plus Google sign in.
- **Usernames at sign up:** the chosen username is stored on the login account (`user_metadata.username`) and the profile row is created as soon as the user has a session (straight away, or on first login after confirming their email). Any logged-in user without a profile (e.g. first Google sign in, or their username got taken meanwhile) is sent to `choose-username.html` by `js/auth.js`.
- **Profile links:** `profile.html?u=username` for now.
- **Supabase library:** loaded from the jsDelivr CDN with a fixed version (`@supabase/supabase-js@2.45.4`), so there is nothing to install.
- **Supabase key:** only the public "publishable"/"anon" key goes in `js/config.js`. It is safe to commit. Data is protected by Row Level Security rules in `supabase/schema.sql`. The secret/service_role key must never be in this project.

## Stack

- Plain HTML, CSS and JavaScript, no Node.js or other installs needed
- Supabase for the database, logins and profile picture storage, called straight from the browser
- Free tiers and free hosting to start
- Test by opening the files in the browser

## Database tables

Defined in `supabase/schema.sql` (run once in the Supabase SQL Editor).

- **profiles:** id (same as the login user id), username, bio, avatar_url
- **books:** id, external_id (unique), title, author, cover_url, description, isbn
- **logs:** id, user_id, book_id, rating, review, date_read (unique per user + book)
- **follows:** follower_id, following_id

Everyone can read everything. Users can only change their own profile, logs and follows.
Any signed-in user can save a new book.

## Files

Pages:
- `index.html` + `js/home.js`: home page (currently shows the Supabase connection check)
- `signup.html` + `js/signup.js`: sign up with username, email, password, or Google
- `login.html` + `js/login.js`: log in with email and password, or Google
- `choose-username.html` + `js/choose-username.js`: for logged-in users who have no username yet
- `profile.html` + `js/profile.js`: `profile.html?u=USERNAME`. Picture, @username, bio. On your own profile: edit bio (300 characters, counter) and upload a picture

Shared:
- `css/style.css`: all styling
- `js/config.js`: Supabase URL and public key
- `js/supabase-client.js`: creates the shared `db` connection used by every page
- `js/auth.js`: login helpers used by every page: fills the header (log in links, or your picture + @username + log out), makes sure logged-in users have a profile, username checks, `makeAvatar` / `fillAvatar`. Page scripts wait for it with `const { user, profile } = await authReady;`

Supabase (run by hand in the SQL Editor, once each, in this order):
- `supabase/schema.sql`: database tables and security rules (step 1)
- `supabase/step3-avatars.sql`: the `avatars` storage bucket and its security rules (step 3)

- `SETUP.md`: step by step guide to set up the Supabase project

Every page has `<nav id="site-nav">` in the header and loads scripts in this order: Supabase CDN, `config.js`, `supabase-client.js`, `auth.js`, then the page's own script.

## Build order

1. Project setup and Supabase connected
2. Sign up, log in, username
3. Profile page with picture upload
4. Book search and book pages
5. Logging a book with rating and review
6. Follow system and the feed

## Working rules for Claude Code

- Build one feature at a time and confirm it runs before moving on
- Keep the code simple and readable, the owner is not an experienced developer
- Explain any command the owner needs to run and why
- Do not ask the owner to download or install anything new. Only Claude Code is installed.
- Keep this file updated with decisions and what is done so far

## Progress

- **Step 1 (project setup): done.** Supabase project created, `js/config.js` filled in, tables created.
- **Step 2 (sign up, log in, username): done.** Built in the same session as step 3 (the earlier step 2 files never reached GitHub). Tested in a browser with a stand-in for Supabase.
- **Step 3 (profile page with picture upload): built, waiting for the owner to confirm.** Needs `supabase/step3-avatars.sql` run once in the SQL Editor. Tested in a browser with a stand-in for Supabase: crop/resize to 256 x 256 JPEG, upload path, instant picture swap, bio counter and save, file type and size checks, missing user message, edit section only on your own profile.
- Next: step 4, book search and book pages.

## Notes for later steps

- Supabase sends a confirmation email on sign up by default. The link in it goes to the "Site URL" (Authentication -> URL Configuration), which is `localhost:3000` until we host the site, so the page it opens may not load, but the email still counts as confirmed and the user can log in. To skip this while testing: Authentication -> Sign In / Providers -> Email -> turn off "Confirm email".
- Google sign in needs the site to be served from a real web address (not opened as a `file://` path), because Google sends the user back to a URL after login. Plan: host for free on GitHub Pages or Netlify when we reach step 2, and add that address in Supabase -> Authentication -> URL Configuration. Email and password works from a local file.
- Profile links like `yoursite.com/username` need a small redirect trick on static hosting (e.g. a `404.html` that reads the path). Until then use `profile.html?u=username`.
