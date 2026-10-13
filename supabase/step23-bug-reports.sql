-- ------------------------------------------------------------
-- Step 23: Bug reports (Part N)
-- ------------------------------------------------------------
-- The Feedback pop-up becomes a bug report form:
--  * a kind (bug, idea, something else) and, for bugs, what you were
--    trying to do (steps) and what happened instead (message);
--  * an optional screenshot in the private "feedback-pictures" bucket;
--  * a little automatic device info (browser and device, screen width,
--    installed app or not; the page address was already kept);
--  * a status the admin changes: new, looking, fixed, wont_fix;
--  * visitors who aren't logged in can send one too, if they give an
--    email address so we can reply (spam limits are stricter for them).
-- Only admins can read reports or change their status.
-- Applied through the Supabase connector.
-- ------------------------------------------------------------

alter table public.feedback
  add column kind          text not null default 'other' check (kind in ('bug', 'idea', 'other')),
  add column steps         text check (steps is null or char_length(btrim(steps)) between 1 and 2000),
  add column picture_path  text,
  add column device_info   text check (char_length(device_info) <= 200),
  add column screen_width  integer check (screen_width between 0 and 10000),
  add column installed_app boolean not null default false,
  add column status        text not null default 'new' check (status in ('new', 'looking', 'fixed', 'wont_fix')),
  add column contact_email text;

-- Reports from visitors who aren't logged in have no user.
alter table public.feedback alter column user_id drop not null;

alter table public.feedback
  -- The two boxes together stay within 2000 characters.
  add constraint feedback_total_length
    check (char_length(message) + coalesce(char_length(steps), 0) <= 2000),
  -- A reply address must look like an email address.
  add constraint feedback_contact_email
    check (contact_email is null or (char_length(contact_email) <= 254
      and contact_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  -- Every report says who sent it: a user or an email address.
  add constraint feedback_sender
    check (user_id is not null or contact_email is not null),
  -- A screenshot must be in the sender's own folder.
  add constraint feedback_picture
    check (picture_path is null or (user_id is not null
      and picture_path ~ ('^' || user_id::text || '/[A-Za-z0-9_-]+\.jpg$')));

create index feedback_status_idx on public.feedback (status, created_at desc);


-- ---------- Who can do what ----------

-- Reading and deleting stay admin-only; they now apply to logged-in
-- people only (visitors never read, and can't run is_admin()).
alter policy "Admins can read feedback" on public.feedback to authenticated;
alter policy "Admins can delete feedback" on public.feedback to authenticated;

-- Visitors: only with a reply address, never a user or a picture.
create policy "Visitors can send bug reports"
  on public.feedback for insert to anon
  with check (user_id is null and contact_email is not null and picture_path is null);

-- Every new report starts as "new".
create policy "New reports start as new"
  on public.feedback as restrictive for insert
  with check (status = 'new');

-- Only admins change the status.
create policy "Admins can update feedback"
  on public.feedback for update to authenticated
  using (public.is_admin()) with check (public.is_admin());


-- ---------- Screenshots (private bucket, one folder per user) ----------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('feedback-pictures', 'feedback-pictures', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "Users upload feedback pictures to their own folder"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'feedback-pictures' and (storage.foldername(name))[1] = auth.uid()::text);

-- Admins see every screenshot; the sender only their own (so the site
-- can remove it again, e.g. when they delete their account). Nobody else.
create policy "Admins and the sender see feedback pictures"
  on storage.objects for select to authenticated
  using (bucket_id = 'feedback-pictures' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

create policy "Admins and the sender delete feedback pictures"
  on storage.objects for delete to authenticated
  using (bucket_id = 'feedback-pictures' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));


-- ---------- Spam limits ----------
-- Same as step 22, plus: visitors who aren't logged in may send at
-- most 3 reports a minute and 10 an hour between them, and 2 an hour
-- per email address.

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
    -- Visitors (not logged in) can only send bug reports.
    if tg_table_name = 'feedback' and coalesce(auth.role(), '') = 'anon' then
      select count(*) filter (where created_at > now() - interval '1 minute'), count(*)
        into last_minute, last_hour
        from public.feedback
       where user_id is null and created_at > now() - interval '1 hour';
      if last_minute >= 3 or last_hour >= 10 or (
        select count(*) from public.feedback
         where user_id is null
           and lower(contact_email) = lower(to_jsonb(new) ->> 'contact_email')
           and created_at > now() - interval '1 hour'
      ) >= 2 then
        raise exception 'You''re going a bit fast. Please wait a few minutes and try again.'
          using errcode = 'P0001', hint = 'rate_limit';
      end if;
    end if;
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
