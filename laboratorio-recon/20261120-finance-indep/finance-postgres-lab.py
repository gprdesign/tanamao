#!/usr/bin/env python3
"""Disposable local PostgreSQL only. Never connects to Supabase or production.
Requires initdb, pg_ctl, psql and pg_config; run as a non-root user.
The mock auth.uid is NOT a test of Supabase JWT authentication.
"""
import concurrent.futures, os, pathlib, shutil, subprocess, tempfile, uuid

ROOT = pathlib.Path(__file__).resolve().parent
BIN = pathlib.Path(subprocess.check_output(['pg_config','--bindir'], text=True).strip())
run = lambda cmd, **kw: subprocess.run(cmd, text=True, capture_output=True, check=True, **kw)
A='11111111-1111-4111-8111-111111111111'
B='22222222-2222-4222-8222-222222222222'

def op(kind, amount='null', cycle='null', bill='null', oid=None, expected=None):
    confirmed = (amount if expected is None else expected) if kind == 'pay' else 'null'
    return f"select finance_lab.apply_operation('{oid or uuid.uuid4()}', '{kind}', {amount}, {cycle}, {bill}, {confirmed});"

with tempfile.TemporaryDirectory(prefix='tnm-finance-postgres-') as td:
    td=pathlib.Path(td); data=td/'data'; sock=td/'socket'; sock.mkdir()
    run([str(BIN/'initdb'),'-D',str(data),'-A','trust','--no-instructions'])
    run([str(BIN/'pg_ctl'),'-D',str(data),'-l',str(td/'postgres.log'),'-o',f"-F -c listen_addresses='' -k {sock} -p 55472",'-w','start'])
    base=[str(BIN/'psql'),'-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-h',str(sock),'-p','55472','-d','postgres']
    def sql(text, who=None, ok=True):
        prefix = f"set role authenticated; set request.jwt.claim.sub='{who}'; " if who else ''
        p=subprocess.run(base, input=prefix+text, text=True, capture_output=True)
        if ok and p.returncode: raise AssertionError(f'Unexpected SQL error: {p.stderr}')
        if not ok and not p.returncode: raise AssertionError(f'Expected rejection: {text}')
        return p.stdout.strip(), p.stderr
    def bal(owner=A): return sql(f"select balance from finance_lab.wallets where owner_id='{owner}';")[0]
    def chk(cond,msg):
        if not cond: raise AssertionError(msg)
        print('PASS',msg,flush=True)
    try:
        sql("create role authenticated nologin; create schema auth; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$; grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;")
        sql((ROOT/'finance-transaction-LAB-ONLY.sql').read_text())
        sql(f"insert into finance_lab.wallets values ('{A}',100),('{B}',75);")
        # Real concurrent backend processes; start together, commit independently.
        with concurrent.futures.ThreadPoolExecutor(max_workers=16) as pool:
            list(pool.map(lambda _: sql(op('deposit','1'),A), range(40)))
        chk(bal()=='140.00','40 concurrent deposits serialize without lost updates')
        same=str(uuid.uuid4())
        with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
            results=list(pool.map(lambda _: sql(op('deposit','10',oid=same),A)[0], range(12)))
        chk(len(set(results))==1 and bal()=='150.00','concurrent idempotent retries return same original result; charge once')
        _, err=sql(op('deposit','11',oid=same),A,False)
        chk('payload mismatch' in err and bal()=='150.00','same key with changed payload rejected')
        # Lost response: discard result, replay original operation ID after later mutation.
        retry=str(uuid.uuid4()); original=sql(op('withdraw','5',oid=retry),A)[0]
        sql(op('deposit','2'),A)
        chk(sql(op('withdraw','5',oid=retry),A)[0]==original and bal()=='147.00','lost response can be recovered with stable ID')
        sql(op('pay','20',"'2026-11-01'","'fake-bill'"),A)
        chk(bal()=='127.00' and sql("select paid || ':' || debit from finance_lab.bills where bill_id='fake-bill'",A)[0]=='true:20.00','payment atomically debits and marks paid')
        sql(op('pay','20',"'2026-11-01'","'fake-bill'"),A,False)
        sql(op('reopen','null',"'2026-11-01'","'fake-bill'"),A)
        chk(bal()=='147.00' and sql("select paid || ':' || debit from finance_lab.bills where bill_id='fake-bill'",A)[0]=='false:0.00','reopen returns exactly recorded debit')
        sql(op('pay_without_debit','null',"'2026-11-01'","'fake-bill'"),A)
        sql(op('reopen','null',"'2026-11-01'","'fake-bill'"),A)
        chk(bal()=='147.00','no-debit payment and reopen do not change balance')
        # Partial payment uses authoritative available funds, not requested bill total.
        sql(op('withdraw','100'),A)
        partial_id=str(uuid.uuid4())
        partial=sql(op('pay','80',"'2026-11-01'","'partial'",partial_id,expected='47'),A)[0]
        chk(bal()=='0.00' and '"deductedAmount": 47.00' in partial and sql("select debit from finance_lab.bills where bill_id='partial'",A)[0]=='47.00','partial deduction records actual available balance')
        sql(op('pay','80',"'2026-11-01'","'zero'"),A,False)
        sql(op('deposit','3'),A)
        chk(sql(op('pay','80',"'2026-11-01'","'partial'",partial_id,expected='47'),A)[0]==partial and bal()=='3.00','retry returns original partial result without repeating deduction')
        sql(op('reopen','null',"'2026-11-01'","'partial'"),A)
        chk(bal()=='50.00','reopen restores only 47 actually deducted after intervening deposit')
        sql(op('deposit','97'),A)
        sql(op('withdraw','999'),A,False)
        sql(op('deposit',"'NaN'"),A,False)
        sql(op('deposit','0.001'),A,False)
        chk(bal()=='147.00','overdraw and malformed amounts rejected')
        # Trigger failure at the final write; wallet and bill must roll back together.
        sql("create function finance_lab.fail_log() returns trigger language plpgsql as $$ begin raise exception 'injected log failure'; end $$; create trigger fail_log before insert on finance_lab.operations for each row execute function finance_lab.fail_log();")
        sql(op('pay','25',"'2026-12-01'","'rollback'"),A,False)
        chk(bal()=='147.00' and sql("select count(*) from finance_lab.bills where bill_id='rollback'")[0]=='0','failure on final insert rolls back wallet and bill')
        sql(op('reopen','null',"'2026-11-01'","'fake-bill'"),A,False) # unpaid already, rejected safely
        sql('drop trigger fail_log on finance_lab.operations;')
        sql(op('pay','25',"'2026-12-01'","'rollback-reopen'"),A)
        sql("create trigger fail_log before insert on finance_lab.operations for each row execute function finance_lab.fail_log();")
        sql(op('reopen','null',"'2026-12-01'","'rollback-reopen'"),A,False)
        chk(bal()=='122.00' and sql("select paid || ':' || debit from finance_lab.bills where bill_id='rollback-reopen'",A)[0]=='true:25.00','failed reopen rolls back both credit and status')
        sql('drop trigger fail_log on finance_lab.operations;')
        sql(op('reopen','null',"'2026-12-01'","'rollback-reopen'"),A)
        chk(bal()=='147.00','reopen succeeds after rollback')
        chk(sql('select count(*) from finance_lab.wallets',A)[0]=='1' and sql('select count(*) from finance_lab.operations',B)[0]=='0' and sql("select count(*) from finance_lab.bills",B)[0]=='0','RLS isolates owner rows')
        sql(f"update finance_lab.wallets set balance=0 where owner_id='{A}';",A,False)
        sql("insert into finance_lab.operations values ('%s','%s','{}','{}',now());"%(A,uuid.uuid4()),A,False)
        sql(op('deposit','10'),None,False)
        chk(bal(B)=='75.00','direct lab-table writes and unauthenticated call blocked; second owner untouched')
        # Distinct requests racing to pay one bill cannot both debit it.
        def racing(sql_text, expected_error):
            p=subprocess.run(base, input=f"set role authenticated; set request.jwt.claim.sub='{A}'; " + sql_text, text=True, capture_output=True)
            if p.returncode == 0: return True
            if expected_error not in p.stderr: raise AssertionError(f'unexpected concurrency error: {p.stderr}')
            return False
        def competing_payment(_):
            return racing(op('pay','10',"'2026-12-01'","'race'"), 'bill already paid')
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool: results=list(pool.map(competing_payment, range(2)))
        chk(sum(results)==1 and bal()=='137.00','concurrent payment requests debit a bill at most once')
        sql(op('reopen','null',"'2026-12-01'","'race'"),A)
        chk(bal()=='147.00','reopening concurrently-paid bill returns its debit')
        # Competing withdrawals cannot overdraw.
        def withdraw(_):
            return racing(op('withdraw','100'), 'insufficient balance')
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool: results=list(pool.map(withdraw, range(2)))
        chk(sum(results)==1 and bal()=='47.00','concurrent withdrawals permit only one when funds are insufficient for both')
        # Stale confirmation is rejected with no bill, log or wallet changes.
        stale_id=str(uuid.uuid4())
        _, err=sql(op('pay','100',"'2026-12-01'","'stale'",stale_id,expected='50'),B,False)
        chk('confirmed deduction changed' in err and bal(B)=='75.00' and sql("select count(*) from finance_lab.bills where bill_id='stale'")[0]=='0' and sql(f"select count(*) from finance_lab.operations where operation_id='{stale_id}'")[0]=='0','changed confirmed deduction fails atomically')
        # Concurrent deposit either executes before confirmation and rejects payment, or after it.
        def concurrent_pay():
            p=subprocess.run(base, input=f"set role authenticated; set request.jwt.claim.sub='{B}'; " + op('pay','100',"'2026-12-01'","'partial-race'",expected='75'), text=True, capture_output=True)
            if p.returncode and 'confirmed deduction changed' not in p.stderr: raise AssertionError(p.stderr)
            return p.returncode == 0
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            a=pool.submit(concurrent_pay); b=pool.submit(sql,op('deposit','25'),B)
            paid=a.result(); b.result()
        if paid:
            chk(bal(B)=='25.00' and sql("select debit from finance_lab.bills where bill_id='partial-race'",B)[0]=='75.00','concurrent pay uses only confirmed debit')
            sql(op('reopen','null',"'2026-12-01'","'partial-race'"),B)
        else:
            chk(bal(B)=='100.00' and sql("select count(*) from finance_lab.bills where bill_id='partial-race'",B)[0]=='0','concurrent change rejects stale confirmed debit')
        chk(bal(B)=='100.00','concurrent confirmation preserves funds')
        print('All disposable PostgreSQL checks passed.')
    finally:
        run([str(BIN/'pg_ctl'),'-D',str(data),'-m','immediate','-w','stop'])
