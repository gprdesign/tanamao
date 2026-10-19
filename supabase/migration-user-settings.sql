create table if not exists public.nmm_user_settings (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{"summaryTimes":["08:00"],"calendarIds":[],"nickname":"Gio"}'::jsonb,
  updated_at timestamptz not null default now(),
  planner_version smallint not null default 1 check (planner_version = 1)
);

alter table public.nmm_user_settings enable row level security;
grant select, insert, update on public.nmm_user_settings to authenticated;

create policy nmm_user_settings_owner_all on public.nmm_user_settings
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
