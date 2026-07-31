begin;

select plan(15);

insert into auth.users (id, email, created_at, updated_at)
values
  ('11111111-1111-4111-8111-111111111111', 'reader-one@example.test', now(), now()),
  ('22222222-2222-4222-8222-222222222222', 'reader-two@example.test', now(), now());

select ok(
  has_function_privilege(
    'authenticated',
    'public.merge_reader_bookmarks(jsonb, integer)',
    'execute'
  ),
  'authenticated readers can execute the atomic merge'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.reader_bookmarks',
    'insert'
  ),
  'authenticated readers cannot bypass the merge with a direct insert'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.reader_bookmarks',
    'update'
  ),
  'authenticated readers cannot bypass the merge with a direct update'
);

select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  true
);

select is(
  (
    select count(*)::integer
    from public.merge_reader_bookmarks(
      '{"bookmarks":{"a":{"id":"a","quote":"first","updatedAt":1000}}}'::jsonb,
      1
    ) merged,
    lateral jsonb_object_keys(merged.bookmarks -> 'bookmarks')
  ),
  1,
  'the first device creates its bookmark row'
);

select is(
  (
    select count(*)::integer
    from public.merge_reader_bookmarks(
      '{"bookmarks":{"b":{"id":"b","quote":"second","updatedAt":1000}}}'::jsonb,
      1
    ) merged,
    lateral jsonb_object_keys(merged.bookmarks -> 'bookmarks')
  ),
  2,
  'a disjoint second-device write preserves both bookmarks'
);

select is(
  (
    select count(*)::integer
    from public.reader_bookmarks,
    lateral jsonb_object_keys(bookmarks -> 'bookmarks')
    where user_id = '11111111-1111-4111-8111-111111111111'
  ),
  2,
  'the disjoint merge is durable'
);

select is(
  (
    select bookmarks #>> '{bookmarks,a,quote}'
    from public.merge_reader_bookmarks(
      '{"bookmarks":{"a":{"id":"a","quote":"stale","updatedAt":900}}}'::jsonb,
      1
    )
  ),
  'first',
  'an older replica cannot replace a newer record'
);

select is(
  (
    select bookmarks #>> '{bookmarks,a,quote}'
    from public.merge_reader_bookmarks(
      '{"bookmarks":{"a":{"id":"a","quote":"newer","updatedAt":1100}}}'::jsonb,
      1
    )
  ),
  'newer',
  'a genuinely newer record wins'
);

select ok(
  (
    select (bookmarks #> '{bookmarks,a}') ? 'removedAt'
    from public.merge_reader_bookmarks(
      '{"bookmarks":{"a":{"id":"a","quote":"","updatedAt":1200,"removedAt":1200}}}'::jsonb,
      1
    )
  ),
  'a tombstone removes the saved record'
);

select ok(
  (
    select (bookmarks #> '{bookmarks,a}') ? 'removedAt'
    from public.merge_reader_bookmarks(
      '{"bookmarks":{"a":{"id":"a","quote":"resurrected","updatedAt":1300}}}'::jsonb,
      1
    )
  ),
  'a live replica cannot resurrect a tombstoned id'
);

select set_config(
  'request.jwt.claim.sub',
  '22222222-2222-4222-8222-222222222222',
  true
);

select is(
  (
    select count(*)::integer
    from public.merge_reader_bookmarks(
      '{"bookmarks":{"c":{"id":"c","quote":"private","updatedAt":1000}}}'::jsonb,
      1
    ) merged,
    lateral jsonb_object_keys(merged.bookmarks -> 'bookmarks')
  ),
  1,
  'a second reader receives only their own document'
);

select is(
  (select count(*) from public.reader_bookmarks),
  2::bigint,
  'the database stores one isolated row per reader'
);

select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  true
);

select is(
  (
    select schema_version
    from public.merge_reader_bookmarks(
      '{"bookmarks":{"range":{"id":"range","quote":"first\n\nsecond","updatedAt":1400,"range":{"start":{"paragraphAnchor":"p-h0123456789abcdef","paragraphContentHash":"0123456789abcdef","offset":0},"end":{"paragraphAnchor":"p-hfedcba9876543210","paragraphContentHash":"fedcba9876543210","offset":6}}}}}'::jsonb,
      2
    )
  ),
  2,
  'a version 2 client upgrades the bookmark row'
);

select is(
  (
    select bookmarks #>> '{bookmarks,range,range,end,paragraphAnchor}'
    from public.reader_bookmarks
    where user_id = '11111111-1111-4111-8111-111111111111'
  ),
  'p-hfedcba9876543210',
  'the multi-paragraph end boundary is stored'
);

select throws_ok(
  $$
    select *
    from public.merge_reader_bookmarks(
      '{"bookmarks":{"old":{"id":"old","quote":"old client","updatedAt":1500}}}'::jsonb,
      1
    )
  $$,
  '22023',
  'Remote bookmark schema version 2 is newer than client version 1.',
  'an older client cannot flatten a version 2 range'
);

select * from finish();

rollback;
