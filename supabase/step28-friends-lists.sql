-- ------------------------------------------------------------
-- Step 28: Followers / Following lists on profiles
-- ------------------------------------------------------------
-- Until now anyone could read every follow. With lists on every profile
-- that would show who follows a private person, and people you blocked
-- would still appear in other people's lists. New rule for reading a
-- follow (A follows B):
--   - you are A or B (you always see your own followers and following), or
--   - you may see both A's and B's activity (can_see_activity, step 20:
--     yourself, admins, public profiles, private ones you're approved
--     for; never across a block).
-- The counts on a private profile still show (just numbers, like other
-- sites), through follow_counts(), which counts what the lists would show
-- to someone approved, minus people blocked with you.
-- mutual_friends(): people you follow who also follow you, newest first.
-- Tested on the local copy before applying (supabase/step20 helpers).
-- ------------------------------------------------------------

create policy "Private follows stay hidden"
  on public.follows as restrictive for select
  using (
    auth.uid() in (follower_id, following_id)
    or (public.can_see_activity(follower_id) and public.can_see_activity(following_id))
  );

-- Followers and following counts for one person, as the lists would show
-- them to an approved follower (people blocked with you left out).
create or replace function public.follow_counts(p_person uuid)
returns json
language sql stable security definer set search_path = public
as $$
  select json_build_object(
    'followers', (select count(*) from public.follows f
                  where f.following_id = p_person
                    and (p_person = auth.uid() or f.follower_id = auth.uid() or public.can_see_activity(f.follower_id))),
    'following', (select count(*) from public.follows f
                  where f.follower_id = p_person
                    and (p_person = auth.uid() or f.following_id = auth.uid() or public.can_see_activity(f.following_id)))
  );
$$;
grant execute on function public.follow_counts(uuid) to anon, authenticated;

-- People you follow who also follow you, newest first (the later of the
-- two follows). Runs with your own rights, so every rule above applies.
create or replace function public.mutual_friends(p_limit int default 30, p_offset int default 0)
returns table (id uuid, username text, avatar_url text, is_private boolean, since timestamptz)
language sql stable security invoker set search_path = public
as $$
  select p.id, p.username, p.avatar_url, p.is_private, greatest(mine.created_at, theirs.created_at) as since
  from public.follows mine
  join public.follows theirs on theirs.follower_id = mine.following_id and theirs.following_id = auth.uid()
  join public.profiles p on p.id = mine.following_id
  where mine.follower_id = auth.uid()
  order by since desc, p.id
  limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
$$;
revoke execute on function public.mutual_friends(int, int) from public, anon;
grant execute on function public.mutual_friends(int, int) to authenticated;
