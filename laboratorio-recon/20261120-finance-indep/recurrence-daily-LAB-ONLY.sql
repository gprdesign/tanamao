-- Research prototype only. No production application, migration, or access to real tables.
-- Models DAILY recurrence only; actual app supports other frequencies.
create schema recurrence_lab;
revoke all on schema recurrence_lab from public;
grant usage on schema recurrence_lab to authenticated;
create table recurrence_lab.series (
 owner_id uuid not null, series_id text not null, anchor date not null,
 interval_days integer not null check (interval_days between 1 and 366),
 until_date date check (until_date >= anchor), stopped boolean not null default false,
 revision bigint not null default 1 check (revision > 0),
 primary key(owner_id,series_id)
);
create table recurrence_lab.occurrences (
 owner_id uuid not null, series_id text not null, occurrence_date date not null,
 completed boolean not null default false, deleted boolean not null default false,
 primary key(owner_id,series_id,occurrence_date),
 foreign key(owner_id,series_id) references recurrence_lab.series(owner_id,series_id)
);
create table recurrence_lab.operations (
 owner_id uuid not null, operation_id uuid not null, payload jsonb not null, result jsonb not null,
 primary key(owner_id,operation_id)
);
alter table recurrence_lab.series enable row level security;
alter table recurrence_lab.occurrences enable row level security;
alter table recurrence_lab.operations enable row level security;
create policy series_read on recurrence_lab.series for select to authenticated using (owner_id = (select auth.uid()));
create policy occurrence_read on recurrence_lab.occurrences for select to authenticated using (owner_id = (select auth.uid()));
create policy op_read on recurrence_lab.operations for select to authenticated using (owner_id = (select auth.uid()));
revoke all on all tables in schema recurrence_lab from public, authenticated;
grant select on all tables in schema recurrence_lab to authenticated;

create function recurrence_lab.complete_daily(p_op uuid, p_series text, p_date date, p_revision bigint)
returns jsonb language plpgsql security definer set search_path=pg_catalog,recurrence_lab as $$
declare owner uuid := auth.uid(); s recurrence_lab.series%rowtype; o recurrence_lab.occurrences%rowtype;
 oldop recurrence_lab.operations%rowtype; payload jsonb; result jsonb; nxt date; next_state text := 'ended';
begin
 if owner is null then raise exception 'authentication required' using errcode='28000'; end if;
 if p_op is null or p_series is null or length(trim(p_series))=0 or p_date is null or p_revision is null then
   raise exception 'invalid argument' using errcode='22023';
 end if;
 payload := jsonb_build_object('series',p_series,'date',p_date,'revision',p_revision);
 -- An advisory lock makes duplicate operation IDs safe even across different series.
 perform pg_advisory_xact_lock(hashtextextended(owner::text || ':' || p_op::text, 0));
 select * into oldop from recurrence_lab.operations where owner_id=owner and operation_id=p_op;
 if found then
   if oldop.payload <> payload then raise exception 'operation id payload mismatch' using errcode='22023'; end if;
   return oldop.result;
 end if;
 select * into s from recurrence_lab.series where owner_id=owner and series_id=p_series for update;
 if not found then raise exception 'series missing' using errcode='P0002'; end if;
 if s.stopped or s.revision<>p_revision then raise exception 'series changed; reload' using errcode='40001'; end if;
 select * into o from recurrence_lab.occurrences where owner_id=owner and series_id=p_series and occurrence_date=p_date for update;
 if not found or o.deleted or o.completed then raise exception 'occurrence unavailable' using errcode='23514'; end if;
 if p_date < s.anchor or (p_date-s.anchor)%s.interval_days<>0 or (s.until_date is not null and p_date>s.until_date) then
   raise exception 'date outside rule' using errcode='23514';
 end if;
 update recurrence_lab.occurrences set completed=true where owner_id=owner and series_id=p_series and occurrence_date=p_date;
 nxt:=p_date+s.interval_days;
 if s.until_date is not null and nxt>s.until_date then nxt:=null; end if;
 if nxt is not null then
   -- Never resurrect an existing (including deleted) occurrence.
   insert into recurrence_lab.occurrences(owner_id,series_id,occurrence_date) values(owner,p_series,nxt)
     on conflict(owner_id,series_id,occurrence_date) do nothing;
   select case when deleted then 'deleted' when completed then 'completed' else 'pending' end into next_state
     from recurrence_lab.occurrences where owner_id=owner and series_id=p_series and occurrence_date=nxt;
 end if;
 result := jsonb_build_object('series',p_series,'completed_date',p_date,'next_date',nxt,'next_state',next_state);
 insert into recurrence_lab.operations values(owner,p_op,payload,result);
 return result;
end $$;
revoke all on function recurrence_lab.complete_daily(uuid,text,date,bigint) from public;
grant execute on function recurrence_lab.complete_daily(uuid,text,date,bigint) to authenticated;
