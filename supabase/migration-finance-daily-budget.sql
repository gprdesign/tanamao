-- TNM: tags financeiras e saldo/cálculo diário. A alteração é aditiva e preserva os lançamentos existentes.
alter table public.nmm_finance_entries add column if not exists tag_id text;

with owners as (
  select distinct owner_id from public.nmm_finance_entries
), flow_tags(id,name,color) as (
  values ('flow-entry','ENTRADA','#73d6a2'), ('flow-exit','SAÍDA','#ff8b8b')
)
insert into public.nmm_tags(owner_id,id,name,color,planner_version)
select owners.owner_id,flow_tags.id,flow_tags.name,flow_tags.color,1
from owners cross join flow_tags
on conflict (owner_id,id) do update
set name=excluded.name,color=excluded.color,deleted_at=null,updated_at=now(),planner_version=1;

update public.nmm_finance_entries
set tag_id=case when direction='income' then 'flow-entry' else 'flow-exit' end
where tag_id is distinct from case when direction='income' then 'flow-entry' else 'flow-exit' end;

alter table public.nmm_finance_entries alter column tag_id set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='nmm_finance_entries_owner_tag_fk'
      and conrelid='public.nmm_finance_entries'::regclass
  ) then
    alter table public.nmm_finance_entries
      add constraint nmm_finance_entries_owner_tag_fk
      foreign key (owner_id,tag_id) references public.nmm_tags(owner_id,id);
  end if;
end $$;

create index if not exists nmm_finance_entries_owner_income_date_idx
  on public.nmm_finance_entries(owner_id,direction,status,movement_date)
  where deleted_at is null;

create table if not exists public.nmm_finance_state (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  account_balance numeric(14,2),
  balance_updated_at timestamptz,
  cashbox_amount numeric(14,2) check (cashbox_amount is null or cashbox_amount >= 0),
  cashbox_updated_at timestamptz,
  updated_at timestamptz not null default now(),
  planner_version smallint not null default 1 check (planner_version = 1)
);

alter table public.nmm_finance_state enable row level security;
grant select,insert,update on public.nmm_finance_state to authenticated;
drop policy if exists nmm_finance_state_owner_all on public.nmm_finance_state;
create policy nmm_finance_state_owner_all on public.nmm_finance_state
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

notify pgrst, 'reload schema';
