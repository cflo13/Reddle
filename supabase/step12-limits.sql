-- ============================================================
-- Limits the database enforces, not just the website
-- ============================================================
-- Run once, after schema.sql. (Already applied to the live project.)
--
-- The browser already checks these, but anyone could skip the website
-- and talk to the database directly with the public key. These rules
-- make the database refuse anything that breaks them.
--
-- Already in earlier files:
--   usernames: lowercase letters, numbers, _ ; 3 to 20 characters
--   bio: at most 300 characters
--   ratings: 0.5 to 5 in half steps
--   reports: reason at most 500 characters
-- ============================================================

-- Reviews: at most 5000 characters, and not just spaces.
alter table public.logs
  add constraint logs_review_length check (char_length(review) <= 5000),
  add constraint logs_review_not_blank check (btrim(review) <> ''),
  -- A sensible reading date (the website also stops future dates).
  add constraint logs_date_read_sensible check (date_read between date '1000-01-01' and date '2200-01-01');

-- Bio: not just spaces.
alter table public.profiles
  add constraint profiles_bio_not_blank check (btrim(bio) <> ''),
  -- Profile pictures must be in our own avatars storage, so nobody can
  -- point their picture at some other website.
  add constraint profiles_avatar_url_ours check (
    avatar_url like 'https://trfgztdvecpswcwoakyz.supabase.co/storage/v1/object/public/avatars/%'
  );

-- Saved books: real Open Library ids and sensible sizes.
alter table public.books
  add constraint books_external_id_format check (external_id ~ '^OL[0-9]+W$'),
  add constraint books_title_length check (btrim(title) <> '' and char_length(title) <= 500),
  add constraint books_author_length check (char_length(author) <= 500),
  add constraint books_description_length check (char_length(description) <= 20000),
  add constraint books_isbn_length check (char_length(isbn) <= 20),
  add constraint books_cover_url_https check (cover_url ~ '^https://' and char_length(cover_url) <= 1000);
