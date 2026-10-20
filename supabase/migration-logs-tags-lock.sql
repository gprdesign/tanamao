-- Tags e estado de criptografia individual nos registros do Log.
-- O conteúdo dos registros trancados permanece cifrado em nmm_private_notes.
alter table public.nmm_logs
  add column if not exists tag_id text,
  add column if not exists is_locked boolean not null default false;
