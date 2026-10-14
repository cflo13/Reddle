-- ------------------------------------------------------------
-- Step 27: Book to screen, "Our picks"
-- ------------------------------------------------------------
-- The admin's own list of great books with a great film or series,
-- shown first on screen.html's Best adaptations tab ("Our picks"), per
-- universe. A book and a short note (up to 300 characters). Everyone can
-- read them; only admins add or delete (same rules as spotlights).
-- The film and TV data itself isn't in the database: it comes from
-- Wikidata as small files (screen-data/, made by GitHub every day).
-- Applied through the Supabase connector.
-- ------------------------------------------------------------

create table public.screen_picks (
  id          bigint generated always as identity primary key,
  book_id     bigint not null references public.books (id) on delete cascade,
  note        text check (note is null or char_length(note) <= 300),
  universe    text not null default 'books' check (universe in ('books', 'comics', 'manga')),
  created_by  uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (book_id, universe)
);
create index screen_picks_universe_created_idx on public.screen_picks (universe, created_at desc);

alter table public.screen_picks enable row level security;
create policy "Everyone can see screen picks" on public.screen_picks for select using (true);
create policy "Admins add screen picks" on public.screen_picks for insert to authenticated with check (public.is_admin());
create policy "Admins remove screen picks" on public.screen_picks for delete to authenticated using (public.is_admin());
