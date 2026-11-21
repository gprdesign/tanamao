#!/usr/bin/env python3
"""Only freshly initialized synthetic local DB, private socket, no TCP."""
import json,os,pathlib,subprocess,tempfile
P=pathlib.Path(__file__).resolve().parents[1]; BIN=pathlib.Path(os.environ.get('PG_BIN','/usr/lib/postgresql/17/bin'))
def run(args,**kw): return subprocess.run([str(x) for x in args],check=True,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,**kw)
with tempfile.TemporaryDirectory(prefix='tnm-entity-pg-') as temp:
 root=pathlib.Path(temp); data=root/'data'; sock=root/'sock';sock.mkdir();run([BIN/'initdb','-D',data,'-A','trust','--no-locale']);run([BIN/'pg_ctl','-D',data,'-l',root/'pg.log','-o',f"-c listen_addresses='' -k {sock} -p 57485",'start','-w'])
 try:
  cmd=[str(BIN/'psql'),'-X','-v','ON_ERROR_STOP=1','-A','-t','-h',str(sock),'-p','57485','-d','postgres']
  def sql(s,check=True):return subprocess.run(cmd,input=s,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=check)
  schema=(P/'supabase/schema.sql').read_text(); tables=schema[schema.index('create table if not exists public.nmm_notes'):schema.index('create table if not exists public.nmm_finance_entries')]
  a='00000000-0000-0000-0000-000000000001';b='00000000-0000-0000-0000-000000000002'
  sql(f"""create role anon;create role authenticated;create role inherited;create schema auth;create table auth.users(id uuid primary key);insert into auth.users values ('{a}'),('{b}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;"""+tables+"alter table public.nmm_notes enable row level security;alter table public.nmm_logs enable row level security; grant select,insert,update,delete on public.nmm_notes,public.nmm_logs to authenticated;")
  draft=(P/'supabase/migration-note-log-cas-DRAFT.sql').read_text();stop="do $$ begin raise exception 'DRAFT: migration disabled; use disposable test DB only'; end $$;";assert draft.count(stop)==1
  assert sql(draft,False).returncode!=0
  enabled=draft.replace(stop,'-- removed only in disposable synthetic cluster')
  sql('grant inherited to authenticated; grant update (title) on public.nmm_notes to inherited;')
  failed=sql(enabled,False);assert failed.returncode!=0 and 'effective write column privilege remains' in failed.stderr
  sql('revoke update (title) on public.nmm_notes from inherited;');sql(enabled)
  base={'id':'synthetic-1','owner_id':b,'content':'x','planner_version':1,'created_at':'2026-01-01T00:00:00Z','updated_at':'2026-01-01T00:00:00Z','deleted_at':None}
  note={**base,'title':'old','link_url':'','links':[],'is_pinned':False,'tag_ids':[],'sort_order':0}; log={**base,'tag_id':None,'is_locked':False}
  def call(who,kind,row,rev):
   payload=json.dumps(row,separators=(',',':')).replace("'","''")
   return f"set role authenticated;set request.jwt.claim.sub='{who}';select public.nmm_note_log_cas_lab('{kind}','{payload}'::jsonb,{rev});"
  def result(who,kind,row,rev):return json.loads(sql(call(who,kind,row,rev)).stdout.strip().splitlines()[-1])
  for kind,row in [('note',note),('log',log)]:
   first=result(a,kind,row,0);assert first['status']=='ok' and first['revision']==1 and first['row']['owner_id']==a
   assert result(b,kind,row,1)=={'status':'conflict'}
   assert result(b,kind,row,0)=={'status':'conflict'}
   changed={**row,'content':'changed','created_at':'2020-01-01T00:00:00Z'}
   updated=result(a,kind,changed,1);assert updated['revision']==2 and updated['row']['created_at'].startswith('2026-01-01')
   assert result(a,kind,row,1)=={'status':'conflict'}
   assert sql(call(a,kind,{**row,'unknown':'x'},2),False).returncode!=0
   missing={k:v for k,v in row.items() if k!='deleted_at'};assert sql(call(a,kind,missing,2),False).returncode!=0
   assert sql(call(a,kind,{**row,'content':None},2),False).returncode!=0
   p1=subprocess.Popen(cmd,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True);p2=subprocess.Popen(cmd,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
   p1.stdin.write(call(a,kind,{**row,'content':'race1'},2));p1.stdin.close();p2.stdin.write(call(a,kind,{**row,'content':'race2'},2));p2.stdin.close()
   x=p1.stdout.read();ex=p1.stderr.read();y=p2.stdout.read();ey=p2.stderr.read();assert p1.wait()==0 and p2.wait()==0,(ex,ey)
   outcomes=[json.loads(x.strip().splitlines()[-1]),json.loads(y.strip().splitlines()[-1])];assert sorted(v['status'] for v in outcomes)==['conflict','ok']
   table='nmm_notes' if kind=='note' else 'nmm_logs';assert sql(f"select sync_revision from public.{table} where id='synthetic-1'").stdout.strip()=='3'
   assert sql(f"set role authenticated; update public.{table} set content='x' where id='synthetic-1'",False).returncode!=0
  assert sql("set role authenticated;select public.nmm_note_log_cas_lab('note','{}'::jsonb,0)",False).returncode!=0
  print('PASS: guards, inherited grant rejection, note/log create, owner isolation, stale conflicts, immutable creation, bad payloads, direct denial, two-session races')
 finally:run([BIN/'pg_ctl','-D',data,'stop','-m','immediate','-w'])
