-- Ordenação manual das tarefas/notas e tags aplicáveis às notas.
-- A alteração é aditiva e preserva os registros já existentes.
alter table public.nmm_tasks
  add column if not exists sort_order integer not null default 0;

alter table public.nmm_notes
  add column if not exists tag_ids text[] not null default '{}'::text[],
  add column if not exists sort_order integer not null default 0;

alter table public.nmm_notes alter column content set default '';

create index if not exists nmm_tasks_owner_execution_sort_idx
  on public.nmm_tasks(owner_id, execution_date, sort_order);
create index if not exists nmm_notes_owner_sort_idx
  on public.nmm_notes(owner_id, sort_order);
