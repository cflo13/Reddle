-- ------------------------------------------------------------
-- Step 19: Reading goals (Part I)
-- ------------------------------------------------------------
-- "Read 30 books in 2026". One goal per person per year. Everyone can
-- see goals (step 20 hides them for private profiles); you can only
-- set, change or remove your own.
-- ------------------------------------------------------------

create table public.reading_goals (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  year        integer not null check (year between 2000 and 2200),
  target      integer not null check (target between 1 and 1000),
  created_at  timestamptz not null default now(),
  primary key (user_id, year)
);

alter table public.reading_goals enable row level security;

create policy "Everyone can see reading goals"
  on public.reading_goals for select using (true);

create policy "Users can set their own goal"
  on public.reading_goals for insert to authenticated
  with check (user_id = auth.uid());

create policy "Users can change their own goal"
  on public.reading_goals for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "Users can remove their own goal"
  on public.reading_goals for delete to authenticated
  using (user_id = auth.uid());

-- Diaries list a person's logs by date read.
create index logs_user_date_idx on public.logs (user_id, date_read desc);
