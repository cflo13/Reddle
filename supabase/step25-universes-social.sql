-- ------------------------------------------------------------
-- Step 25: Universes, part c (posts, Book of the week, weekly question)
-- ------------------------------------------------------------
-- Posts, Book of the week picks and weekly questions each belong to one
-- universe: books (the default, so everything posted so far stays in
-- Books), comics or manga. The feed and the home page show only the
-- current universe's. Applied through the Supabase connector.
-- ------------------------------------------------------------

alter table public.posts
  add column universe text not null default 'books'
  check (universe in ('books', 'comics', 'manga'));

alter table public.book_picks
  add column universe text not null default 'books'
  check (universe in ('books', 'comics', 'manga'));

alter table public.weekly_prompts
  add column universe text not null default 'books'
  check (universe in ('books', 'comics', 'manga'));

-- The feed asks for "this universe's posts, newest first".
create index posts_universe_created_idx on public.posts (universe, created_at desc, id desc);
create index book_picks_universe_created_idx on public.book_picks (universe, created_at desc);
create index weekly_prompts_universe_created_idx on public.weekly_prompts (universe, created_at desc);
