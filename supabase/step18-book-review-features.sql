-- ------------------------------------------------------------
-- Step 18: Book and review features (Part H)
-- ------------------------------------------------------------
-- * logs.spoiler: the review gives away the story, so the site hides
--   it behind a "Show spoiler" button.
-- * logs.reread_count / reread_dates: "I read this again". Still one
--   log per person per book; the count says how many extra times.
-- * books.page_count: number of pages (from Open Library, or typed in
--   by a reader when Open Library doesn't know).
-- * shelves.current_page: how far you are in a Currently reading book.
-- * fill_book_pages(): saves a book's page count, only when it's empty.
-- New columns have defaults, so existing rows stay valid.
-- ------------------------------------------------------------

alter table public.logs
  add column spoiler boolean not null default false,
  add column reread_count integer not null default 0
    check (reread_count between 0 and 1000),
  add column reread_dates date[] not null default '{}'
    check (cardinality(reread_dates) <= 1000);

alter table public.books
  add column page_count integer check (page_count between 1 and 50000);

alter table public.shelves
  add column current_page integer check (current_page between 0 and 50000);

-- Anyone logged in may fill in a missing page count (books can't be
-- edited by readers otherwise). It never overwrites a known count.
create or replace function public.fill_book_pages(p_book_id bigint, p_pages integer)
returns void
language sql
security definer
set search_path = public
as $$
  update public.books
  set page_count = p_pages
  where id = p_book_id
    and page_count is null
    and p_pages between 1 and 50000;
$$;

revoke execute on function public.fill_book_pages(bigint, integer) from public, anon;
grant execute on function public.fill_book_pages(bigint, integer) to authenticated;
