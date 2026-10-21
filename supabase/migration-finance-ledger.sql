-- Fluxo de caixa do Tá na Mão. A tabela é nova e não altera tarefas nem logs existentes.
create table if not exists public.nmm_finance_entries (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  direction text not null check (direction in ('income', 'expense')),
  amount numeric(14,2) not null check (amount > 0),
  movement_date date not null,
  status text not null default 'planned' check (status in ('planned', 'realized')),
  series_id text,
  occurrence_number integer,
  installment_count integer,
  recurrence jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  planner_version smallint not null check (planner_version = 1),
  check ((series_id is null and occurrence_number is null) or (series_id is not null and occurrence_number is not null and occurrence_number > 0)),
  check (installment_count is null or installment_count between 2 and 240)
);

create index if not exists nmm_finance_entries_owner_date_idx on public.nmm_finance_entries(owner_id, movement_date);
create unique index if not exists nmm_finance_entries_series_occurrence_idx on public.nmm_finance_entries(owner_id, series_id, occurrence_number) where series_id is not null;
alter table public.nmm_finance_entries enable row level security;
grant select, insert, update, delete on public.nmm_finance_entries to authenticated;
drop policy if exists nmm_finance_entries_owner_all on public.nmm_finance_entries;
create policy nmm_finance_entries_owner_all on public.nmm_finance_entries
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

notify pgrst, 'reload schema';
