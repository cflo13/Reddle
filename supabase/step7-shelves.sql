-- ============================================================
-- Feature: Want to read / Currently reading
-- ============================================================
-- Run once, after schema.sql. (Already applied to the live project.)
--
-- A "shelf" row says a user has put a book on one of two shelves:
--   'want_to_read'       - they plan to read it
--   'currently_reading'  - they are reading it now
-- A book can be on at most one shelf per user (the primary key).
-- When someone logs a book (finished it), the site removes it from
-- their shelf.
-- ============================================================

create table public.shelves (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  book_id     bigint not null references public.books (id) on delete cascade,
  status      text not null check (status in ('want_to_read', 'currently_reading')),
  created_at  timestamptz not null default now(),
  primary key (user_id, book_id)
);

alter table public.shelves enable row level security;

create policy "Anyone can view shelves"
  on public.shelves for select using (true);

create policy "Users can add to their own shelves"
  on public.shelves for insert with check (auth.uid() = user_id);

create policy "Users can change their own shelves"
  on public.shelves for update using (auth.uid() = user_id);

create policy "Users can remove from their own shelves"
  on public.shelves for delete using (auth.uid() = user_id);

-- Makes "this book's shelf rows" lookups fast.
create index shelves_book_id_idx on public.shelves (book_id);
