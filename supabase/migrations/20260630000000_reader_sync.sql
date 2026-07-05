create table if not exists public.reader_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  progress jsonb not null default '{"sections":{}}'::jsonb,
  schema_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reader_engagement_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  client_event_id text not null,
  event_type text not null,
  event_at timestamptz not null,
  section_id text,
  content_hash text,
  route text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, client_event_id)
);

create table if not exists public.reader_sync_consent (
  user_id uuid primary key references auth.users(id) on delete cascade,
  consent_version integer not null,
  copy_version text not null,
  granted boolean not null default false,
  granted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists reader_progress_set_updated_at on public.reader_progress;
create trigger reader_progress_set_updated_at
before update on public.reader_progress
for each row execute function public.set_updated_at();

drop trigger if exists reader_sync_consent_set_updated_at on public.reader_sync_consent;
create trigger reader_sync_consent_set_updated_at
before update on public.reader_sync_consent
for each row execute function public.set_updated_at();

alter table public.reader_progress enable row level security;
alter table public.reader_engagement_events enable row level security;
alter table public.reader_sync_consent enable row level security;

drop policy if exists "Reader progress is owned by the user" on public.reader_progress;
create policy "Reader progress is owned by the user"
on public.reader_progress
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Reader events are owned by the user" on public.reader_engagement_events;
create policy "Reader events are owned by the user"
on public.reader_engagement_events
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Reader sync consent is owned by the user" on public.reader_sync_consent;
create policy "Reader sync consent is owned by the user"
on public.reader_sync_consent
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
