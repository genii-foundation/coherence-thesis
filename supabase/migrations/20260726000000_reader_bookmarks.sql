-- Cross-device bookmark sync.
--
-- One row per user holding a blob, matching reader_progress rather than the
-- per-entity shape of reader_engagement_events. That table is write-only from
-- the client (never selected back, and deliberately not granted UPDATE), so it
-- is not the pattern for a collection the reader edits and deletes from.
--
-- The blob carries tombstones, so deletions travel between devices instead of
-- being resurrected by whichever device still holds a live copy.

create table if not exists public.reader_bookmarks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  bookmarks jsonb not null default '{"bookmarks":{}}'::jsonb,
  schema_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.reader_bookmarks enable row level security;

drop policy if exists "Reader bookmarks are owned by the user" on public.reader_bookmarks;
create policy "Reader bookmarks are owned by the user"
on public.reader_bookmarks
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop trigger if exists reader_bookmarks_set_updated_at on public.reader_bookmarks;
create trigger reader_bookmarks_set_updated_at
before update on public.reader_bookmarks
for each row execute function public.set_updated_at();

-- 512 KB. The client caps 150 live bookmarks at a 400 character quote and a 280
-- character note, which is roughly 183 KB worst case; the headroom covers
-- tombstones and a merge that briefly holds both devices' records. Bound it in
-- the database too, because a self-registered account can reach this table with
-- the public anon key and the client cap is not a security boundary.
alter table public.reader_bookmarks
  drop constraint if exists reader_bookmarks_size,
  add constraint reader_bookmarks_size
    check (pg_column_size(bookmarks) <= 524288);

-- RLS is not trusted alone: the Data API needs explicit privileges when
-- automatic table exposure is disabled. Anonymous readers stay out entirely.
revoke all on table public.reader_bookmarks from anon;

grant select, insert, update, delete
on table public.reader_bookmarks
to authenticated;
