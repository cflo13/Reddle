-- ============================================================
-- Account settings: remember old usernames
-- ============================================================
-- Run once, after schema.sql. (Already applied to the live project.)
--
-- When someone changes their username, their old profile links
-- (profile.html?u=oldname) would stop working. This table remembers
-- each old username and who it belonged to, so the profile page can
-- send visitors on to the person's new name.
--
-- If someone else later takes that old name, their profile wins: the
-- profile page only looks here when no current user has the name.
-- ============================================================

create table public.old_usernames (
  username    text primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  changed_at  timestamptz not null default now()
);

alter table public.old_usernames enable row level security;

create policy "Anyone can look up old usernames"
  on public.old_usernames for select using (true);
-- No insert/update/delete rules: only the trigger below writes here.

-- Runs whenever a profile's username changes and saves the old one.
create or replace function public.remember_old_username()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.username is distinct from old.username then
    insert into public.old_usernames (username, user_id)
    values (old.username, old.id)
    on conflict (username) do update
      set user_id = excluded.user_id, changed_at = now();
  end if;
  return new;
end;
$$;

create trigger profiles_remember_old_username
  after update of username on public.profiles
  for each row execute function public.remember_old_username();

-- Nobody may call the function directly through the website's API.
revoke execute on function public.remember_old_username() from public, anon, authenticated;
