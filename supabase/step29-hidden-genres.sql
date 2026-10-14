-- ------------------------------------------------------------
-- Step 29: Hidden genres
-- ------------------------------------------------------------
-- profiles.hidden_genres: genres someone never wants to see (Settings ->
-- Hidden genres). Books with any of them are left out of rows, search,
-- feeds and recommendations (js/sources.js does the filtering; nothing
-- else in the database changes). Only the normal listed genres (not the
-- comics/manga universe genres), at most 30, empty by default. People
-- change it with the existing rule "Users can update their own profile".
-- Logged-out visitors keep their list in the browser instead.
-- Applied through the Supabase connector after testing on the local copy.
-- ------------------------------------------------------------

alter table public.profiles
  add column hidden_genres text[] not null default '{}';

alter table public.profiles
  add constraint profiles_hidden_genres_known check (
    hidden_genres <@ array[
      'fantasy', 'science_fiction', 'mystery', 'thriller', 'romance', 'horror', 'historical_fiction', 'literary_fiction', 'classics', 'young_adult', 'children', 'dystopian', 'adventure', 'humour', 'short_stories', 'poetry', 'biography', 'history', 'science', 'philosophy', 'psychology', 'self_help', 'business', 'true_crime', 'travel', 'food', 'religion', 'politics', 'art'
    ]::text[]
    and cardinality(hidden_genres) <= 30
  );
