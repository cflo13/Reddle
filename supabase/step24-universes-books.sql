-- ------------------------------------------------------------
-- Step 24: Universes, part b (books from comics and manga)
-- ------------------------------------------------------------
-- * Two new genres: comics and manga. They decide a book's universe:
--   a book with "manga" is in the Manga universe, "comics" in Comics,
--   neither in Books (a book can be both comics and manga).
-- * Book ids from Google Books too: "GB" + Google's volume id (like
--   GBzyTCAlFPjgYC). Open Library work ids (OL45804W) keep working.
-- * Books saved earlier with the old "graphic_novels" genre become
--   "comics" (other genres untouched). Same for favourite genres.
-- * trending_books_week also gives each book's genres, so the home
--   page row can show only the current universe.
-- Applied through the Supabase connector.
-- ------------------------------------------------------------

-- ---------- Allowed genres (books and favourite genres) ----------
-- "graphic_novels" stays allowed so nothing old can break, but the site
-- no longer gives it out.

alter table public.books drop constraint books_genres_known;
alter table public.books add constraint books_genres_known check (genres <@ array[
  'fantasy', 'science_fiction', 'mystery', 'thriller', 'romance', 'horror', 'historical_fiction', 'literary_fiction', 'classics', 'young_adult', 'children', 'dystopian', 'adventure', 'humour', 'short_stories', 'poetry', 'graphic_novels', 'biography', 'history', 'science', 'philosophy', 'psychology', 'self_help', 'business', 'true_crime', 'travel', 'food', 'religion', 'politics', 'art',
  'comics', 'manga'
]);

alter table public.profiles drop constraint profiles_favorite_genres_known;
alter table public.profiles add constraint profiles_favorite_genres_known check (favorite_genres <@ array[
  'fantasy', 'science_fiction', 'mystery', 'thriller', 'romance', 'horror', 'historical_fiction', 'literary_fiction', 'classics', 'young_adult', 'children', 'dystopian', 'adventure', 'humour', 'short_stories', 'poetry', 'graphic_novels', 'biography', 'history', 'science', 'philosophy', 'psychology', 'self_help', 'business', 'true_crime', 'travel', 'food', 'religion', 'politics', 'art',
  'comics', 'manga'
]);


-- ---------- Book ids: Open Library or Google Books ----------

alter table public.books drop constraint books_external_id_format;
alter table public.books add constraint books_external_id_format
  check (external_id ~ '^(OL[0-9]+W|GB[A-Za-z0-9_-]{6,20})$');


-- ---------- Books already saved ----------
-- Only rows that have the old genre change; everything else stays.

update public.books
   set genres = array_replace(genres, 'graphic_novels', 'comics')
 where 'graphic_novels' = any (genres);

update public.profiles
   set favorite_genres = array_replace(favorite_genres, 'graphic_novels', 'comics')
 where 'graphic_novels' = any (favorite_genres);


-- ---------- Trending, now with genres ----------
-- (New column at the end, so "create or replace" keeps the view.)

create or replace view public.trending_books_week with (security_invoker = true) as
  select b.id, b.external_id, b.title, b.author, b.cover_url, count(*)::int as activity, b.genres
  from (
    select book_id from public.logs where created_at > now() - interval '7 days'
    union all
    select book_id from public.posts where book_id is not null and created_at > now() - interval '7 days'
    union all
    select l.book_id from public.comments c join public.logs l on l.id = c.log_id
      where c.created_at > now() - interval '7 days'
    union all
    select p.book_id from public.comments c join public.posts p on p.id = c.post_id
      where p.book_id is not null and c.created_at > now() - interval '7 days'
    union all
    select bp.book_id from public.comments c join public.book_picks bp on bp.id = c.pick_id
      where c.created_at > now() - interval '7 days'
  ) activity
  join public.books b on b.id = activity.book_id
  group by b.id, b.external_id, b.title, b.author, b.cover_url, b.genres;
