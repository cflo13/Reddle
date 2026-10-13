-- ------------------------------------------------------------
-- Step 22: A livelier feed (Part M)
-- ------------------------------------------------------------
-- * weekly_prompts: a question of the week, set by admins.
-- * book_picks: Book of the week, chosen by admins (with a note).
-- * posts: "Share a thought": text (1 to 1000), optionally one book,
--   one picture (in the post-images bucket, in the author's own folder),
--   or an answer to a weekly prompt.
-- * post_likes: one like per person per post.
-- * comments: one table for comments on reviews (log_id), posts
--   (post_id) and the Book of the week discussion (pick_id); 1 to 500
--   characters.
-- * content_reports: reports about posts and comments (the old reports
--   table stays for reviews and profiles).
-- * trending_books_week: the books with the most logs, posts and
--   comments in the last 7 days.
-- * unread_activity_count(since): likes and comments on your posts and
--   reviews since a moment (for the bell).
-- Privacy: posts, post likes and comments follow the same rules as logs
-- (private profiles, blocks; can_see_activity() from step 20). Blocked
-- people can't like or comment on each other's things. Spam limits
-- (check_rate_limit() from step 20) now also cover posts, post likes,
-- comments and content reports.
-- Like step 20, extra visibility rules are RESTRICTIVE policies, so
-- nothing older has to be dropped.
-- ------------------------------------------------------------


-- ---------- Weekly prompts and Book of the week ----------

create table public.weekly_prompts (
  id          bigint generated always as identity primary key,
  question    text not null check (char_length(btrim(question)) between 3 and 200),
  created_by  uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

alter table public.weekly_prompts enable row level security;
create policy "Everyone can see prompts" on public.weekly_prompts for select using (true);
create policy "Admins add prompts" on public.weekly_prompts for insert to authenticated with check (public.is_admin());
create policy "Admins remove prompts" on public.weekly_prompts for delete to authenticated using (public.is_admin());

create table public.book_picks (
  id          bigint generated always as identity primary key,
  book_id     bigint not null references public.books (id) on delete cascade,
  note        text check (char_length(note) <= 600),
  created_by  uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index book_picks_created_idx on public.book_picks (created_at desc);

alter table public.book_picks enable row level security;
create policy "Everyone can see book picks" on public.book_picks for select using (true);
create policy "Admins choose book picks" on public.book_picks for insert to authenticated with check (public.is_admin());
create policy "Admins remove book picks" on public.book_picks for delete to authenticated using (public.is_admin());


-- ---------- Posts ----------

create table public.posts (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body        text not null check (char_length(btrim(body)) between 1 and 1000),
  book_id     bigint references public.books (id) on delete set null,
  -- The picture must be in our post-images bucket, in the author's folder.
  image_url   text check (
    image_url is null or (
      char_length(image_url) <= 500
      and image_url like 'https://trfgztdvecpswcwoakyz.supabase.co/storage/v1/object/public/post-images/' || user_id::text || '/%'
    )
  ),
  prompt_id   bigint references public.weekly_prompts (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index posts_created_idx on public.posts (created_at desc);
create index posts_user_idx on public.posts (user_id, created_at desc);
create index posts_prompt_idx on public.posts (prompt_id, created_at desc);
create index posts_book_idx on public.posts (book_id);

alter table public.posts enable row level security;
create policy "Everyone can see posts" on public.posts for select using (true);
create policy "Private and blocked posts stay hidden"
  on public.posts as restrictive for select using (public.can_see_activity(user_id));
create policy "Users write their own posts"
  on public.posts for insert to authenticated with check (user_id = auth.uid());
create policy "Authors and admins delete posts"
  on public.posts for delete to authenticated using (user_id = auth.uid() or public.is_admin());

-- Who wrote a post, or nothing when the person asking can't see it.
create or replace function public.post_owner(p_post_id bigint)
returns uuid
language sql stable security definer set search_path = public
as $$
  select user_id from public.posts
  where id = p_post_id and public.can_see_activity(user_id);
$$;
revoke execute on function public.post_owner(bigint) from public, anon;
grant execute on function public.post_owner(bigint) to authenticated;

-- Yes/no versions for the "who can see" rules (they only say whether the
-- person asking can see the thing, so everyone may call them).
create or replace function public.can_see_post(p_post_id bigint)
returns boolean
language sql stable security definer set search_path = public
as $$ select public.post_owner(p_post_id) is not null; $$;

create or replace function public.can_see_log(p_log_id bigint)
returns boolean
language sql stable security definer set search_path = public
as $$ select public.log_owner(p_log_id) is not null; $$;

grant execute on function public.can_see_post(bigint) to anon, authenticated;
grant execute on function public.can_see_log(bigint) to anon, authenticated;


-- ---------- Likes on posts ----------

create table public.post_likes (
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  post_id     bigint not null references public.posts (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, post_id)
);
create index post_likes_post_idx on public.post_likes (post_id);

alter table public.post_likes enable row level security;
create policy "Everyone can see post likes" on public.post_likes for select using (true);
create policy "Private and blocked post likes stay hidden"
  on public.post_likes as restrictive for select
  using (public.can_see_activity(user_id) and public.can_see_post(post_id));
create policy "Users like as themselves"
  on public.post_likes for insert to authenticated with check (user_id = auth.uid());
create policy "No likes on hidden or blocked posts"
  on public.post_likes as restrictive for insert
  with check (
    public.post_owner(post_id) is not null
    and not public.is_blocked_pair(user_id, public.post_owner(post_id))
  );
create policy "Users remove their own post likes"
  on public.post_likes for delete to authenticated using (user_id = auth.uid());

-- Likes on reviews you can't see stay hidden too (so their counts don't
-- give anything away). Adds to the rules in step 17 and step 20.
create policy "Likes on hidden reviews stay hidden"
  on public.likes as restrictive for select using (public.can_see_log(log_id));

create view public.post_like_counts with (security_invoker = true) as
  select post_id, count(*)::int as like_count from public.post_likes group by post_id;
grant select on public.post_like_counts to anon, authenticated;


-- ---------- Comments (reviews, posts, Book of the week) ----------

create table public.comments (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  log_id      bigint references public.logs (id) on delete cascade,
  post_id     bigint references public.posts (id) on delete cascade,
  pick_id     bigint references public.book_picks (id) on delete cascade,
  body        text not null check (char_length(btrim(body)) between 1 and 500),
  created_at  timestamptz not null default now(),
  check (num_nonnulls(log_id, post_id, pick_id) = 1)
);
create index comments_log_idx on public.comments (log_id, created_at) where log_id is not null;
create index comments_post_idx on public.comments (post_id, created_at) where post_id is not null;
create index comments_pick_idx on public.comments (pick_id, created_at) where pick_id is not null;
create index comments_user_idx on public.comments (user_id, created_at desc);

-- Whose review or post a comment is on (null for Book of the week, or
-- when the person asking can't see it).
create or replace function public.comment_target_owner(p_log_id bigint, p_post_id bigint)
returns uuid
language sql stable security definer set search_path = public
as $$
  select case
    when p_log_id is not null then public.log_owner(p_log_id)
    when p_post_id is not null then public.post_owner(p_post_id)
  end;
$$;

-- May the person asking see (or comment on) this thing?
create or replace function public.can_see_comment_target(p_log_id bigint, p_post_id bigint, p_pick_id bigint)
returns boolean
language sql stable security definer set search_path = public
as $$
  select case
    when p_pick_id is not null then exists (select 1 from public.book_picks where id = p_pick_id)
    else public.comment_target_owner(p_log_id, p_post_id) is not null
  end;
$$;
revoke execute on function public.comment_target_owner(bigint, bigint) from public, anon;
grant execute on function public.comment_target_owner(bigint, bigint) to authenticated;
grant execute on function public.can_see_comment_target(bigint, bigint, bigint) to anon, authenticated;

alter table public.comments enable row level security;
create policy "Everyone can see comments" on public.comments for select using (true);
create policy "Private, blocked and hidden comments stay hidden"
  on public.comments as restrictive for select
  using (public.can_see_activity(user_id) and public.can_see_comment_target(log_id, post_id, pick_id));
create policy "Users comment as themselves"
  on public.comments for insert to authenticated with check (user_id = auth.uid());
create policy "No comments on hidden or blocked things"
  on public.comments as restrictive for insert
  with check (
    public.can_see_comment_target(log_id, post_id, pick_id)
    and not public.is_blocked_pair(user_id, public.comment_target_owner(log_id, post_id))
  );
create policy "Authors and admins delete comments"
  on public.comments for delete to authenticated using (user_id = auth.uid() or public.is_admin());

create view public.comment_counts with (security_invoker = true) as
  select log_id, post_id, pick_id, count(*)::int as comment_count
  from public.comments group by log_id, post_id, pick_id;
grant select on public.comment_counts to anon, authenticated;


-- ---------- Reports about posts and comments ----------

create table public.content_reports (
  id           bigint generated always as identity primary key,
  reporter_id  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  post_id      bigint references public.posts (id) on delete cascade,
  comment_id   bigint references public.comments (id) on delete cascade,
  reason       text check (char_length(reason) <= 500),
  status       text not null default 'open' check (status in ('open', 'dismissed')),
  created_at   timestamptz not null default now(),
  check (num_nonnulls(post_id, comment_id) = 1)
);
create unique index content_reports_one_per_post on public.content_reports (reporter_id, post_id) where post_id is not null;
create unique index content_reports_one_per_comment on public.content_reports (reporter_id, comment_id) where comment_id is not null;
create index content_reports_status_idx on public.content_reports (status, created_at desc);

alter table public.content_reports enable row level security;
create policy "Logged-in users can report posts and comments"
  on public.content_reports for insert to authenticated
  with check (reporter_id = auth.uid() and status = 'open');
create policy "Admins read content reports" on public.content_reports for select using (public.is_admin());
create policy "Admins update content reports" on public.content_reports for update using (public.is_admin());
create policy "Admins delete content reports" on public.content_reports for delete using (public.is_admin());


-- ---------- Pictures for posts ----------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-images', 'post-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "Anyone can view post pictures"
  on storage.objects for select using (bucket_id = 'post-images');
create policy "Users upload post pictures to their own folder"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'post-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Users delete their own post pictures"
  on storage.objects for delete to authenticated
  using (bucket_id = 'post-images' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));


-- ---------- Trending: most talked about books this week ----------

create view public.trending_books_week with (security_invoker = true) as
  select b.id, b.external_id, b.title, b.author, b.cover_url, count(*)::int as activity
  from (
    select book_id from public.logs where created_at > now() - interval '7 days'
    union all
    select book_id from public.posts where book_id is not null and created_at > now() - interval '7 days'
    union all
    select l.book_id from public.comments c join public.logs l on l.id = c.log_id
      where c.created_at > now() - interval '7 days'
    union all
    select p.book_id from public.comments c join public.posts p on p.id = c.post_id
      where p.book_id is not null and c.created_at > now() - interval '7 days'
    union all
    select bp.book_id from public.comments c join public.book_picks bp on bp.id = c.pick_id
      where c.created_at > now() - interval '7 days'
  ) activity
  join public.books b on b.id = activity.book_id
  group by b.id, b.external_id, b.title, b.author, b.cover_url;
grant select on public.trending_books_week to anon, authenticated;


-- ---------- New likes and comments on your things (for the bell) ----------
-- Runs as the person asking, so all the rules above still apply.

create or replace function public.unread_activity_count(since timestamptz)
returns integer
language sql stable set search_path = public
as $$
  select (
    (select count(*) from public.likes k join public.logs l on l.id = k.log_id
      where l.user_id = auth.uid() and k.user_id <> auth.uid() and k.created_at > since)
    + (select count(*) from public.post_likes k join public.posts p on p.id = k.post_id
      where p.user_id = auth.uid() and k.user_id <> auth.uid() and k.created_at > since)
    + (select count(*) from public.comments c left join public.logs l on l.id = c.log_id
        left join public.posts p on p.id = c.post_id
      where coalesce(l.user_id, p.user_id) = auth.uid() and c.user_id <> auth.uid() and c.created_at > since)
  )::int;
$$;
revoke execute on function public.unread_activity_count(timestamptz) from public, anon;
grant execute on function public.unread_activity_count(timestamptz) to authenticated;


-- ---------- Spam limits for the new things ----------
-- Same as step 20, plus posts, post likes, comments and content reports.

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

  case tg_table_name
    when 'logs' then
      who_column := 'user_id';
      per_minute := case when new_account then 40 else 60 end;
      per_hour := case when new_account then 150 else 500 end;
    when 'likes', 'post_likes' then
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
    when 'reports', 'content_reports' then
      who_column := 'reporter_id';
      per_minute := case when new_account then 3 else 5 end;
      per_hour := case when new_account then 10 else 20 end;
    when 'feedback' then
      who_column := 'user_id';
      per_minute := 3;
      per_hour := case when new_account then 5 else 10 end;
    when 'posts' then
      who_column := 'user_id';
      per_minute := case when new_account then 3 else 10 end;
      per_hour := case when new_account then 15 else 60 end;
    when 'comments' then
      who_column := 'user_id';
      per_minute := case when new_account then 5 else 10 end;
      per_hour := case when new_account then 30 else 100 end;
    else
      return new;
  end case;

  if tg_table_name = 'logs' then
    if exists (
      select 1 from public.logs
      where user_id = (to_jsonb(new) ->> 'user_id')::uuid
        and book_id = (to_jsonb(new) ->> 'book_id')::bigint
    ) then
      return new;
    end if;
  end if;

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

revoke execute on function public.check_rate_limit() from public, anon, authenticated;

create trigger rate_limit_posts before insert on public.posts
  for each row execute function public.check_rate_limit();
create trigger rate_limit_post_likes before insert on public.post_likes
  for each row execute function public.check_rate_limit();
create trigger rate_limit_comments before insert on public.comments
  for each row execute function public.check_rate_limit();
create trigger rate_limit_content_reports before insert on public.content_reports
  for each row execute function public.check_rate_limit();

-- Comment emails (the notify-email function decides whether to send).
create trigger email_on_comment after insert on public.comments
  for each row execute function public.notify_email();
