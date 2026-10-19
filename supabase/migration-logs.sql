create table if not exists public.nmm_logs (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (length(trim(content)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  planner_version smallint not null default 1 check (planner_version = 1)
);

create index if not exists nmm_logs_owner_created_idx
  on public.nmm_logs(owner_id, created_at desc);

alter table public.nmm_logs enable row level security;
grant select, insert, update, delete on public.nmm_logs to authenticated;

create policy nmm_logs_owner_all on public.nmm_logs
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
