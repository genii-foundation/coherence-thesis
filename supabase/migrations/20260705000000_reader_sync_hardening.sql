-- Hardening for the reader-sync tables.
-- SEC-07: pin the trigger function search_path so it cannot be hijacked.
-- SEC-01: bound row and payload sizes so a self-registered account cannot use
-- the public anon key to insert unbounded rows or multi-megabyte blobs.

-- Recreate the shared updated_at trigger with an empty, immutable search_path
-- and fully schema-qualified references.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

-- Size and value bounds on the engagement event log.
alter table public.reader_engagement_events
  drop constraint if exists reader_engagement_events_payload_size,
  add constraint reader_engagement_events_payload_size
    check (pg_column_size(payload) <= 8192);

alter table public.reader_engagement_events
  drop constraint if exists reader_engagement_events_event_type_len,
  add constraint reader_engagement_events_event_type_len
    check (char_length(event_type) between 1 and 64);

alter table public.reader_engagement_events
  drop constraint if exists reader_engagement_events_client_event_id_len,
  add constraint reader_engagement_events_client_event_id_len
    check (char_length(client_event_id) between 1 and 128);

alter table public.reader_engagement_events
  drop constraint if exists reader_engagement_events_section_id_len,
  add constraint reader_engagement_events_section_id_len
    check (section_id is null or char_length(section_id) <= 128);

alter table public.reader_engagement_events
  drop constraint if exists reader_engagement_events_content_hash_len,
  add constraint reader_engagement_events_content_hash_len
    check (content_hash is null or char_length(content_hash) <= 128);

alter table public.reader_engagement_events
  drop constraint if exists reader_engagement_events_route_len,
  add constraint reader_engagement_events_route_len
    check (route is null or char_length(route) <= 512);

-- Bound on the progress blob (roughly 256 KB, far above any real reader).
alter table public.reader_progress
  drop constraint if exists reader_progress_size,
  add constraint reader_progress_size
    check (pg_column_size(progress) <= 262144);

-- Index the event log by user for the retention/pruning queries below.
create index if not exists reader_engagement_events_user_event_at_idx
  on public.reader_engagement_events (user_id, event_at desc);

-- Retention: cap stored events per user. Runs on insert; trims the oldest rows
-- beyond the cap so the table cannot grow without bound for any single user.
create or replace function public.prune_reader_engagement_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  max_events constant integer := 5000;
begin
  delete from public.reader_engagement_events
  where user_id = new.user_id
    and id not in (
      select id
      from public.reader_engagement_events
      where user_id = new.user_id
      order by event_at desc
      limit max_events
    );
  return null;
end;
$$;

drop trigger if exists reader_engagement_events_prune
  on public.reader_engagement_events;
create trigger reader_engagement_events_prune
after insert on public.reader_engagement_events
for each row execute function public.prune_reader_engagement_events();
