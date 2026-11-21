#!/usr/bin/env python3
"""Never contacts a real DB: initializes fresh postgres, local unix socket only."""
import base64, gzip, hashlib, getpass, json, os, pathlib, subprocess, tempfile
H=pathlib.Path(__file__).resolve().parent
ROOT=H.parents[1]; BIN=pathlib.Path(os.environ.get('PG_BIN','/usr/lib/postgresql/17/bin'))
env={k:v for k,v in os.environ.items() if not k.startswith('PG')}
def run(args,**kw): return subprocess.run([str(x) for x in args],env=env,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=True,**kw)
with tempfile.TemporaryDirectory(prefix='tnm-cas-integral-') as tmp:
 d=pathlib.Path(tmp); sock=d/'sock'; sock.mkdir(); data=d/'data'
 run([BIN/'initdb','-D',data,'-A','trust','--no-locale'])
 run([BIN/'pg_ctl','-D',data,'-l',d/'log','-o',f"-c listen_addresses='' -c unix_socket_directories={sock} -c port=57489",'-w','start'])
 try:
  cmd=[str(BIN/'psql'),'-X','-v','ON_ERROR_STOP=1','-A','-t','-h',str(sock),'-p','57489','-U',getpass.getuser(),'-d','postgres']
  def sql(s,check=True): return subprocess.run(cmd,input=s,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=env,check=check)
  a='00000000-0000-0000-0000-000000000001'; b='00000000-0000-0000-0000-000000000002'
  schema=(ROOT/'supabase/schema.sql').read_text()
  sql(f"create role anon; create role authenticated; create role inherited; create schema auth; create table auth.users(id uuid primary key); insert into auth.users values ('{a}'),('{b}'); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth to authenticated,anon;"+schema)
  # Bank schema is a synthetic approximation from app.js, NOT the unknown live DDL.
  sql('''create table public.nmm_bank_transactions (owner_id uuid not null references auth.users(id), transaction_key text not null, occurred_at timestamptz not null, description text not null default '', display_name text not null default '', direction text not null, amount numeric not null, account text not null default '', source_message_id text not null default '', source_consulted_at timestamptz, is_internal_transfer boolean not null default false, planner_version smallint not null default 1, updated_at timestamptz not null default now(), primary key(owner_id,transaction_key)); alter table public.nmm_bank_transactions enable row level security; grant select,insert,update on public.nmm_bank_transactions to authenticated;''')
  # Legacy rows migrate intact; dangerous grants and definer are planted before cutover.
  sql(f"insert into public.nmm_tags(owner_id,id,name,color,planner_version) values ('{a}','old','antes','#123456',1); create function public.old_rpc() returns void language sql security definer as $$update public.nmm_tags set name='bypass'$$; grant execute on function public.old_rpc() to authenticated;")
  packed=(H/'migration-CAS-LAB.sql.gz.b64').read_bytes()
  raw=gzip.decompress(base64.b64decode(packed)); assert hashlib.sha256(raw).hexdigest()=='c4a28b0758494c6be97064664bd0038224e7b03486f8afa93b9ed91b54f2d9d8'
  draft=raw.decode(); stop="DO $$ BEGIN RAISE EXCEPTION 'LAB ONLY: migration disabled'; END $$;"
  assert draft.count(stop)==1 and sql(draft,False).returncode!=0
  mig=draft.replace(stop,'-- unlocked only in isolated disposable PostgreSQL')
  sql('grant inherited to authenticated; grant update(name) on public.nmm_tags to inherited;')
  fail=sql(mig,False); assert fail.returncode and 'effective column privilege remains' in fail.stderr,fail.stderr
  assert sql("select count(*) from pg_attribute where attrelid='public.nmm_tags'::regclass and attname='sync_revision'").stdout.strip()=='0'
  sql('revoke update(name) on public.nmm_tags from inherited; grant execute on function public.old_rpc() to inherited;')
  fail=sql(mig,False); assert fail.returncode and 'effective legacy routine execute remains' in fail.stderr,fail.stderr
  assert sql("select has_function_privilege('authenticated','public.old_rpc()','execute')").stdout.strip()=='t'
  sql('revoke execute on function public.old_rpc() from inherited;')
  sql('create schema rogue; create function rogue.write_old() returns void language sql security definer as $$update public.nmm_tags set name=\'bypass\'$$; grant execute on function rogue.write_old() to authenticated;')
  fail=sql(mig,False); assert fail.returncode and 'unknown definer executable' in fail.stderr,fail.stderr
  sql('drop function rogue.write_old(); create view rogue.leak as select * from public.nmm_tags; grant select on rogue.leak to authenticated;')
  fail=sql(mig,False); assert fail.returncode and 'unreviewed readable view' in fail.stderr,fail.stderr
  sql('drop view rogue.leak; create table rogue.writer(id int); grant update(id) on rogue.writer to authenticated;')
  fail=sql(mig,False); assert fail.returncode and 'unreviewed writable column' in fail.stderr,fail.stderr
  sql('drop table rogue.writer; create table public.nmm_unknown(id int);')
  fail=sql(mig,False); assert fail.returncode and 'unknown nmm relation' in fail.stderr,fail.stderr
  sql('drop table public.nmm_unknown; alter table public.nmm_notes add column unreviewed text;')
  fail=sql(mig,False); assert fail.returncode and 'unreviewed schema columns' in fail.stderr,fail.stderr
  sql('alter table public.nmm_notes drop column unreviewed;')
  sql(mig)
  assert sql("select name||':'||sync_revision from public.nmm_tags where id='old'").stdout.strip()=='antes:1'
  assert sql("set role authenticated;select public.old_rpc()",False).returncode!=0
  assert sql("set role anon;select * from public.nmm_tags",False).returncode!=0
  assert sql(f"set role authenticated;set request.jwt.claim.sub='{a}';update public.nmm_tags set name='unsafe'",False).returncode!=0
  def query(uid,table,id,rev,values,role='authenticated'):
   payload=json.dumps(values,separators=(',',':')).replace("'","''"); key='NULL' if id is None else "'"+id.replace("'","''")+"'"
   return f"set role {role}; set request.jwt.claim.sub='{uid}';select public.nmm_cas_lab('{table}',{key},{rev},'{payload}'::jsonb);"
  def result(uid,t,id,rev,v): return json.loads(sql(query(uid,t,id,rev,v)).stdout.strip().splitlines()[-1])
  assert sql(query('', 'nmm_tags','x',0,{}),False).returncode!=0
  assert sql(query(a,'nmm_tags','x',0,{},'anon'),False).returncode!=0
  cases=[
   ('nmm_tags','tag',{'name':'A','color':'#123456','planner_version':1}),
   ('nmm_tasks','task',{'title':'t','status':'active','tag_id':'tag','planner_version':1}),
   ('nmm_task_comments','comment',{'task_id':'task','text':'hello'}),
   ('nmm_task_links','link',{'task_id':'task','url':'https://example.org'}),
   ('nmm_notes','note',{'title':'note','planner_version':1}),
   ('nmm_logs','log',{'content':'hello'}),
   ('nmm_finance_entries','entry',{'tag_id':'tag','title':'bill','direction':'expense','amount':10,'movement_date':'2026-11-21','planner_version':1}),
   ('nmm_finance_state',None,{'account_balance':15}),
   ('nmm_bank_transactions','bankkey',{'occurred_at':'2026-11-21T00:00:00Z','direction':'expense','amount':10}),
   ('nmm_user_settings',None,{'data':{'nickname':'test'}}),
   ('nmm_private_vaults',None,{'salt':'s','verifier_iv':'i','verifier_ciphertext':'c'}),
   ('nmm_private_notes','private',{'iv':'i','ciphertext':'secret','planner_version':1})]
  for t,id,v in cases:
   first=result(a,t,id,0,v); assert first['status']=='ok' and first['revision']==1 and first['row']['owner_id']==a,(t,first)
   updated=result(a,t,id,1,v); assert updated['status']=='ok' and updated['revision']==2,(t,updated)
   assert result(a,t,id,1,v)=={'status':'conflict'}
   out=sql(f"set role authenticated;set request.jwt.claim.sub='{b}'; select count(*) from public.{t};").stdout.strip().splitlines()[-1]
   assert out=='0',(t,out)
   assert sql(query(a,t,id,2,{'owner_id':b}),False).returncode!=0
  assert sql(query(b,'nmm_task_comments','evil',0,{'task_id':'task','text':'oops'}),False).returncode!=0
  assert result(b,'nmm_notes','note',0,{'planner_version':1})=={'status':'conflict'}
  assert sql(query(a,'nmm_notes','note',2,{'created_at':'2020-01-01'}),False).returncode!=0
  ps=[]
  for name in ['race1','race2']:
   p=subprocess.Popen(cmd,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,env=env);ps.append((p,query(a,'nmm_notes','note',2,{'title':name})))
  for p,s in ps: p.stdin.write(s);p.stdin.close()
  results=[]
  for p,_ in ps:
   out=p.stdout.read();err=p.stderr.read();assert p.wait()==0,err;results.append(json.loads(out.strip().splitlines()[-1]))
  assert sorted(x['status'] for x in results)==['conflict','ok'],results
  print('PASS hard stop; migration rollback; inherited columns/RPCs; legacy RPC revoked; 12 entity create/update/CAS/RLS; unknown identity/parent; concurrent writes')
 finally: run([BIN/'pg_ctl','-D',data,'-m','immediate','-w','stop'])
