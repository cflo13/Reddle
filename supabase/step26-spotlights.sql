-- ------------------------------------------------------------
-- Step 26: Spotlight cards (Universes, part d)
-- ------------------------------------------------------------
-- Admin news for one universe, like Book of the week but about a theme:
-- a title, a short note (up to 600), up to 6 books, comics or manga,
-- an optional outside link (https only; shown as a normal link, we
-- never copy the article), and a universe. Shown at the top of that
-- universe's home page and feed, with a comment thread like Book of the
-- week. Only admins add or delete them.
-- Comments on spotlights follow the same rules as every other comment
-- (private and blocked people's comments hidden, spam limits from step
-- 22, delete your own, admins delete any, reports).
-- Applied through the Supabase connector.
-- ------------------------------------------------------------

create table public.spotlights (
  id          bigint generated always as identity primary key,
  title       text not null check (char_length(btrim(title)) between 1 and 120),
  note        text check (note is null or char_length(note) <= 600),
  link_url    text check (link_url is null or (link_url ~ '^https://[^\s]+$' and char_length(link_url) <= 500)),
  universe    text not null default 'books' check (universe in ('books', 'comics', 'manga')),
  created_by  uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index spotlights_universe_created_idx on public.spotlights (universe, created_at desc);

-- The books on a spotlight, in order (1 to 6, so never more than 6).
create table public.spotlight_books (
  spotlight_id bigint not null references public.spotlights (id) on delete cascade,
  book_id      bigint not null references public.books (id) on delete cascade,
  position     smallint not null check (position between 1 and 6),
  primary key (spotlight_id, book_id),
  unique (spotlight_id, position)
);

alter table public.spotlights enable row level security;
create policy "Everyone can see spotlights" on public.spotlights for select using (true);
create policy "Admins add spotlights" on public.spotlights for insert to authenticated with check (public.is_admin());
create policy "Admins remove spotlights" on public.spotlights for delete to authenticated using (public.is_admin());

alter table public.spotlight_books enable row level security;
create policy "Everyone can see spotlight books" on public.spotlight_books for select using (true);
create policy "Admins add spotlight books" on public.spotlight_books for insert to authenticated with check (public.is_admin());
create policy "Admins remove spotlight books" on public.spotlight_books for delete to authenticated using (public.is_admin());


-- ---------- Comments on spotlights ----------

alter table public.comments
  add column spotlight_id bigint references public.spotlights (id) on delete cascade;
create index comments_spotlight_idx on public.comments (spotlight_id, created_at) where spotlight_id is not null;

-- Exactly one thing a comment is on: a review, a post, a pick or a spotlight.
alter table public.comments drop constraint comments_check;
alter table public.comments add constraint comments_one_target
  check (num_nonnulls(log_id, post_id, pick_id, spotlight_id) = 1);

-- May the person asking see (or comment on) this thing? Same as the
-- 3-part version (step 22), plus spotlights.
create or replace function public.can_see_comment_target(p_log_id bigint, p_post_id bigint, p_pick_id bigint, p_spotlight_id bigint)
returns boolean
language sql stable security definer set search_path = public
as $$
  select case
    when p_spotlight_id is not null then exists (select 1 from public.spotlights where id = p_spotlight_id)
    else public.can_see_comment_target(p_log_id, p_post_id, p_pick_id)
  end;
$$;
grant execute on function public.can_see_comment_target(bigint, bigint, bigint, bigint) to anon, authenticated;

alter policy "Private, blocked and hidden comments stay hidden" on public.comments
  using (public.can_see_activity(user_id) and public.can_see_comment_target(log_id, post_id, pick_id, spotlight_id));
alter policy "No comments on hidden or blocked things" on public.comments
  with check (
    public.can_see_comment_target(log_id, post_id, pick_id, spotlight_id)
    and not public.is_blocked_pair(user_id, public.comment_target_owner(log_id, post_id))
  );

-- Comment counts, now also per spotlight (new column at the end).
create or replace view public.comment_counts with (security_invoker = true) as
  select log_id, post_id, pick_id, count(*)::int as comment_count, spotlight_id
  from public.comments group by log_id, post_id, pick_id, spotlight_id;
