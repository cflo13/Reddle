-- ------------------------------------------------------------
-- Step 17: Likes on reviews (Part D)
-- ------------------------------------------------------------
-- A heart on each log card. One like per person per log; press again
-- to take it back. Everyone can see likes; you can only add or remove
-- your own. Deleting a log or an account removes its likes.
-- ------------------------------------------------------------

create table public.likes (
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  log_id      bigint not null references public.logs (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, log_id)
);

create index likes_log_idx on public.likes (log_id);

alter table public.likes enable row level security;

create policy "Everyone can see likes"
  on public.likes for select using (true);

create policy "Users can like as themselves"
  on public.likes for insert to authenticated
  with check (user_id = auth.uid());

create policy "Users can remove their own likes"
  on public.likes for delete to authenticated
  using (user_id = auth.uid());

-- How many likes each log has (the page asks for the logs it shows).
create view public.log_like_counts
  with (security_invoker = true) as
  select log_id, count(*)::int as like_count
  from public.likes
  group by log_id;

grant select on public.log_like_counts to anon, authenticated;
