create table if not exists public.nmm_private_vaults (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  salt text not null,
  verifier_iv text not null,
  verifier_ciphertext text not null,
  updated_at timestamptz not null default now(),
  planner_version smallint not null default 1 check (planner_version = 1)
);

create table if not exists public.nmm_private_notes (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  iv text not null,
  ciphertext text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  planner_version smallint not null default 1 check (planner_version = 1)
);

create index if not exists nmm_private_notes_owner_updated_idx
  on public.nmm_private_notes(owner_id, updated_at desc);

alter table public.nmm_private_vaults enable row level security;
alter table public.nmm_private_notes enable row level security;
grant select, insert, update on public.nmm_private_vaults to authenticated;
grant select, insert, update, delete on public.nmm_private_notes to authenticated;

create policy nmm_private_vaults_owner_all on public.nmm_private_vaults
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy nmm_private_notes_owner_all on public.nmm_private_notes
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
