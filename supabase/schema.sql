-- ============================================================
-- Reddle database tables
-- ============================================================
-- How to use: Supabase dashboard -> SQL Editor -> New query ->
-- paste this whole file -> Run. Run it ONCE on a new project.
--
-- Row Level Security (RLS) is what keeps the data safe, because
-- the browser talks to the database directly. Each table below
-- says who may read and who may change which rows.
-- ============================================================


-- ---------- profiles ----------
-- One row per user. The id is the same id Supabase Auth gives the user.
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  username    text not null unique
              check (username ~ '^[a-z0-9_]{3,20}$'),
  bio         text check (char_length(bio) <= 300),
  avatar_url  text,
  created_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Anyone can view profiles"
  on public.profiles for select using (true);

create policy "Users can create their own profile"
  on public.profiles for insert with check (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update using (auth.uid() = id);


-- ---------- books ----------
-- Our own copy of a book, saved the first time anyone logs it.
-- external_id is the Open Library / Google Books id, so the same
-- book is never saved twice.
create table public.books (
  id           bigint generated always as identity primary key,
  external_id  text not null unique,
  title        text not null,
  author       text,
  cover_url    text,
  description  text,
  isbn         text,
  created_at   timestamptz not null default now()
);

alter table public.books enable row level security;

create policy "Anyone can view books"
  on public.books for select using (true);

create policy "Signed-in users can save books"
  on public.books for insert to authenticated with check (true);


-- ---------- logs ----------
-- A user's log of a book: rating, review, date read.
-- One log per user per book (the unique rule at the bottom).
create table public.logs (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  book_id     bigint not null references public.books (id) on delete cascade,
  -- Half stars from 0.5 to 5. Empty (null) means "no rating".
  rating      numeric(2,1)
              check (rating between 0.5 and 5 and rating * 2 = floor(rating * 2)),
  review      text,
  date_read   date,
  created_at  timestamptz not null default now(),
  unique (user_id, book_id)
);

alter table public.logs enable row level security;

create policy "Anyone can view logs"
  on public.logs for select using (true);

create policy "Users can create their own logs"
  on public.logs for insert with check (auth.uid() = user_id);

create policy "Users can update their own logs"
  on public.logs for update using (auth.uid() = user_id);

create policy "Users can delete their own logs"
  on public.logs for delete using (auth.uid() = user_id);


-- ---------- follows ----------
-- "follower_id follows following_id". No approval needed.
create table public.follows (
  follower_id   uuid not null references public.profiles (id) on delete cascade,
  following_id  uuid not null references public.profiles (id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);

alter table public.follows enable row level security;

create policy "Anyone can view follows"
  on public.follows for select using (true);

create policy "Users can follow people"
  on public.follows for insert with check (auth.uid() = follower_id);

create policy "Users can unfollow people"
  on public.follows for delete using (auth.uid() = follower_id);
