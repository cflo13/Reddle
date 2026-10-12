-- ============================================================
-- Delete account
-- ============================================================
-- Run once, after schema.sql. (Already applied to the live project.)
--
-- The website's public key can't delete login accounts, so this function
-- does it for the person who is logged in, and only for them.
--
-- Deleting the login account also deletes, automatically ("on delete
-- cascade"): their profile, logs, follows (both ways), shelves and old
-- usernames. Their profile picture is deleted by the website just before
-- calling this (js/settings.js), because pictures live in Storage.
-- Books stay: they're shared by everyone.
-- ============================================================

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer          -- runs with the database owner's rights
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'You need to be logged in to delete your account.';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

-- Only logged-in people may call it (and it only ever deletes themselves).
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
