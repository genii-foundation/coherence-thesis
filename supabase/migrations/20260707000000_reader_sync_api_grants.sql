-- The reader sync tables use RLS for row ownership, but the Data API also
-- needs explicit table privileges when automatic table exposure is disabled.
-- Grant authenticated readers access to the tables. Keep anonymous readers out.

grant usage on schema public to authenticated;

revoke all on table public.reader_progress from anon;
revoke all on table public.reader_engagement_events from anon;
revoke all on table public.reader_sync_consent from anon;
revoke all on sequence public.reader_engagement_events_id_seq from anon;

grant select, insert, update, delete
on table public.reader_progress
to authenticated;

grant select, insert, update, delete
on table public.reader_sync_consent
to authenticated;

grant select, insert, delete
on table public.reader_engagement_events
to authenticated;

grant usage, select
on sequence public.reader_engagement_events_id_seq
to authenticated;
