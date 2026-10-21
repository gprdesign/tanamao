-- Adds a links array to notes while keeping the legacy single-link field intact.
alter table public.nmm_notes
  add column if not exists links jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'nmm_notes_links_array_check'
      and conrelid = 'public.nmm_notes'::regclass
  ) then
    alter table public.nmm_notes
      add constraint nmm_notes_links_array_check
      check (jsonb_typeof(links) = 'array');
  end if;
end $$;

update public.nmm_notes
set links = jsonb_build_array(link_url)
where link_url <> '' and links = '[]'::jsonb;

notify pgrst, 'reload schema';
