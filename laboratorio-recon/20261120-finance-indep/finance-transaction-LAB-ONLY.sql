-- EXPERIMENTAL LAB ONLY. Separate schema; NOT a Supabase migration.
-- No connection to nmm_finance_state or real data. No UI integration.
-- Production requires reconciliation, legacy writer blocking and a reviewed migration.
create schema finance_lab;
revoke all on schema finance_lab from public;
grant usage on schema finance_lab to authenticated;

create table finance_lab.wallets (
  owner_id uuid primary key,
  balance numeric(14,2) not null check (balance >= 0 and balance <> 'NaN'::numeric)
);
create table finance_lab.bills (
  owner_id uuid not null references finance_lab.wallets(owner_id),
  cycle date not null check (extract(day from cycle) = 1),
  bill_id text not null check (length(bill_id) between 1 and 100),
  paid boolean not null,
  debit numeric(14,2) not null check (debit >= 0 and debit <> 'NaN'::numeric),
  primary key(owner_id, cycle, bill_id),
  check (paid or debit = 0)
);
create table finance_lab.operations (
  owner_id uuid not null references finance_lab.wallets(owner_id),
  operation_id uuid not null,
  payload jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key(owner_id,operation_id)
);
alter table finance_lab.wallets enable row level security;
alter table finance_lab.bills enable row level security;
alter table finance_lab.operations enable row level security;
create policy wallet_read on finance_lab.wallets for select to authenticated using (owner_id = (select auth.uid()));
create policy bill_read on finance_lab.bills for select to authenticated using (owner_id = (select auth.uid()));
create policy operation_read on finance_lab.operations for select to authenticated using (owner_id = (select auth.uid()));
revoke all on all tables in schema finance_lab from public, authenticated;
grant select on all tables in schema finance_lab to authenticated;

-- A wallet must already exist; provisioning/reconciliation is intentionally out of scope.
-- New operation IDs MUST persist across retry. The stored original result is returned.
create function finance_lab.apply_operation(
  p_id uuid, p_kind text, p_amount numeric default null,
  p_cycle date default null, p_bill_id text default null,
  p_expected_debit numeric default null
) returns jsonb language plpgsql security definer set search_path = pg_catalog, finance_lab as $$
declare
  v_owner uuid := auth.uid();
  v_balance numeric(14,2);
  v_payload jsonb;
  v_previous finance_lab.operations%rowtype;
  v_bill finance_lab.bills%rowtype;
  v_result jsonb;
  v_debit numeric(14,2) := 0;
begin
  if v_owner is null then raise exception 'authentication required' using errcode='28000'; end if;
  if p_id is null or p_kind is null or p_kind not in ('deposit','withdraw','pay','pay_without_debit','reopen') then
    raise exception 'invalid operation' using errcode='22023';
  end if;
  if p_kind in ('deposit','withdraw','pay') then
    if p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity') or p_amount <= 0 or p_amount > 999999999999.99 or p_amount <> round(p_amount,2) then
      raise exception 'invalid amount' using errcode='22023';
    end if;
  elsif p_amount is not null then raise exception 'amount not applicable' using errcode='22023'; end if;
  if p_kind in ('pay','pay_without_debit','reopen') then
    if p_cycle is null or extract(day from p_cycle) <> 1 or p_bill_id is null or length(trim(p_bill_id)) = 0 or length(p_bill_id) > 100 then
      raise exception 'invalid bill' using errcode='22023';
    end if;
  elsif p_cycle is not null or p_bill_id is not null then raise exception 'bill not applicable' using errcode='22023'; end if;
  if p_kind = 'pay' then
    if p_expected_debit is null or p_expected_debit::text in ('NaN','Infinity','-Infinity') or p_expected_debit <= 0 or p_expected_debit > p_amount or p_expected_debit <> round(p_expected_debit,2) then
      raise exception 'invalid confirmed deduction' using errcode='22023';
    end if;
  elsif p_expected_debit is not null then raise exception 'confirmed deduction not applicable' using errcode='22023'; end if;
  v_payload := jsonb_build_object('kind',p_kind,'amount',p_amount,'cycle',p_cycle,'bill_id',p_bill_id,'expected_debit',p_expected_debit);
  -- Serialize all operations on one owner's wallet, including checking the idempotency key.
  select balance into v_balance from finance_lab.wallets where owner_id = v_owner for update;
  if not found then raise exception 'wallet not provisioned' using errcode='P0002'; end if;
  select * into v_previous from finance_lab.operations where owner_id=v_owner and operation_id=p_id;
  if found then
    if v_previous.payload <> v_payload then raise exception 'operation id payload mismatch' using errcode='22023'; end if;
    return v_previous.result;
  end if;
  if p_kind in ('pay','pay_without_debit','reopen') then
    select * into v_bill from finance_lab.bills where owner_id=v_owner and cycle=p_cycle and bill_id=p_bill_id for update;
    if p_kind in ('pay','pay_without_debit') then
      if found and v_bill.paid then raise exception 'bill already paid' using errcode='23505'; end if;
      -- Existing UI permits a partial deduction; zero balance requires explicit no-debit.
      if p_kind='pay' then
        v_debit := least(p_amount, v_balance);
        if v_debit = 0 then raise exception 'no balance available; use pay_without_debit' using errcode='23514'; end if;
        if v_debit <> p_expected_debit then raise exception 'confirmed deduction changed; reconfirm' using errcode='40001'; end if;
      end if;
      v_balance := v_balance - v_debit;
      insert into finance_lab.bills(owner_id,cycle,bill_id,paid,debit) values(v_owner,p_cycle,p_bill_id,true,v_debit)
        on conflict(owner_id,cycle,bill_id) do update set paid=true,debit=excluded.debit;
    else
      if not found or not v_bill.paid then raise exception 'bill not paid' using errcode='23514'; end if;
      -- Reopening reverses exactly the original debit, if any; never a caller-provided amount.
      v_debit := v_bill.debit;
      v_balance := v_balance + v_debit;
      update finance_lab.bills set paid=false,debit=0 where owner_id=v_owner and cycle=p_cycle and bill_id=p_bill_id;
    end if;
  elsif p_kind='deposit' then v_balance := v_balance + p_amount;
  else
    if v_balance < p_amount then raise exception 'insufficient balance' using errcode='23514'; end if;
    v_balance := v_balance - p_amount;
  end if;
  update finance_lab.wallets set balance=v_balance where owner_id=v_owner;
  v_result := jsonb_build_object('operation_id',p_id,'balance',v_balance,'kind',p_kind,'cycle',p_cycle,'bill_id',p_bill_id,'deductedAmount',case when p_kind in ('pay','pay_without_debit','reopen') then v_debit else null end,'paid',case when p_kind in ('pay','pay_without_debit') then true when p_kind='reopen' then false else null end);
  insert into finance_lab.operations(owner_id,operation_id,payload,result) values(v_owner,p_id,v_payload,v_result);
  return v_result;
end $$;
revoke all on function finance_lab.apply_operation(uuid,text,numeric,date,text,numeric) from public;
grant execute on function finance_lab.apply_operation(uuid,text,numeric,date,text,numeric) to authenticated;
