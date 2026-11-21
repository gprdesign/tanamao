#!/usr/bin/env python3
"""Disposable Unix-socket-only Postgres; mock auth only; never uses real data."""
import concurrent.futures, pathlib, subprocess, tempfile, uuid
P=pathlib.Path(__file__).resolve().parent
B=pathlib.Path(subprocess.check_output(['pg_config','--bindir'], text=True).strip())
A='11111111-1111-4111-8111-111111111111'; C='22222222-2222-4222-8222-222222222222'
def run(cmd,**kw): return subprocess.run(cmd,text=True,capture_output=True,check=True,**kw)
with tempfile.TemporaryDirectory(prefix='recurrence-lab-') as t:
 d=pathlib.Path(t); data=d/'data'; sock=d/'socket'; sock.mkdir()
 run([str(B/'initdb'),'-D',str(data),'-A','trust','--no-instructions'])
 run([str(B/'pg_ctl'),'-D',str(data),'-l',str(d/'pg.log'),'-o',f"-F -c listen_addresses='' -k {sock} -p 55473",'-w','start'])
 base=[str(B/'psql'),'-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-h',str(sock),'-p','55473','-d','postgres']
 def sql(query,who=None,ok=True):
  prefix=f"set role authenticated; set request.jwt.claim.sub='{who}'; " if who else ''
  p=subprocess.run(base,input=prefix+query,text=True,capture_output=True)
  if bool(p.returncode)==ok: raise AssertionError(f'{query}: {p.stderr}')
  return p.stdout.strip(),p.stderr
 def check(v,msg):
  if not v: raise AssertionError(msg)
  print('PASS',msg,flush=True)
 def op(s,date,revision=1,oid=None): return f"select recurrence_lab.complete_daily('{oid or uuid.uuid4()}','{s}','{date}',{revision});"
 try:
  sql("create role authenticated nologin; create schema auth; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;")
  sql((P/'recurrence-daily-LAB-ONLY.sql').read_text())
  sql(f"insert into recurrence_lab.series(owner_id,series_id,anchor,interval_days,until_date) values ('{A}','s','2026-11-01',2,'2026-11-05'),('{C}','s','2026-11-01',2,null); insert into recurrence_lab.occurrences(owner_id,series_id,occurrence_date) values ('{A}','s','2026-11-01'),('{C}','s','2026-11-01');")
  key=str(uuid.uuid4()); q=op('s','2026-11-01',oid=key)
  with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool: out=list(pool.map(lambda _:sql(q,A)[0],range(10)))
  check(len(set(out))==1 and sql("select count(*) from recurrence_lab.occurrences",A)[0]=='2','10 concurrent retries create one next occurrence and replay result')
  sql(f"update recurrence_lab.series set revision=2, stopped=true where owner_id='{A}' and series_id='s'")
  check(sql(q,A)[0]==out[0] and sql("select count(*) from recurrence_lab.occurrences where series_id='s'",A)[0]=='2','lost response replay returns original result even after series changed')
  sql(f"update recurrence_lab.series set revision=1, stopped=false where owner_id='{A}' and series_id='s'")
  _,err=sql(op('s','2026-11-03',oid=key),A,False); check('payload mismatch' in err,'same ID cannot be reused with different payload')
  sql(op('s','2026-11-03',revision=0),A,False)
  check(sql("select completed from recurrence_lab.occurrences where occurrence_date='2026-11-03'",A)[0]=='f','stale rule revision does not mutate occurrence')
  def attempt(_):
   p=subprocess.run(base,input=f"set role authenticated; set request.jwt.claim.sub='{A}'; "+op('s','2026-11-03'),text=True,capture_output=True)
   if p.returncode and 'occurrence unavailable' not in p.stderr: raise AssertionError(p.stderr)
   return p.returncode==0
  with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool: res=list(pool.map(attempt,range(2)))
  check(sum(res)==1 and sql("select count(*) from recurrence_lab.occurrences where occurrence_date='2026-11-05'",A)[0]=='1','concurrent distinct completions create exactly one successor')
  r=sql(op('s','2026-11-05'),A)[0]; check('"next_state": "ended"' in r and sql('select count(*) from recurrence_lab.occurrences',A)[0]=='3','until boundary ends recurrence')
  check(sql('select count(*) from recurrence_lab.occurrences',C)[0]=='1','owner isolation by RLS')
  sql("update recurrence_lab.occurrences set completed=true",C,False); sql(op('s','2026-11-01'),None,False)
  check(sql("select completed from recurrence_lab.occurrences",C)[0]=='f','direct writes and unauthenticated calls rejected')
  sql(f"insert into recurrence_lab.series(owner_id,series_id,anchor,interval_days) values ('{A}','deleted','2026-11-01',1); insert into recurrence_lab.occurrences(owner_id,series_id,occurrence_date,deleted) values ('{A}','deleted','2026-11-01',false),('{A}','deleted','2026-11-02',true);")
  r=sql(op('deleted','2026-11-01'),A)[0]; check('"next_state": "deleted"' in r and sql("select deleted from recurrence_lab.occurrences where series_id='deleted' and occurrence_date='2026-11-02'",A)[0]=='t','deleted occurrence never silently resurrected')
  sql(f"insert into recurrence_lab.series(owner_id,series_id,anchor,interval_days) values ('{A}','rollback','2026-11-01',1); insert into recurrence_lab.occurrences(owner_id,series_id,occurrence_date) values ('{A}','rollback','2026-11-01'); create function recurrence_lab.fail_op() returns trigger language plpgsql as $$ begin raise exception 'injected'; end $$; create trigger fail_op before insert on recurrence_lab.operations for each row execute function recurrence_lab.fail_op();")
  sql(op('rollback','2026-11-01'),A,False)
  check(sql("select completed from recurrence_lab.occurrences where series_id='rollback'",A)[0]=='f' and sql("select count(*) from recurrence_lab.occurrences where series_id='rollback'",A)[0]=='1','injected failure rolls back completion and successor')
  print('All disposable PostgreSQL recurrence checks passed.')
 finally: run([str(B/'pg_ctl'),'-D',str(data),'-m','immediate','-w','stop'])
