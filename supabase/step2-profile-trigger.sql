-- ============================================================
-- Step 2: create the profile automatically at sign up
-- ============================================================
-- Already applied to the live project. Kept here so the setup can be
-- repeated on a new project (run after schema.sql).
--
-- When someone signs up with email and password, the username they chose
-- is stored on their login ("user metadata"). This trigger copies it into
-- the profiles table straight away, even before they confirm their email.
--
-- If the username is missing, badly formed or already taken, the trigger
-- skips it instead of failing the whole sign up. The site then sends the
-- user to choose-username.html (see js/auth.js).
-- ============================================================

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer          -- runs with the database owner's rights, so it may insert
set search_path = public
as $$
begin
  if new.raw_user_meta_data ->> 'username' is not null then
    begin
      insert into public.profiles (id, username)
      values (new.id, lower(new.raw_user_meta_data ->> 'username'))
      on conflict do nothing;   -- username already taken: skip
    exception when others then
      null;                     -- username breaks the rules: skip
    end;
  end if;
  return new;
end;
$$;

-- Runs after every new login account is created.
drop trigger if exists on_new_user_create_profile on auth.users;
create trigger on_new_user_create_profile
  after insert on auth.users
  for each row execute function public.create_profile_for_new_user();

-- Nobody may call this function directly through the website's API.
-- (The trigger still works: triggers don't need this permission.)
revoke execute on function public.create_profile_for_new_user() from public, anon, authenticated;
