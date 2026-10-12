# Reddle: Letterboxd for books

A social website for logging and reviewing books, like Letterboxd is for films.

## Goal for version 1

A user can sign up with a username, upload a profile picture, search for a book,
log it with a star rating and review, follow other users, and see a feed of what
the people they follow are reading.

## Decisions made

- **Friend system:** FOLLOW, like Letterboxd. No approval needed. The feed is the logs from people you follow.
- **Book library:** do not preload books. Search Open Library live (chosen over Google Books because it needs no key). A book's external ID is its Open Library work id, like `OL45804W`, and book pages are `book.html?id=OL45804W`. The first time anyone logs or reviews a book, save a copy (title, author, cover, description, ISBN, external ID) into our own database. Reviews and scores attach to that saved copy.
- **Ratings:** half stars from 0.5 to 5. One log per user per book to start with. A log may have no rating (empty).
- **Username:** chosen at sign up, unique, lowercase letters, numbers and underscores only, 3 to 20 characters. It becomes the profile link (yoursite.com/username).
- **Profile picture:** JPG, PNG or WEBP up to 5 MB. Cropped to a square from the centre and resized to 256 x 256 JPEG in the browser (canvas), then uploaded to the public Supabase Storage bucket `avatars` as `USERID/avatar.jpg` (one picture per user, replaced on each upload). The public link plus `?v=timestamp` is saved in `profiles.avatar_url`, so browsers show the new picture instead of an old cached copy. No picture: grey circle with the first letter of the username (pure CSS).
- **Sign up:** email and password, plus Google sign in.
- **Usernames at sign up:** the chosen username is stored on the login account (`user_metadata.username`). A database trigger (`supabase/step2-profile-trigger.sql`) creates the profile row the moment the account is created; it skips bad or taken usernames instead of failing the sign up. As a backup, `ensureProfile` in `js/auth.js` creates it on first login. Any logged-in user without a profile (e.g. first Google sign in, or their username got taken meanwhile) is sent to `choose-username.html` by `js/auth.js`.
- **Profile links:** `profile.html?u=username` for now. If no current user has that name, the profile page looks it up in `old_usernames` and sends the visitor on to the person's new name.
- **Header menu:** when logged in, your picture and @username open a small menu (a `<details>` element): Your profile, Settings, Log out. Clicking elsewhere closes it.
- **Shelves (Want to read / Currently reading):** two toggle buttons under the author on the book page (logged in only). Clicking the active one takes the book off; clicking the other moves it. Putting a book on a shelf saves it to our `books` table first, like logging does. Logging a book takes it off your shelf (you've read it). The profile shows "Currently reading" (only when not empty) and "Want to read" as rows of covers, newest first.
- **Logs:** saved with an "upsert" (create or update) on user + book. A log can have just a date. Reviews up to 5000 characters (only checked in the browser). Star picker: click the left half of a star for a half star; arrow keys work too.
- **Feed:** the home page. Logged in: latest 30 logs from people you follow (not your own). Following nobody yet, or logged out: latest 30 logs from everyone, so there are people to discover.
- **Finding people:** the search page also matches usernames (shown above the book results), and every name on a log card links to that profile.
- **Testing:** the owner asked to skip testing between steps until the site is usable, so steps 4 to 6 were built in one go and tested by Claude with stand-ins for Supabase and Open Library.
- **Hosting:** GitHub Pages, live at https://cflo13.github.io/Reddle/ . The repo is public and Pages serves the `claude/letterboxd-books-ceznit` branch from the root folder. Every push updates the site in about a minute. Supabase Site URL and Redirect URLs are set to this address.
- **Supabase library:** loaded from the jsDelivr CDN with a fixed version (`@supabase/supabase-js@2.45.4`), so there is nothing to install.
- **Supabase key:** only the public "publishable"/"anon" key goes in `js/config.js`. It is safe to commit. Data is protected by Row Level Security rules in `supabase/schema.sql`. The secret/service_role key must never be in this project.

## Stack

- Plain HTML, CSS and JavaScript, no Node.js or other installs needed
- Supabase for the database, logins and profile picture storage, called straight from the browser
- Free tiers and free hosting to start
- Test on the live site (https://cflo13.github.io/Reddle/), or by opening the files in the browser

## Database tables

Defined in `supabase/schema.sql` (run once in the Supabase SQL Editor).

- **profiles:** id (same as the login user id), username, bio, avatar_url
- **books:** id, external_id (unique), title, author, cover_url, description, isbn
- **logs:** id, user_id, book_id, rating, review, date_read (unique per user + book)
- **follows:** follower_id, following_id
- **old_usernames:** username (old name), user_id. Filled by a trigger whenever someone changes their username, so old profile links still work. In `supabase/step8-old-usernames.sql`.
- **shelves:** user_id, book_id, status (`want_to_read` or `currently_reading`), one shelf per user + book. In `supabase/step7-shelves.sql`.

Everyone can read everything. Users can only change their own profile, logs, follows and shelves.
Any signed-in user can save a new book.

## Files

Pages:
- `index.html` + `js/home.js`: home page with the feed (see Feed above)
- `signup.html` + `js/signup.js`: sign up with username, email, password, or Google
- `login.html` + `js/login.js`: log in with email and password, or Google
- `choose-username.html` + `js/choose-username.js`: for logged-in users who have no username yet
- `profile.html` + `js/profile.js`: `profile.html?u=USERNAME`. Picture, @username, bio, counts (books, followers, following), their logged books. Other people's profile: Follow / Following button. Your own profile: edit bio (300 characters, counter), and click your picture to upload a new one (hidden file input behind the picture)
- `forgot-password.html` + `js/forgot-password.js`: asks for your email and sends a reset link (Supabase `resetPasswordForEmail`). Same message whether or not the email has an account
- `reset-password.html` + `js/reset-password.js`: the email link opens this page already logged in; choose a new password (`updateUser`). Expired or used links show Supabase's error and a "Send a new link" link
- `settings.html` + `js/settings.js`: change username (same rules; old links redirect), email (Supabase sends a confirmation link; shows the pending address), and password; delete account (type your username to unlock the button; calls `delete_my_account`, then deletes the picture, logs out, and shows a goodbye message on the home page via `index.html?deleted=1`). Logged-out visitors go to login
- `about.html` + `js/about.js`, `privacy.html`, `terms.html` (+ `js/static-page.js`, an empty placeholder): plain-English text pages. About's Contact section shows `CONTACT_EMAIL` from `js/config.js` (empty for now, so it says "coming soon"). If the site starts collecting new kinds of data (e.g. comments, reports), update the Privacy page's "What we keep" list
- `search.html` + `js/search.js`: `search.html?q=WORDS`. Books from Open Library, plus matching usernames
- `book.html` + `js/book.js`: `book.html?id=OL45804W`. Cover, title, author, description, ISBN, average rating, everyone's logs. Logged in: log it with half-star rating, date read and review; update or delete your log

Shared:
- `css/style.css`: all styling
- `js/config.js`: Supabase URL and public key, and `CONTACT_EMAIL` (the public contact address; the owner chose to leave it empty until they have a dedicated address)
- `js/supabase-client.js`: creates the shared `db` connection used by every page
- `js/auth.js`: shared helpers used by every page: `el()` (build HTML safely), `showStatus()` (fill a status message box), `pageAddress()` (full address of one of our pages, for email links), login helpers, fills the header (log in links, or your picture + @username + log out), makes sure logged-in users have a profile, username checks, `makeAvatar` / `fillAvatar`. Page scripts wait for it with `const { user, profile } = await authReady;`

Supabase (SQL files, once each, in this order; for a new project run them in the SQL Editor):
- `supabase/schema.sql`: database tables and security rules (step 1)
- `supabase/step2-profile-trigger.sql`: creates the profile automatically at sign up (step 2)
- `supabase/step3-avatars.sql`: the `avatars` storage bucket and its security rules (step 3)
- `supabase/step7-shelves.sql`: the `shelves` table (feature 1, Want to read / Currently reading)
- `supabase/step8-old-usernames.sql`: remembers old usernames (batch 2, account settings)
- `supabase/step9-delete-account.sql`: `delete_my_account()` deletes the logged-in user's login; everything else cascades (batch 2, delete account)

All of these have been applied to the live project, except `step9-delete-account.sql` (see "Waiting on the owner").

- `SETUP.md`: step by step guide to set up the Supabase project
- `.nojekyll`: empty file that tells GitHub Pages to serve the files as they are (no Jekyll processing)

Every page has a footer (About, Privacy, Terms, Contact = `about.html#contact`, and an Open Library credit), a search box and `<nav id="site-nav">` in the header and loads scripts in this order: Supabase CDN, `config.js`, `supabase-client.js`, `auth.js`, (`books.js` on pages showing books), then the page's own script.

**Browser caching:** every page loads our CSS and JS with one shared site version number, like `css/style.css?v=4`. When any CSS or JS file changes, bump the number on every page (all files get the same number), so visitors get the new files instead of old saved copies.

**Page template:** every page has the same head, header, footer and script tags; only `<main>` differs. Claude rebuilds the shared parts with a helper script in its scratch folder (not in the repo). If you add a page by hand, copy an existing page and change only the title, description, `<main>` and the last script. Hidden elements use the `hidden` attribute; `style.css` has a `[hidden] { display: none !important; }` rule so no other rule can show them by accident.

User text (bios, reviews) is always put on the page with `textContent`, never `innerHTML`, so nobody can sneak code into the site.

## Build order

1. Project setup and Supabase connected
2. Sign up, log in, username
3. Profile page with picture upload
4. Book search and book pages
5. Logging a book with rating and review
6. Follow system and the feed

Features after version 1, built one at a time in this order (the owner tests each before the next):

1. Want to read and Currently reading shelves
2. Password reset ("Forgot password" on the login page)
3. Likes on reviews, with a like count on each log card
4. Comments on reviews, under the review on the book page
5. Lists ("Best fantasy", "Books that made me cry"), shown on the profile
6. Four favourite books pinned at the top of the profile
7. Popular this week page (most logged and highest rated in the last 7 days), linked from the header
8. Reading stats on the profile (books this year, average rating, books per month chart)
9. Cleaner profile links (/username) with a 404.html redirect on GitHub Pages
10. Google sign in

Batch 2 (asked for after feature 1, built in this order; the owner reviews at the end):

A. Basics: 1 password reset (= feature 2 above), 2 account settings (email, password, username; old profile links still work), 3 delete account, 4 About/Privacy/Terms pages + footer, 5 report button + admin page, 6 limits enforced in the database, 7 Load more buttons, 8 404 page + friendly errors, 9 favicon + titles + share previews, 10 welcome step after sign up, 11 phone-size check of every page.
B. Taste: 12 genres (from Open Library subjects; browse page, genre pages, tags on book page), 13 taste questionnaire after sign up (genres, then books read/loved/want; skippable; redo from settings), 14 For you recommendations on the home page, 15 Books you might like on the book page.
C. 16 real covers: Open Library first, then other editions or Google Books by ISBN, plain title box only as a last resort.

The rest of the earlier list (likes, comments, lists, favourites, popular this week, stats, /username links, Google sign in) comes after batch 2.

New SQL for a feature goes in its own file in `supabase/` (named `step7-...`, `step8-...` and so on). Claude applies it to the live project through the Supabase connector and tells the owner.

## Working rules for Claude Code

- Build one feature at a time and confirm it runs before moving on
- Keep the code simple and readable, the owner is not an experienced developer
- Explain any command the owner needs to run and why
- Do not ask the owner to download or install anything new. Only Claude Code is installed.
- Keep this file updated with decisions and what is done so far

## Progress

- **Step 1 (project setup): done.** Supabase project created, `js/config.js` filled in, tables created.
- **Step 2 (sign up, log in, username): done.** Built in the same session as step 3 (the earlier step 2 files never reached GitHub). Tested in a browser with a stand-in for Supabase.
- **Step 3 (profile page with picture upload): built.** `step3-avatars.sql` applied by Claude through the Supabase connector (the owner saw "Bucket not found" before that).
- **Step 4 (book search and book pages): built.**
- **Step 5 (logging with rating and review): built.**
- **Step 6 (follow system and the feed): built.** No new SQL needed: the tables and rules were already in `schema.sql`.
- **Version 1 is complete and waiting for the owner to try it for real.** Steps 3 to 6 were tested with stand-ins (sign up, search, open a book, rate with half stars, review, update, delete, follow, unfollow, feed, missing user/book messages, phone layout), never against the real Supabase and Open Library.
- **Hosting: done.** Site is live on GitHub Pages (first deploy succeeded).
- **Feature 1 (Want to read / Currently reading): built, waiting for the owner to test.** `step7-shelves.sql` applied to the live project by Claude. Tested with stand-ins: add, switch, take off, survives reload, removed when the book is logged, both profile sections, hidden when logged out.
- **Feature 2 (password reset): built.** Tested with stand-ins: link on login page, email request, expired link message, password rules, save, log in with the new password.
- **Batch 2 item 2 (account settings): built.** Header account menu, settings page, `step8-old-usernames.sql` applied (trigger checked on the live database inside a rolled-back test).
- **Batch 2 item 3 (delete account): built.** Tested with stand-ins (confirmation typing, function missing, full delete cascades, goodbye message). The SQL still has to be run by the owner.
- **Batch 2 item 4 (About, Privacy, Terms, footer): built.**
- **Batch 2 (owner's list of 16, see below): in progress.**

## Waiting on the owner

- Run `supabase/step9-delete-account.sql` in the Supabase SQL Editor. Claude's connector can't run SQL that touches the login table (`auth.users`): it waits for an approval that never arrives and times out. Until it's run, the Delete account button says deleting isn't switched on yet and deletes nothing.

## Notes for later steps

- Supabase sends a confirmation email on sign up by default. The link in it goes to the Site URL, now the live site. To skip it while testing: Authentication -> Sign In / Providers -> Email -> turn off "Confirm email".
- Google sign in only works on the live site, not from a `file://` path, because Google sends the user back to a web address. The button already exists; what's missing is the Google Cloud OAuth client and turning on the Google provider in Supabase.
- Claude's cloud environment can't open github.io, supabase.co or openlibrary.org, so it checks deploys through GitHub's "pages build and deployment" runs and tests code with stand-ins.
- The **Supabase connector** is connected (project id `trfgztdvecpswcwoakyz`), so Claude can inspect the database, apply SQL and run Supabase's security advisor. SQL that changes or deletes from `auth.users` (the login table) always times out through the connector, probably because it needs an approval the owner never sees; give that SQL to the owner to run instead.
- Security advisor, last check: one remaining warning, "Leaked password protection disabled" (a dashboard setting under Authentication; may need a paid plan).
- Profile links like `yoursite.com/username` need a small redirect trick on static hosting (e.g. a `404.html` that reads the path). Until then use `profile.html?u=username`.
