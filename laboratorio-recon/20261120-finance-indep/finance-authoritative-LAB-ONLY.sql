-- LAB ONLY: composable experiment, NOT a migration. Requires finance-transaction-LAB-ONLY.sql.
-- No UI, reconciliation, bill writer, RLS of real schema, offline queue, or legacy fence.
-- The catalog is seeded only by the disposable test harness, never by the client.
create table finance_lab.bill_catalog (
 owner_id uuid not null references finance_lab.wallets(owner_id),
 cycle date not null check (extract(day from cycle)=1),
 bill_id text not null check (length(trim(bill_id)) between 1 and 100),
 amount numeric(14,2) not null check (amount>0 and amount <> 'NaN'::numeric),
 revision bigint not null check (revision>0),
 primary key(owner_id,cycle,bill_id)
);
alter table finance_lab.bill_catalog enable row level security;
create policy catalog_read on finance_lab.bill_catalog for select to authenticated using(owner_id=(select auth.uid()));
revoke all on finance_lab.bill_catalog from public,authenticated;
grant select on finance_lab.bill_catalog to authenticated;
create table finance_lab.verified_operations (
 owner_id uuid not null references finance_lab.wallets(owner_id),
 operation_id uuid not null, payload jsonb not null, result jsonb not null,
 primary key(owner_id,operation_id)
);
alter table finance_lab.verified_operations enable row level security;
create policy verified_read on finance_lab.verified_operations for select to authenticated using(owner_id=(select auth.uid()));
revoke all on finance_lab.verified_operations from public,authenticated;
grant select on finance_lab.verified_operations to authenticated;
-- The old function is callable by this function's owner but not the client.
-- This would not fence older app writers against the real financial state.
revoke execute on function finance_lab.apply_operation(uuid,text,numeric,date,text,numeric) from authenticated,public;
create function finance_lab.pay_verified(p_id uuid,p_cycle date,p_bill_id text,p_revision bigint,p_expected_debit numeric)
returns jsonb language plpgsql security definer set search_path=pg_catalog,finance_lab as $$
declare
 v_owner uuid:=auth.uid(); v_bill finance_lab.bill_catalog%rowtype;
 v_old finance_lab.verified_operations%rowtype; v_payload jsonb; v_result jsonb;
begin
 if v_owner is null then raise exception 'authentication required' using errcode='28000'; end if;
 if p_id is null or p_cycle is null or p_bill_id is null or p_revision is null or p_expected_debit is null then
   raise exception 'invalid arguments' using errcode='22023';
 end if;
 v_payload:=jsonb_build_object('cycle',p_cycle,'bill_id',p_bill_id,'revision',p_revision,'expected_debit',p_expected_debit);
 perform pg_advisory_xact_lock(hashtextextended(v_owner::text||':'||p_id::text,1));
 select * into v_old from finance_lab.verified_operations where owner_id=v_owner and operation_id=p_id;
 if found then
   if v_old.payload<>v_payload then raise exception 'operation id payload mismatch' using errcode='22023'; end if;
   return v_old.result;
 end if;
 -- Never adopt an ID previously used through the older entry point.
 if exists(select 1 from finance_lab.operations where owner_id=v_owner and operation_id=p_id) then
   raise exception 'operation id already exists outside verified entry point' using errcode='23505';
 end if;
 select * into v_bill from finance_lab.bill_catalog where owner_id=v_owner and cycle=p_cycle and bill_id=p_bill_id for update;
 if not found then raise exception 'bill not found' using errcode='P0002'; end if;
 if v_bill.revision<>p_revision then raise exception 'bill revision changed; reconfirm' using errcode='40001'; end if;
 v_result:=finance_lab.apply_operation(p_id,'pay',v_bill.amount,p_cycle,p_bill_id,p_expected_debit);
 insert into finance_lab.verified_operations values(v_owner,p_id,v_payload,v_result);
 return v_result;
end $$;
revoke all on function finance_lab.pay_verified(uuid,date,text,bigint,numeric) from public;
grant execute on function finance_lab.pay_verified(uuid,date,text,bigint,numeric) to authenticated;
