-- ============================================================
-- Taste questionnaire: favourite genres
-- ============================================================
-- Run once, after step14-genres.sql. (Already applied to the live project.)
--
-- profiles.favorite_genres: the genres someone picked in the taste
-- questionnaire (welcome.html). Used for recommendations. Same list of
-- allowed genre names as books.genres.
-- ============================================================

alter table public.profiles
  add column favorite_genres text[] not null default '{}';

alter table public.profiles
  add constraint profiles_favorite_genres_known check (favorite_genres <@ array[
    'fantasy', 'science_fiction', 'mystery', 'thriller', 'romance', 'horror', 'historical_fiction', 'literary_fiction', 'classics', 'young_adult', 'children', 'dystopian', 'adventure', 'humour', 'short_stories', 'poetry', 'graphic_novels', 'biography', 'history', 'science', 'philosophy', 'psychology', 'self_help', 'business', 'true_crime', 'travel', 'food', 'religion', 'politics', 'art'
  ]::text[]);
