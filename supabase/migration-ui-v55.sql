-- Conteúdo já usa nmm_tasks.details; acrescentamos links e fixação das notas.
-- Migração aditiva: preserva registros existentes e atribui valores padrão.
alter table public.nmm_tasks
  add column if not exists link_url text not null default '';

alter table public.nmm_notes
  add column if not exists link_url text not null default '',
  add column if not exists is_pinned boolean not null default false;

notify pgrst, 'reload schema';
