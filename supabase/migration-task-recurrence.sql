-- Recorrência opcional das tarefas do Tá na Mão.
-- A coluna é aditiva e não altera as tarefas existentes.
alter table public.nmm_tasks
  add column if not exists recurrence jsonb;

comment on column public.nmm_tasks.recurrence is
  'Regra opcional de recorrência armazenada pelo Tá na Mão';

notify pgrst, 'reload schema';
