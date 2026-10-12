-- ============================================================
-- Reports and moderation
-- ============================================================
-- Run once, after step7. (Already applied to the live project.)
--
-- * admins: who may moderate. Only the site owner, added at the bottom.
-- * reports: what people reported (a review or a profile) and why.
--   Anyone logged in can send a report; only admins can read them.
-- * Admins may delete any review and any profile picture.
-- (Removing a whole user is in step11-admin-remove-user.sql, which the
--  owner runs by hand because it touches the login table.)
-- ============================================================


-- ---------- Admins ----------
create table public.admins (
  user_id  uuid primary key references public.profiles (id) on delete cascade
);

alter table public.admins enable row level security;

-- You can only check whether YOU are an admin (used to show the
-- Admin link in the menu). Nobody can add admins through the website.
create policy "Users can see if they are an admin"
  on public.admins for select using (user_id = auth.uid());

-- true when the logged-in person is an admin. Used by the rules below.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- Logged-out visitors never need it. Logged-in users do: the rules
-- below call it for them. (It only ever answers about the person asking.)
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;


-- ---------- Reports ----------
create table public.reports (
  id                bigint generated always as identity primary key,
  reporter_id       uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  -- Exactly one of these two is filled in: a review, or a profile.
  log_id            bigint references public.logs (id) on delete cascade,
  reported_user_id  uuid references public.profiles (id) on delete cascade,
  reason            text check (char_length(reason) <= 500),
  status            text not null default 'open' check (status in ('open', 'dismissed')),
  created_at        timestamptz not null default now(),
  check ((log_id is null) <> (reported_user_id is null))
);

-- One report per person per review / profile.
create unique index reports_one_per_log on public.reports (reporter_id, log_id) where log_id is not null;
create unique index reports_one_per_user on public.reports (reporter_id, reported_user_id) where reported_user_id is not null;
create index reports_status_idx on public.reports (status, created_at desc);

alter table public.reports enable row level security;

create policy "Logged-in users can send reports"
  on public.reports for insert to authenticated
  with check (reporter_id = auth.uid() and status = 'open');

create policy "Admins can read reports"
  on public.reports for select using (public.is_admin());

create policy "Admins can update reports"
  on public.reports for update using (public.is_admin());

create policy "Admins can delete reports"
  on public.reports for delete using (public.is_admin());


-- ---------- Admin powers ----------
create policy "Admins can delete any log"
  on public.logs for delete using (public.is_admin());

create policy "Admins can delete any avatar"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and public.is_admin());


-- ---------- The site owner is the admin ----------
-- Replace with your own user id (Supabase -> Authentication -> Users).
insert into public.admins (user_id) values ('YOUR-USER-ID-HERE');
