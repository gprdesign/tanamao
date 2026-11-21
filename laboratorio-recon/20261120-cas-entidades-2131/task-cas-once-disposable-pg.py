#!/usr/bin/env python3
"""Artificial data only. Fresh private local Postgres; no TCP or existing DB."""
import json, os, pathlib, subprocess, tempfile
P=pathlib.Path(__file__).resolve().parents[1]
BIN=pathlib.Path(os.environ.get('PG_BIN','/usr/lib/postgresql/17/bin'))
def run(args, **kw):
    return subprocess.run([str(x) for x in args],check=True,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,**kw)
with tempfile.TemporaryDirectory(prefix='tnm-once-pg-') as tmp:
    root=pathlib.Path(tmp); data=root/'data'; sock=root/'sock'; sock.mkdir()
    run([BIN/'initdb','-D',data,'-A','trust','--no-locale'])
    run([BIN/'pg_ctl','-D',data,'-l',root/'postgres.log','-o',f"-c listen_addresses='' -k {sock} -p 57484",'start','-w'])
    try:
        cmd=[str(BIN/'psql'),'-X','-v','ON_ERROR_STOP=1','-A','-t','-h',str(sock),'-p','57484','-d','postgres']
        def sql(s,check=True): return subprocess.run(cmd,input=s,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=check)
        schema=(P/'supabase/schema.sql').read_text().split('create table if not exists public.nmm_tags')[0]
        sql("""create role anon; create role authenticated; create schema auth;
        create table auth.users(id uuid primary key);
        create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
        grant usage on schema auth to authenticated,anon;
        insert into auth.users values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
        """+schema+"alter table public.nmm_tasks enable row level security; grant select,insert,update,delete on public.nmm_tasks to authenticated;")
        stop="do $$ begin raise exception 'DRAFT: migration disabled; use disposable test DB only'; end $$;"
        for name in ('migration-task-cas-DRAFT.sql','migration-task-cas-idempotent-DRAFT.sql'):
            draft=(P/'supabase'/name).read_text(); assert draft.count(stop)==1
            assert sql(draft,check=False).returncode != 0, 'draft guard missing'
            enabled=draft.replace(stop,'-- guard removed only in disposable synthetic cluster')
            if name=='migration-task-cas-idempotent-DRAFT.sql':
                sql('create role inherited; grant inherited to authenticated; grant execute on function public.nmm_task_cas(jsonb,bigint) to inherited;')
                failed=sql(enabled,check=False)
                assert failed.returncode != 0 and 'effective receipt or direct task function access remains' in failed.stderr
                sql('revoke execute on function public.nmm_task_cas(jsonb,bigint) from inherited;')
            sql(enabled)
        a='00000000-0000-0000-0000-000000000001'; b='00000000-0000-0000-0000-000000000002'
        op1='10000000-0000-0000-0000-000000000001'; op2='10000000-0000-0000-0000-000000000002'; op3='10000000-0000-0000-0000-000000000003'; op4='10000000-0000-0000-0000-000000000004'
        row={'id':'synthetic-1','title':'original','details':'','link_url':'','subtasks':[],'status':'active','release_date':None,'due_date':None,'execution_date':None,'recurrence':None,'tag_id':'vida','sort_order':0,'planner_version':1,'estimate_minutes':60,'reward':'','blocker':'','time_spent_seconds':0,'created_at':'2026-01-01T00:00:00Z','updated_at':'2026-01-01T00:00:00Z','completed_at':None,'completed_date':None,'deleted_at':None}
        def call(who,op,r,rev):
            v=json.dumps(r,separators=(',',':')).replace("'","''")
            return f"set role authenticated; set request.jwt.claim.sub='{who}'; select public.nmm_task_cas_once_lab('{op}','{v}'::jsonb,{rev});"
        def result(who,op,r,rev): return json.loads(sql(call(who,op,r,rev)).stdout.strip().splitlines()[-1])
        first=result(a,op1,row,0); assert first['replayed'] is False and first['historic_outcome']['revision']==1
        # Client lost the response: exact repeat never performs the mutation again.
        replay=result(a,op1,row,0); assert replay['replayed'] is True and replay['historic_outcome']==first['historic_outcome']
        altered={**row,'title':'tampered'}
        assert sql(call(a,op1,altered,0),False).returncode != 0
        assert sql(call(a,op1,row,1),False).returncode != 0
        # Same op token in another account: no receipt exposure; cross-owner id remains conflict.
        assert result(b,op1,row,0)['historic_outcome']=={'status':'conflict'}
        changed={**row,'title':'updated'}; updated=result(a,op2,changed,1)
        assert updated['historic_outcome']['revision']==2
        assert result(a,op1,row,0)['historic_outcome']['revision']==1 # historic, not current
        assert sql("select sync_revision from public.nmm_tasks where id='synthetic-1';").stdout.strip()=='2'
        # Distinct operations racing from revision 2: exactly one succeeds.
        p1=subprocess.Popen(cmd,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        p2=subprocess.Popen(cmd,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        s1=call(a,op3,{**row,'title':'race A'},2); s2=call(a,op4,{**row,'title':'race B'},2)
        p1.stdin.write(s1);p1.stdin.close(); p2.stdin.write(s2);p2.stdin.close()
        x=p1.stdout.read(); ex=p1.stderr.read(); y=p2.stdout.read(); ey=p2.stderr.read()
        assert p1.wait()==0 and p2.wait()==0,(ex,ey)
        outputs=[json.loads(x.strip().splitlines()[-1]),json.loads(y.strip().splitlines()[-1])]
        assert sorted(o['historic_outcome']['status'] for o in outputs)==['conflict','ok']
        assert sql("select sync_revision from public.nmm_tasks where id='synthetic-1';").stdout.strip()=='3'
        # Same operation raced concurrently: exactly one application and one replay.
        op5='10000000-0000-0000-0000-000000000005'; q=call(a,op5,{**row,'title':'same-op-race'},3)
        p1=subprocess.Popen(cmd,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        p2=subprocess.Popen(cmd,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        p1.stdin.write(q);p1.stdin.close();p2.stdin.write(q);p2.stdin.close()
        x=p1.stdout.read(); ex=p1.stderr.read(); y=p2.stdout.read(); ey=p2.stderr.read()
        assert p1.wait()==0 and p2.wait()==0,(ex,ey)
        outputs=[json.loads(x.strip().splitlines()[-1]),json.loads(y.strip().splitlines()[-1])]
        assert sorted(o['replayed'] for o in outputs)==[False,True]
        assert outputs[0]['historic_outcome']==outputs[1]['historic_outcome']
        assert sql("select sync_revision from public.nmm_tasks where id='synthetic-1';").stdout.strip()=='4'
        # Invalid mutation rolls receipt back, so the same operation can be corrected.
        op6='10000000-0000-0000-0000-000000000006'; bad={**row,'created_at':'not-a-date','id':'synthetic-2'}
        assert sql(call(a,op6,bad,0),False).returncode != 0
        assert result(a,op6,{**row,'id':'synthetic-2'},0)['historic_outcome']['status']=='ok'
        assert sql(f"set role authenticated; select * from public.nmm_task_cas_receipt_lab;",False).returncode != 0
        assert sql(f"set role authenticated; select public.nmm_task_cas('{{}}'::jsonb,0);",False).returncode != 0
        assert sql("set role authenticated; select public.nmm_task_cas_once_lab('10000000-0000-0000-0000-000000000007','{}'::jsonb,0);",False).returncode != 0
        # Fail closed if a new user role inherits permission to the inner function.
        sql('grant execute on function public.nmm_task_cas(jsonb,bigint) to inherited;')
        assert sql("select has_function_privilege('authenticated','public.nmm_task_cas(jsonb,bigint)','EXECUTE');").stdout.strip()=='t'
        print('PASS: synthetic idempotence, changed-payload rejection, owner isolation, stale outcome, races, rollback, permissions and draft guards')
    finally:
        run([BIN/'pg_ctl','-D',data,'stop','-m','immediate','-w'])
