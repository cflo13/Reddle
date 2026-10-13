-- ------------------------------------------------------------
-- Step 20: Privacy and safety (Part J)
-- ------------------------------------------------------------
-- 1. Private profiles: profiles.is_private. Everyone still sees the
--    username, picture and bio. Logs, shelves, reading goals and likes
--    of a private person are only visible to them, their approved
--    followers and admins. Following a private person makes a follow
--    request instead; they accept or decline it.
-- 2. Blocks and mutes. A block hides both people from each other
--    (profiles, logs, shelves, goals, likes, search) and stops follows,
--    follow requests and likes between them. A mute is only a list the
--    muter keeps (the site leaves muted people out of their feed).
-- 3. Spam limits: how many follows, follow requests, likes, reports,
--    logs and feedback messages one account can create per minute and
--    per hour, stricter on the account's first day.
--
-- All the "who may see what" rules are RESTRICTIVE policies: they are
-- added on top of the existing rules (both must pass), so nothing older
-- has to be dropped.
-- ------------------------------------------------------------


-- ---------- Tables ----------

alter table public.profiles
  add column is_private boolean not null default false;

create table public.follow_requests (
  requester_id  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  target_id     uuid not null references public.profiles (id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (requester_id, target_id),
  check (requester_id <> target_id)
);
create index follow_requests_target_idx on public.follow_requests (target_id, created_at desc);

create table public.blocks (
  blocker_id  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  blocked_id  uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index blocks_blocked_idx on public.blocks (blocked_id);

create table public.mutes (
  muter_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  muted_id    uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (muter_id, muted_id),
  check (muter_id <> muted_id)
);


-- ---------- Helper checks (used by the rules below) ----------
-- "security definer" lets them look at blocks/follows/profiles without
-- running into the rules they are part of.

-- Has either of these two people blocked the other? It only answers
-- when the person asking is one of the two (or an admin), so nobody can
-- use it to find out about other people's blocks.
create or replace function public.is_blocked_pair(a uuid, b uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select a is not null and b is not null
    and (auth.uid() in (a, b) or public.is_admin())
    and exists (
      select 1 from public.blocks
      where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
    );
$$;

-- May the person looking (auth.uid()) see this person's activity
-- (logs, shelves, goal, likes)? Yes if it's themselves, an admin, or
-- nobody blocked anybody and the profile is public or they're an
-- approved follower.
create or replace function public.can_see_activity(owner uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select owner is not null and (
    owner = auth.uid()
    or public.is_admin()
    or (
      not public.is_blocked_pair(owner, auth.uid())
      and (
        not coalesce((select is_private from public.profiles where id = owner), false)
        or exists (select 1 from public.follows where follower_id = auth.uid() and following_id = owner)
      )
    )
  );
$$;

-- May the person looking see this profile at all? Not when either of
-- them blocked the other (admins always can).
create or replace function public.can_see_profile(person uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_admin() or not public.is_blocked_pair(person, auth.uid());
$$;

-- Who wrote a log (for the like rule), or nothing when the person
-- asking isn't allowed to see that log.
create or replace function public.log_owner(p_log_id bigint)
returns uuid
language sql stable security definer set search_path = public
as $$
  select user_id from public.logs
  where id = p_log_id and public.can_see_activity(user_id);
$$;

revoke execute on function public.log_owner(bigint) from public, anon;
grant execute on function public.log_owner(bigint) to authenticated;
grant execute on function public.is_blocked_pair(uuid, uuid) to anon, authenticated;
grant execute on function public.can_see_activity(uuid) to anon, authenticated;
grant execute on function public.can_see_profile(uuid) to anon, authenticated;


-- ---------- Who sees what ----------

create policy "Private and blocked logs stay hidden"
  on public.logs as restrictive for select
  using (public.can_see_activity(user_id));

create policy "Private and blocked shelves stay hidden"
  on public.shelves as restrictive for select
  using (public.can_see_activity(user_id));

create policy "Private and blocked goals stay hidden"
  on public.reading_goals as restrictive for select
  using (public.can_see_activity(user_id));

create policy "Private and blocked likes stay hidden"
  on public.likes as restrictive for select
  using (public.can_see_activity(user_id));

-- Blocked people disappear for each other (profile pages, search,
-- names on cards). Admins still see everyone.
create policy "Blocked profiles stay hidden"
  on public.profiles as restrictive for select
  using (public.can_see_profile(id));

-- Follows between blocked people don't count (feed, follower lists).
create policy "Follows between blocked people stay hidden"
  on public.follows as restrictive for select
  using (not public.is_blocked_pair(follower_id, following_id));


-- ---------- Following ----------

-- You can only follow a private person by them accepting your request,
-- and never someone you've blocked or who blocked you.
create policy "No following private or blocked people directly"
  on public.follows as restrictive for insert
  with check (
    not public.is_blocked_pair(follower_id, following_id)
    and (
      auth.uid() = following_id  -- accepting a request (see below)
      or not coalesce((select is_private from public.profiles where id = following_id), false)
    )
  );

-- Accepting a request: the private person adds the follow for the
-- person who asked.
create policy "Users can accept follow requests"
  on public.follows for insert to authenticated
  with check (
    auth.uid() = following_id
    and exists (
      select 1 from public.follow_requests
      where requester_id = follower_id and target_id = auth.uid()
    )
  );

-- You can remove people who follow you (also used when blocking).
create policy "Users can remove their followers"
  on public.follows for delete to authenticated
  using (auth.uid() = following_id);

alter table public.follow_requests enable row level security;

create policy "Both people can see a follow request"
  on public.follow_requests for select to authenticated
  using (auth.uid() = requester_id or auth.uid() = target_id);

create policy "Users can ask to follow private people"
  on public.follow_requests for insert to authenticated
  with check (
    requester_id = auth.uid()
    and coalesce((select is_private from public.profiles where id = target_id), false)
    and not public.is_blocked_pair(requester_id, target_id)
    and not exists (select 1 from public.follows where follower_id = requester_id and following_id = target_id)
  );

create policy "Both people can remove a follow request"
  on public.follow_requests for delete to authenticated
  using (auth.uid() = requester_id or auth.uid() = target_id);


-- ---------- Likes between blocked people ----------

create policy "No likes on hidden or blocked logs"
  on public.likes as restrictive for insert
  with check (
    not public.is_blocked_pair(user_id, public.log_owner(log_id))
    and public.can_see_activity(public.log_owner(log_id))
  );


-- ---------- Blocks and mutes: only your own list ----------

alter table public.blocks enable row level security;

create policy "Users see their own blocks"
  on public.blocks for select to authenticated using (blocker_id = auth.uid());
create policy "Users can block"
  on public.blocks for insert to authenticated with check (blocker_id = auth.uid());
create policy "Users can unblock"
  on public.blocks for delete to authenticated using (blocker_id = auth.uid());

alter table public.mutes enable row level security;

create policy "Users see their own mutes"
  on public.mutes for select to authenticated using (muter_id = auth.uid());
create policy "Users can mute"
  on public.mutes for insert to authenticated with check (muter_id = auth.uid());
create policy "Users can unmute"
  on public.mutes for delete to authenticated using (muter_id = auth.uid());

-- Your blocked and muted people with their names, for Settings (their
-- profiles are hidden from you by the block, so a normal query can't
-- show the names).
create or replace function public.my_blocks_and_mutes()
returns table (kind text, user_id uuid, username text, avatar_url text, created_at timestamptz)
language sql stable security definer set search_path = public
as $$
  select 'block', b.blocked_id, p.username, p.avatar_url, b.created_at
  from public.blocks b join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = auth.uid()
  union all
  select 'mute', m.muted_id, p.username, p.avatar_url, m.created_at
  from public.mutes m join public.profiles p on p.id = m.muted_id
  where m.muter_id = auth.uid()
  order by 5 desc;
$$;

revoke execute on function public.my_blocks_and_mutes() from public, anon;
grant execute on function public.my_blocks_and_mutes() to authenticated;


-- ---------- Spam limits ----------
-- Counts what this account created in the last minute and hour.
-- First-day accounts get the smaller numbers. Nothing is limited when
-- there's no logged-in user (the owner's own scripts).

create or replace function public.check_rate_limit()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  who_column text;
  per_minute int;
  per_hour int;
  new_account boolean;
  last_minute int;
  last_hour int;
begin
  if me is null then
    return new;
  end if;

  select created_at > now() - interval '1 day' into new_account
  from public.profiles where id = me;
  new_account := coalesce(new_account, true);

  -- table: who made it, limit per minute, per hour (normal / first day)
  case tg_table_name
    when 'logs' then
      who_column := 'user_id';
      per_minute := case when new_account then 40 else 60 end;
      per_hour := case when new_account then 150 else 500 end;
    when 'likes' then
      who_column := 'user_id';
      per_minute := case when new_account then 20 else 60 end;
      per_hour := case when new_account then 100 else 500 end;
    when 'follows' then
      who_column := 'follower_id';
      per_minute := case when new_account then 10 else 30 end;
      per_hour := case when new_account then 50 else 200 end;
    when 'follow_requests' then
      who_column := 'requester_id';
      per_minute := case when new_account then 5 else 20 end;
      per_hour := case when new_account then 30 else 100 end;
    when 'reports' then
      who_column := 'reporter_id';
      per_minute := case when new_account then 3 else 5 end;
      per_hour := case when new_account then 10 else 20 end;
    when 'feedback' then
      who_column := 'user_id';
      per_minute := 3;
      per_hour := case when new_account then 5 else 10 end;
    else
      return new;
  end case;

  -- Saving a log you already have (the site's "upsert") only edits it,
  -- so it never counts.
  if tg_table_name = 'logs' then
    if exists (
      select 1 from public.logs
      where user_id = (to_jsonb(new) ->> 'user_id')::uuid
        and book_id = (to_jsonb(new) ->> 'book_id')::bigint
    ) then
      return new;
    end if;
  end if;

  -- Accepting a follow request adds a row for the other person; that
  -- doesn't count against them.
  if tg_table_name = 'follows' then
    if (to_jsonb(new) ->> 'follower_id')::uuid <> me then
      return new;
    end if;
  end if;

  execute format(
    'select count(*) filter (where created_at > now() - interval ''1 minute''), count(*) from public.%I where %I = $1 and created_at > now() - interval ''1 hour''',
    tg_table_name, who_column
  ) into last_minute, last_hour using me;

  if last_minute >= per_minute or last_hour >= per_hour then
    raise exception 'You''re going a bit fast. Please wait a few minutes and try again.'
      using errcode = 'P0001', hint = 'rate_limit';
  end if;
  return new;
end;
$$;

-- Only runs as a trigger, never called directly.
revoke execute on function public.check_rate_limit() from public, anon, authenticated;

create trigger rate_limit_logs before insert on public.logs
  for each row execute function public.check_rate_limit();
create trigger rate_limit_likes before insert on public.likes
  for each row execute function public.check_rate_limit();
create trigger rate_limit_follows before insert on public.follows
  for each row execute function public.check_rate_limit();
create trigger rate_limit_follow_requests before insert on public.follow_requests
  for each row execute function public.check_rate_limit();
create trigger rate_limit_reports before insert on public.reports
  for each row execute function public.check_rate_limit();
create trigger rate_limit_feedback before insert on public.feedback
  for each row execute function public.check_rate_limit();
