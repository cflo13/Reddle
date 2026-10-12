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
- **Profile picture:** uploaded to file storage, small file size limit, resized to a square, default avatar if none is set.
- **Sign up:** email and password, plus Google sign in.
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

- `index.html`: home page (currently shows the Supabase connection check)
- `css/style.css`: all styling
- `js/config.js`: Supabase URL and public key (filled in by the user)
- `js/supabase-client.js`: creates the shared `db` connection used by every page
- `js/home.js`: code for the home page
- `supabase/schema.sql`: database tables and security rules
- `SETUP.md`: step by step guide to create the Supabase project

Every page loads scripts in this order: Supabase CDN, `config.js`, `supabase-client.js`, then the page's own script.

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

- **Step 1 (project setup): built, waiting for the owner to confirm.** Files created, database schema written, Supabase project created and `js/config.js` filled in.
  To confirm: follow `SETUP.md`, then open `index.html` and see the green "Connected to Supabase" message.
- Next: step 2, sign up, log in, username.

## Notes for later steps

- Google sign in needs the site to be served from a real web address (not opened as a `file://` path), because Google sends the user back to a URL after login. Plan: host for free on GitHub Pages or Netlify when we reach step 2, and add that address in Supabase -> Authentication -> URL Configuration. Email and password works from a local file.
- Profile links like `yoursite.com/username` need a small redirect trick on static hosting (e.g. a `404.html` that reads the path). Until then use `profile.html?u=username`.
