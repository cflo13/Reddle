-- ============================================================
-- Welcome step for new users
-- ============================================================
-- Run once, after schema.sql. (Already applied to the live project.)
--
-- onboarded = has this person seen the welcome page yet?
-- New accounts start at false and are sent to welcome.html after they
-- sign up or first log in. Accounts that existed before this change are
-- marked true so they're never sent there.
-- ============================================================

-- Adding the column with "default true" marks every existing account as
-- done; then new accounts get "false" from now on.
alter table public.profiles
  add column onboarded boolean not null default true;

alter table public.profiles
  alter column onboarded set default false;
