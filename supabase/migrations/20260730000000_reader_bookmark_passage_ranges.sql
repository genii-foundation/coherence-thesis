-- Add version 2 bookmark passage ranges.
--
-- Version 1 records remain readable and mergeable until a version 2 client
-- upgrades the user's row. Once upgraded, an older client is rejected rather
-- than allowing it to overwrite a multi-paragraph range with its single
-- paragraph shape.
--
-- Rollback requires restoring the prior merge function, the 4 MB size
-- constraint, and the schema default. Doing so makes range-bearing rows newer
-- than the restored function understands, so it is not a data-safe rollback
-- without first proving that no row has reached schema version 2.

alter table public.reader_bookmarks
  alter column schema_version set default 2,
  drop constraint if exists reader_bookmarks_size,
  add constraint reader_bookmarks_size
    check (pg_column_size(bookmarks) <= 8388608);

create or replace function public.merge_reader_bookmarks(
  incoming_bookmarks jsonb,
  incoming_schema_version integer
)
returns table (
  bookmarks jsonb,
  schema_version integer,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester uuid := auth.uid();
  current_document jsonb;
  current_schema_version integer;
  bookmark_id text;
  incoming_record jsonb;
  current_record jsonb;
  choose_incoming boolean;
  incoming_updated_at numeric;
  current_updated_at numeric;
begin
  if requester is null then
    raise exception 'Authentication is required.'
      using errcode = '42501';
  end if;

  if incoming_schema_version not in (1, 2) then
    raise exception 'Unsupported bookmark schema version: %.',
      incoming_schema_version
      using errcode = '22023';
  end if;

  if jsonb_typeof(incoming_bookmarks) is distinct from 'object'
    or jsonb_typeof(incoming_bookmarks -> 'bookmarks') is distinct from 'object'
  then
    raise exception 'Invalid bookmark document.'
      using errcode = '22023';
  end if;

  insert into public.reader_bookmarks (
    user_id,
    bookmarks,
    schema_version
  )
  values (
    requester,
    '{"bookmarks":{}}'::jsonb,
    incoming_schema_version
  )
  on conflict (user_id) do nothing;

  select
    reader_bookmarks.bookmarks,
    reader_bookmarks.schema_version
  into
    current_document,
    current_schema_version
  from public.reader_bookmarks
  where reader_bookmarks.user_id = requester
  for update;

  if current_schema_version > incoming_schema_version then
    raise exception
      'Remote bookmark schema version % is newer than client version %.',
      current_schema_version,
      incoming_schema_version
      using errcode = '22023';
  end if;

  for bookmark_id, incoming_record in
    select key, value
    from jsonb_each(incoming_bookmarks -> 'bookmarks')
  loop
    if jsonb_typeof(incoming_record) is distinct from 'object'
      or incoming_record ->> 'id' is distinct from bookmark_id
      or jsonb_typeof(incoming_record -> 'updatedAt') is distinct from 'number'
    then
      raise exception 'Invalid bookmark record: %.', bookmark_id
        using errcode = '22023';
    end if;

    if incoming_schema_version = 2
      and (
        jsonb_typeof(incoming_record -> 'range') is distinct from 'object'
        or jsonb_typeof(incoming_record #> '{range,start}') is distinct from 'object'
        or jsonb_typeof(incoming_record #> '{range,end}') is distinct from 'object'
        or coalesce(incoming_record #>> '{range,start,paragraphAnchor}', '') = ''
        or coalesce(incoming_record #>> '{range,end,paragraphAnchor}', '') = ''
        or jsonb_typeof(incoming_record #> '{range,start,offset}') is distinct from 'number'
        or jsonb_typeof(incoming_record #> '{range,end,offset}') is distinct from 'number'
      )
    then
      raise exception 'Invalid version 2 bookmark range: %.', bookmark_id
        using errcode = '22023';
    end if;

    current_record := current_document -> 'bookmarks' -> bookmark_id;
    choose_incoming := current_record is null;

    if current_record is not null then
      if jsonb_typeof(current_record) is distinct from 'object'
        or jsonb_typeof(current_record -> 'updatedAt') is distinct from 'number'
      then
        raise exception 'Stored bookmark record is invalid: %.', bookmark_id
          using errcode = '22023';
      end if;

      -- Tombstones remain absorbing because bookmark ids are never reused.
      if (incoming_record ? 'removedAt') <> (current_record ? 'removedAt') then
        choose_incoming := incoming_record ? 'removedAt';
      else
        incoming_updated_at := (incoming_record ->> 'updatedAt')::numeric;
        current_updated_at := (current_record ->> 'updatedAt')::numeric;
        choose_incoming := incoming_updated_at > current_updated_at;
      end if;
    end if;

    if choose_incoming then
      current_document := jsonb_set(
        current_document,
        array['bookmarks', bookmark_id],
        incoming_record,
        true
      );
    end if;
  end loop;

  update public.reader_bookmarks
  set
    bookmarks = current_document,
    schema_version = incoming_schema_version
  where reader_bookmarks.user_id = requester;

  return query
    select
      reader_bookmarks.bookmarks,
      reader_bookmarks.schema_version,
      reader_bookmarks.updated_at
    from public.reader_bookmarks
    where reader_bookmarks.user_id = requester;
end;
$$;

comment on function public.merge_reader_bookmarks(jsonb, integer) is
  'Atomically merges version 1 single-paragraph or version 2 passage-range bookmarks under a row lock.';

revoke all
on function public.merge_reader_bookmarks(jsonb, integer)
from public, anon;

grant execute
on function public.merge_reader_bookmarks(jsonb, integer)
to authenticated;
