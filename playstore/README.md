# Reddle on Google Play

Pictures and notes for the Play Store listing. Nothing in this folder is
linked from the site (robots.txt keeps search engines out of it).

## Pictures

| File | What it is | Where it goes in Play Console |
|---|---|---|
| `app-icon-512.png` | 512 x 512 app icon (full square; Google rounds the corners) | Store listing → App icon |
| `feature-graphic.png` | 1024 x 500 banner with "Letterboxd for books" | Store listing → Feature graphic |
| `feature-graphic-alternative.png` | the same banner with "Your reading life, beautifully kept" instead (safer: no other company's name) | use this one if Google objects to the first |
| `phone-1-home.png` ... `phone-6-comics.png` | six 1080 x 1920 phone screenshots: home, a book, a profile, search, the diary, the Comics universe | Store listing → Phone screenshots |

The screenshots show made-up readers, books and covers (no real users, no
real books or brands).

## The fingerprint (do this once Play Console gives it to you)

1. Play Console → your app → Test and release → **App integrity** → App signing.
2. Copy the **SHA-256 certificate fingerprint** under "App signing key certificate"
   (it looks like `AB:CD:12:...`, 32 pairs).
3. Open `.well-known/assetlinks.json` in this repository and replace
   `REPLACE_WITH_SHA256_FINGERPRINT_FROM_PLAY_CONSOLE` (line 7) with it,
   keeping the quotes. If PWABuilder also gave you its own signing key's
   fingerprint, add it as a second item in the same list:
   `["AA:BB:...", "CC:DD:..."]`.
4. Save, and the site updates in about a minute. Until this is done the app
   still works, but Android shows a browser bar at the top.

## Account deletion link

Play Console asks for it under App content → Data safety (and Delete account
URL): `https://reddle.org/deleteaccount.html`

## Data safety answers

- **Does your app collect or share user data?** Yes, it collects. It does not
  share (the services below run Reddle for us, which Google doesn't count as
  sharing; Open Library and Google Books are only contacted when you open or
  search for a book).
- **Is all data encrypted in transit?** Yes (HTTPS everywhere).
- **Can people ask for their data to be deleted?** Yes (in Settings, or by email;
  see the link above).

Collected (none of it is used for ads, analytics, or sold):

| Data type (Google's name) | What exactly | Why | Required? |
|---|---|---|---|
| Personal info → Email address | login email; the reply address on a logged-out bug report | Account management, Developer communications | Required for an account |
| Personal info → Name | only with Google sign in (Google sends it; we don't show it) | Account management | Optional |
| Personal info → User IDs | username and account id | App functionality, Account management | Required for an account |
| Photos and videos → Photos | profile picture, pictures on posts, bug report screenshots | App functionality | Optional |
| App activity → Other user-generated content | reviews, ratings, posts, comments, bio | App functionality | Optional |
| App activity → Other actions | logged books, shelves, likes, follows, reading goal, favourite and hidden genres, blocks and mutes | App functionality, Personalisation | Optional |
| App info and performance → Diagnostics | only inside a bug report you send: browser/device in a few words, screen width, installed app or not | App functionality (fixing bugs) | Optional |

Not collected: location, contacts, phone number, payment info, health,
messages, files, calendar, device ids, web browsing history, search history
(searches go straight from your device to Open Library or Google Books and
aren't stored by us).

Note: Supabase and GitHub Pages keep short technical server logs with IP
addresses for security. They are not used to find anyone's location or
follow them, so they are not declared as "location".
