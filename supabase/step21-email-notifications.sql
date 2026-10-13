-- ------------------------------------------------------------
-- Step 21: Email notifications (Part K)
-- ------------------------------------------------------------
-- When someone follows you or asks to follow you, the database asks the
-- Edge Function "notify-email" (supabase/functions/notify-email) to send
-- an email. The function sends nothing until the owner has added the
-- RESEND_API_KEY and EMAIL_FROM secrets in Supabase, and it checks the
-- event really happened (so a fake request can't make it send anything).
--
-- * email_prefs: a switch per kind of email (on unless you turn it off)
--   and a secret unsubscribe token for the link in every email.
-- * email_log: which emails were sent (each event only once, at most
--   20 a day per person). Only the Edge Function reads or writes it.
-- ------------------------------------------------------------

create extension if not exists pg_net;

create table public.email_prefs (
  user_id            uuid primary key references public.profiles (id) on delete cascade,
  new_followers      boolean not null default true,
  follow_requests    boolean not null default true,
  comments           boolean not null default true,
  unsubscribe_token  uuid not null unique default gen_random_uuid(),
  updated_at         timestamptz not null default now()
);

alter table public.email_prefs enable row level security;

create policy "Users see their own email settings"
  on public.email_prefs for select to authenticated using (user_id = auth.uid());
create policy "Users create their own email settings"
  on public.email_prefs for insert to authenticated with check (user_id = auth.uid());
create policy "Users change their own email settings"
  on public.email_prefs for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create table public.email_log (
  event_key     text primary key,
  recipient_id  uuid not null references public.profiles (id) on delete cascade,
  sent_at       timestamptz not null default now()
);
create index email_log_recipient_idx on public.email_log (recipient_id, sent_at desc);

-- No rules at all: only the Edge Function (with the service key) uses it.
alter table public.email_log enable row level security;

-- Tells the Edge Function about a new follow or follow request. It never
-- stops the follow itself from working, even if the call fails.
create or replace function public.notify_email()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform net.http_post(
    url := 'https://trfgztdvecpswcwoakyz.supabase.co/functions/v1/notify-email',
    body := jsonb_build_object('type', tg_table_name, 'record', to_jsonb(new)),
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 5000
  );
  return new;
exception when others then
  return new;
end;
$$;

revoke execute on function public.notify_email() from public, anon, authenticated;

create trigger email_on_follow after insert on public.follows
  for each row execute function public.notify_email();
create trigger email_on_follow_request after insert on public.follow_requests
  for each row execute function public.notify_email();
