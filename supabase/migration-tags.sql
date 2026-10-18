-- Tags are independent of execution dates and available to planned and unplanned tasks.
alter table public.nmm_tasks add column if not exists tag_id text;
update public.nmm_tasks
  set tag_id = case when area = 'outros' then 'outro' when area in ('vida','trabalho') then area else 'vida' end
  where tag_id is null;
alter table public.nmm_tasks alter column tag_id set not null;

create table if not exists public.nmm_tags (
  owner_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  name text not null,
  color text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  planner_version smallint not null check (planner_version = 1),
  primary key (owner_id,id)
);

create index if not exists nmm_tasks_owner_tag_idx on public.nmm_tasks(owner_id, tag_id);
create index if not exists nmm_tags_owner_name_idx on public.nmm_tags(owner_id, name);

alter table public.nmm_tags enable row level security;
grant select, insert, update, delete on public.nmm_tags to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'nmm_tags' and policyname = 'nmm_tags_owner_all'
  ) then
    create policy nmm_tags_owner_all on public.nmm_tags
      for all to authenticated
      using (owner_id = (select auth.uid()))
      with check (owner_id = (select auth.uid()));
  end if;
end $$;
