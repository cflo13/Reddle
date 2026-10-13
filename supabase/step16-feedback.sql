-- ------------------------------------------------------------
-- Step 16: Feedback (Part C)
-- ------------------------------------------------------------
-- Logged-in people can send a message to the site owner from the
-- Feedback link in the footer. Only admins can read or delete them.
-- Run once in the Supabase SQL Editor (Claude applies it through the
-- Supabase connector).
-- ------------------------------------------------------------

create table public.feedback (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  message     text not null check (char_length(btrim(message)) between 1 and 2000),
  page        text check (char_length(page) <= 300),   -- which page it was sent from
  created_at  timestamptz not null default now()
);

create index feedback_created_idx on public.feedback (created_at desc);

alter table public.feedback enable row level security;

create policy "Logged-in users can send feedback"
  on public.feedback for insert to authenticated
  with check (user_id = auth.uid());

create policy "Admins can read feedback"
  on public.feedback for select using (public.is_admin());

create policy "Admins can delete feedback"
  on public.feedback for delete using (public.is_admin());
