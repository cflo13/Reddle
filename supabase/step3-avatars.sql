-- ============================================================
-- Step 3: storage for profile pictures
-- ============================================================
-- How to use: Supabase dashboard -> SQL Editor -> New query ->
-- paste this whole file -> Run. Run it ONCE.
--
-- Creates a public "avatars" bucket (a folder in Supabase Storage)
-- and the rules for who can do what with the files in it:
--   * anyone can view pictures
--   * a logged-in user can only upload, replace or delete files
--     inside their own folder, which is named after their user id
--     (for example 1b2c3d.../avatar.jpg)
-- ============================================================


-- ---------- The bucket ----------
-- public = true      -> pictures can be shown with a normal web link
-- file_size_limit    -> 5 MB at most (our pictures are ~20 KB anyway)
-- allowed_mime_types -> only pictures
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;


-- ---------- The rules ----------
-- storage.foldername(name) splits a path like "USERID/avatar.jpg" into its
-- folders, and [1] is the first one: the USERID part.
-- auth.uid() is the id of whoever is logged in.

create policy "Anyone can view avatars"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "Users can upload their own avatar"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can replace their own avatar"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can delete their own avatar"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
