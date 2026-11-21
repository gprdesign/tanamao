#!/usr/bin/env python3
"""Synthetic identities/data only; temporary local Postgres, Unix socket, mock auth."""
import concurrent.futures, pathlib, subprocess, tempfile, uuid, time
P=pathlib.Path(__file__).resolve().parent
B=pathlib.Path(subprocess.check_output(['pg_config','--bindir'],text=True).strip())
A='11111111-1111-4111-8111-111111111111'; C='22222222-2222-4222-8222-222222222222'
def run(cmd,**kw): return subprocess.run(cmd,text=True,capture_output=True,check=True,**kw)
with tempfile.TemporaryDirectory(prefix='verified-pay-lab-') as t:
 d=pathlib.Path(t); data=d/'data'; sock=d/'socket'; sock.mkdir()
 run([str(B/'initdb'),'-D',str(data),'-A','trust','--no-instructions'])
 run([str(B/'pg_ctl'),'-D',str(data),'-l',str(d/'pg.log'),'-o',f"-F -c listen_addresses='' -k {sock} -p 55474",'-w','start'])
 base=[str(B/'psql'),'-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-h',str(sock),'-p','55474','-d','postgres']
 def sql(q,who=None,ok=True):
  prefix=f"set role authenticated; set request.jwt.claim.sub='{who}'; " if who else ''
  p=subprocess.run(base,input=prefix+q,text=True,capture_output=True)
  if bool(p.returncode)==ok: raise AssertionError(f'{q}: {p.stderr}')
  return p.stdout.strip(),p.stderr
 def check(x,msg):
  if not x: raise AssertionError(msg)
  print('PASS',msg,flush=True)
 def pay(key,bill='a',revision=1,debit=20):
  return f"select finance_lab.pay_verified('{key}','2026-11-01','{bill}',{revision},{debit});"
 try:
  sql("create role authenticated nologin; create schema auth; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;")
  sql((P/'finance-transaction-LAB-ONLY.sql').read_text()); sql((P/'finance-authoritative-LAB-ONLY.sql').read_text())
  sql(f"insert into finance_lab.wallets values ('{A}',100),('{C}',50); insert into finance_lab.bill_catalog values ('{A}','2026-11-01','a',20,1),('{A}','2026-11-01','b',30,1),('{C}','2026-11-01','b',7,1);")
  key=str(uuid.uuid4()); q=pay(key)
  with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool: out=list(pool.map(lambda _:sql(q,A)[0],range(12)))
  check(len(set(out))==1 and sql(f"select balance from finance_lab.wallets where owner_id='{A}'")[0]=='80.00' and sql('select count(*) from finance_lab.bills')[0]=='1','12 concurrent retries charge only once and return same result')
  sql("update finance_lab.bill_catalog set amount=25,revision=2 where bill_id='a';")
  check(sql(q,A)[0]==out[0] and sql(f"select balance from finance_lab.wallets where owner_id='{A}'")[0]=='80.00','discarded response replay survives later bill edit')
  check('payload mismatch' in sql(pay(key,revision=2),A,False)[1],'key reuse with changed revision is rejected')
  sql(pay(str(uuid.uuid4()),bill='b',revision=0,debit=30),A,False)
  check(sql(f"select balance from finance_lab.wallets where owner_id='{A}'")[0]=='80.00' and sql("select count(*) from finance_lab.bills where bill_id='b'")[0]=='0','stale bill revision fails without mutation')
  check('confirmed deduction changed' in sql(pay(str(uuid.uuid4()),bill='b',debit=29),A,False)[1], 'catalog amount is authoritative; wrong confirmed debit is rejected')
  check('bill not found' in sql(pay(str(uuid.uuid4()),bill='a'),C,False)[1] and sql('select count(*) from finance_lab.bill_catalog',C)[0]=='1','catalog and payment isolated across synthetic owners')
  sql("select finance_lab.apply_operation('00000000-0000-4000-8000-000000000001','deposit',1,null,null,null)",A,False)
  sql(f"update finance_lab.bill_catalog set amount=1 where owner_id='{A}'",A,False)
  check(True,'authenticated user cannot bypass wrapper or edit catalog directly')
  # A catalog writer holding its row lock commits before the blocked payer rechecks revision.
  sql(f"insert into finance_lab.bill_catalog values ('{A}','2026-11-01','race',30,1)")
  editor=subprocess.Popen(base+['-c',f"set application_name='synthetic_editor'; begin; update finance_lab.bill_catalog set amount=35,revision=2 where owner_id='{A}' and bill_id='race'; select pg_sleep(2); commit;"],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
  try:
   for _ in range(100):
    if sql("select count(*) from pg_stat_activity where application_name='synthetic_editor' and wait_event='PgSleep'")[0]=='1': break
    time.sleep(0.02)
   else: raise AssertionError('editor did not acquire catalog lock')
   _,err=sql(pay(str(uuid.uuid4()),bill='race',debit=30),A,False)
   check('bill revision changed' in err and sql("select count(*) from finance_lab.bills where bill_id='race'")[0]=='0','concurrent catalog change forces reconfirmation; no debit')
  finally:
   _,err=editor.communicate(timeout=5)
   if editor.returncode: raise AssertionError(err)
  # Fault at last wrapper insert must roll back underlying operation, bill and wallet.
  sql("create function finance_lab.fail_verified() returns trigger language plpgsql as $$ begin raise exception 'injected'; end $$; create trigger fail_verified before insert on finance_lab.verified_operations for each row execute function finance_lab.fail_verified();")
  failing=str(uuid.uuid4()); sql(pay(failing,bill='b',debit=30),A,False)
  check(sql(f"select balance from finance_lab.wallets where owner_id='{A}'")[0]=='80.00' and sql("select count(*) from finance_lab.bills where bill_id='b'")[0]=='0' and sql(f"select count(*) from finance_lab.operations where operation_id='{failing}'")[0]=='0','late failure rolls back all underlying effects and logs')
  sql('drop trigger fail_verified on finance_lab.verified_operations')
  sql(pay(failing,bill='b',debit=30),A)
  check(sql(f"select balance from finance_lab.wallets where owner_id='{A}'")[0]=='50.00','same ID can safely retry after transaction rollback')
  print('All synthetic verified-payment checks passed.')
 finally: run([str(B/'pg_ctl'),'-D',str(data),'-m','immediate','-w','stop'])
