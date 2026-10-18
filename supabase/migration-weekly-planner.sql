-- Minimal Weeklo-style planner: one area, one execution date, and soft-delete metadata.
alter table public.nmm_tasks
  add column if not exists area text not null default 'vida',
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.nmm_tasks'::regclass
      and conname = 'nmm_tasks_area_check'
  ) then
    alter table public.nmm_tasks
      add constraint nmm_tasks_area_check check (area in ('vida', 'trabalho', 'outros'));
  end if;
end $$;

create index if not exists nmm_tasks_owner_execution_idx
  on public.nmm_tasks(owner_id, execution_date);
