-- Minimal Weeklo-style planner: one area, one execution date, and a legacy-sync guard.
-- Existing rows receive planner_version=0. The NOT VALID constraints let them be
-- cleaned up while rejecting new writes from the old app. The new app writes version 1.
alter table public.nmm_tasks
  add column if not exists area text not null default 'vida',
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz,
  add column if not exists planner_version smallint not null default 0;

alter table public.nmm_notes
  add column if not exists planner_version smallint not null default 0;

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
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.nmm_tasks'::regclass
      and conname = 'nmm_tasks_planner_version_check'
  ) then
    alter table public.nmm_tasks
      add constraint nmm_tasks_planner_version_check check (planner_version = 1) not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.nmm_notes'::regclass
      and conname = 'nmm_notes_planner_version_check'
  ) then
    alter table public.nmm_notes
      add constraint nmm_notes_planner_version_check check (planner_version = 1) not valid;
  end if;
end $$;

create index if not exists nmm_tasks_owner_execution_idx
  on public.nmm_tasks(owner_id, execution_date);
