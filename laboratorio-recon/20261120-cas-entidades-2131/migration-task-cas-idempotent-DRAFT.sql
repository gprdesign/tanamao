-- LAB ONLY: depends on migration-task-cas-DRAFT.sql. DO NOT deploy or use real data.
-- Receipt stores sensitive full request and response. Retention, encryption and
-- backup policy must be designed before any release. An operation receipt is a
-- historic outcome, NOT evidence that the current row is still at that revision.
begin;
do $$ begin raise exception 'DRAFT: migration disabled; use disposable test DB only'; end $$;
create table public.nmm_task_cas_receipt_lab (
  owner_id uuid not null,
  operation_id uuid not null,
  request_row jsonb not null,
  expected_revision bigint not null,
  response jsonb,
  primary key (owner_id, operation_id)
);
alter table public.nmm_task_cas_receipt_lab enable row level security;
revoke all on public.nmm_task_cas_receipt_lab from public, anon, authenticated;
revoke all on function public.nmm_task_cas(jsonb,bigint) from public, anon, authenticated;
-- Fail closed when a role inherits access rather than assuming REVOKE was enough.
do $$ declare r text; c record; begin
  foreach r in array array['anon','authenticated'] loop
    if has_table_privilege(r,'public.nmm_task_cas_receipt_lab','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       or has_function_privilege(r,'public.nmm_task_cas(jsonb,bigint)','EXECUTE') then
      raise exception 'effective receipt or direct task function access remains for %', r;
    end if;
    for c in select attname from pg_catalog.pg_attribute where attrelid='public.nmm_task_cas_receipt_lab'::regclass and attnum>0 and not attisdropped loop
      if has_column_privilege(r,'public.nmm_task_cas_receipt_lab',c.attname,'SELECT,INSERT,UPDATE,REFERENCES') then
        raise exception 'effective receipt column access remains for %', r;
      end if;
    end loop;
  end loop;
end $$;
create function public.nmm_task_cas_once_lab(p_operation_id uuid, p_row jsonb, p_expected bigint)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, auth as $$
declare
  uid uuid := auth.uid();
  inserted boolean;
  receipt public.nmm_task_cas_receipt_lab%rowtype;
  outcome jsonb;
begin
  if uid is null or p_operation_id is null or p_row is null or jsonb_typeof(p_row) <> 'object'
     or p_expected is null or p_expected < 0 then
    raise exception 'invalid request' using errcode='22023';
  end if;
  -- A conflicting INSERT waits for the in-flight transaction to finish. The
  -- receipt and task mutation commit or roll back together.
  insert into public.nmm_task_cas_receipt_lab(owner_id,operation_id,request_row,expected_revision)
  values(uid,p_operation_id,p_row,p_expected)
  on conflict do nothing;
  inserted := found;
  select * into strict receipt from public.nmm_task_cas_receipt_lab
    where owner_id=uid and operation_id=p_operation_id for update;
  if receipt.request_row is distinct from p_row or receipt.expected_revision is distinct from p_expected then
    raise exception 'operation id reused with different request' using errcode='22023';
  end if;
  if inserted then
    outcome := public.nmm_task_cas(p_row,p_expected);
    update public.nmm_task_cas_receipt_lab set response=outcome
      where owner_id=uid and operation_id=p_operation_id;
  else
    outcome := receipt.response;
    if outcome is null then raise exception 'incomplete operation receipt'; end if;
  end if;
  return jsonb_build_object('replayed',not inserted,'historic_outcome',outcome);
end $$;
revoke all on function public.nmm_task_cas_once_lab(uuid,jsonb,bigint) from public, anon;
grant execute on function public.nmm_task_cas_once_lab(uuid,jsonb,bigint) to authenticated;
commit;
