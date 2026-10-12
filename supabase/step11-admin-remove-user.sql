-- ============================================================
-- Moderation: let the admin remove a whole user
-- ============================================================
-- Run once, after step10-reports-admin.sql.
-- Run this one yourself in the SQL Editor: it touches the login table,
-- which Claude's Supabase connection isn't allowed to change.
--
-- Deletes the person's login. Their profile, logs, follows, shelves and
-- reports go with it automatically. The admin page deletes their picture.
-- ============================================================

create or replace function public.admin_delete_user(target uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can remove users.';
  end if;
  if target = auth.uid() then
    raise exception 'You can''t remove yourself here. Use Settings instead.';
  end if;
  delete from auth.users where id = target;
end;
$$;

revoke execute on function public.admin_delete_user(uuid) from public, anon;
grant execute on function public.admin_delete_user(uuid) to authenticated;
