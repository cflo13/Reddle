-- ============================================================
-- Genres
-- ============================================================
-- Run once, after step12-limits.sql. (Already applied to the live project.)
--
-- * books.genres: each book's genres, as short names ("slugs") from the
--   list in js/books.js (GENRES). The database only accepts those names,
--   so keep this list and that one the same.
-- * books_with_stats: every book with how many times it's been logged,
--   its average rating, and how many logs it got in the last 7 days.
--   Used by genre pages and recommendations.
-- * fill_book_details(): fills in genres, cover, description or ISBN on
--   a saved book where they're missing (books saved before genres
--   existed). It never overwrites something that's already there.
-- ============================================================

alter table public.books
  add column genres text[] not null default '{}';

alter table public.books
  add constraint books_genres_known check (genres <@ array[
    'fantasy', 'science_fiction', 'mystery', 'thriller', 'romance', 'horror', 'historical_fiction', 'literary_fiction', 'classics', 'young_adult', 'children', 'dystopian', 'adventure', 'humour', 'short_stories', 'poetry', 'graphic_novels', 'biography', 'history', 'science', 'philosophy', 'psychology', 'self_help', 'business', 'true_crime', 'travel', 'food', 'religion', 'politics', 'art'
  ]::text[]);

-- Makes "books in this genre" searches fast.
create index books_genres_idx on public.books using gin (genres);


-- Every book plus its numbers. "security_invoker" means the normal
-- rules for books and logs still apply to whoever reads it.
create view public.books_with_stats
with (security_invoker = true) as
select
  b.id,
  b.external_id,
  b.title,
  b.author,
  b.cover_url,
  b.genres,
  count(l.id)::int                                                     as log_count,
  round(avg(l.rating), 2)                                              as avg_rating,
  count(l.rating)::int                                                 as rating_count,
  (count(l.id) filter (where l.created_at > now() - interval '7 days'))::int as logs_this_week
from public.books b
left join public.logs l on l.book_id = b.id
group by b.id;


-- Fill in what's missing on a saved book. Anyone logged in may call it
-- (the website does when it notices a gap), but it only ever fills
-- empty fields, and the limits on books still apply.
create or replace function public.fill_book_details(
  p_book_id bigint,
  p_genres text[],
  p_cover_url text,
  p_description text,
  p_isbn text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Log in first.';
  end if;
  update public.books set
    genres      = case when genres = '{}' and p_genres is not null then p_genres else genres end,
    cover_url   = coalesce(cover_url, p_cover_url),
    description = coalesce(description, p_description),
    isbn        = coalesce(isbn, p_isbn)
  where id = p_book_id;
end;
$$;

revoke execute on function public.fill_book_details(bigint, text[], text, text, text) from public, anon;
grant execute on function public.fill_book_details(bigint, text[], text, text, text) to authenticated;
