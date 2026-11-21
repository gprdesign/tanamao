#!/usr/bin/env python3
"""Fresh disposable localhost-only socket PostgreSQL; never connects to existing DB."""
import getpass, json, os, pathlib, subprocess, tempfile
HERE=pathlib.Path(__file__).resolve().parent
ROOT=HERE.parents[1]
BIN=pathlib.Path('/usr/lib/postgresql/17/bin')
env={k:v for k,v in os.environ.items() if not k.startswith('PG')}
def run(args, **kw): return subprocess.run([str(a) for a in args], env=env, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True, **kw)
with tempfile.TemporaryDirectory(prefix='tnm-tag-synthetic-') as tmp:
    d=pathlib.Path(tmp); sock=d/'sock';sock.mkdir(); data=d/'data'
    run([BIN/'initdb','-D',data,'-A','trust','--no-locale'])
    run([BIN/'pg_ctl','-D',data,'-l',d/'log','-o',f"-c listen_addresses='' -c unix_socket_directories={sock} -c port=57487",'-w','start'])
    try:
        cmd=[str(BIN/'psql'),'-X','-v','ON_ERROR_STOP=1','-A','-t','-h',str(sock),'-p','57487','-U',getpass.getuser(),'-d','postgres']
        def sql(s,check=True):return subprocess.run(cmd,input=s,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=env,check=check)
        a='00000000-0000-0000-0000-000000000001'; b='00000000-0000-0000-0000-000000000002'
        schema=(ROOT/'supabase/schema.sql').read_text()
        sql(f"create role anon; create role authenticated; create role inherited; create schema auth; create table auth.users(id uuid primary key); insert into auth.users values ('{a}'),('{b}'); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth to authenticated,anon;"+schema)
        draft=(HERE/'tag-cas-DRAFT.sql').read_text(); stop="DO $$ BEGIN RAISE EXCEPTION 'DRAFT: migration disabled; disposable synthetic DB only'; END $$;"
        assert draft.count(stop)==1 and sql(draft,False).returncode!=0
        enabled=draft.replace(stop,'-- removed only within disposable test cluster')
        sql('grant inherited to authenticated; grant update (name) on public.nmm_tags to inherited;')
        rejected=sql(enabled,False);assert rejected.returncode!=0 and 'effective column write remains' in rejected.stderr
        assert sql("select count(*) from pg_attribute where attrelid='public.nmm_tags'::regclass and attname='sync_revision'").stdout.strip()=='0'
        sql('revoke update (name) on public.nmm_tags from inherited;');sql(enabled)
        row={'id':'same','owner_id':b,'name':'A','color':'#123456','created_at':'2026-01-01T00:00:00Z','updated_at':'2026-01-01T00:00:00Z','deleted_at':None,'planner_version':1}
        def call(uid,r,rev):
            payload=json.dumps(r,separators=(',',':')).replace("'","''")
            return f"set role authenticated; set request.jwt.claim.sub='{uid}'; select public.nmm_tag_cas_lab('{payload}'::jsonb,{rev});"
        def result(uid,r,rev):return json.loads(sql(call(uid,r,rev)).stdout.strip().splitlines()[-1])
        first=result(a,row,0);assert first['status']=='ok' and first['row']['owner_id']==a and first['revision']==1
        other=result(b,{**row,'name':'B'},0);assert other['status']=='ok' and other['row']['owner_id']==b
        for uid,expected in [(a,'A'),(b,'B')]:
            out=sql(f"set role authenticated;set request.jwt.claim.sub='{uid}';select name from public.nmm_tags order by name;").stdout.strip().splitlines()
            assert out[-1:]==[expected] and len(out)==3,out
        assert sql("set role anon;select * from public.nmm_tags",False).returncode!=0
        assert sql(f"set role authenticated;set request.jwt.claim.sub='{a}';update public.nmm_tags set name='bypass'",False).returncode!=0
        assert sql(f"set role authenticated;set request.jwt.claim.sub='{a}';delete from public.nmm_tags",False).returncode!=0
        assert sql(f"set role authenticated;set request.jwt.claim.sub='{a}';insert into public.nmm_tags(owner_id,id,name,color,planner_version) values ('{a}','legacy','old','#123456',1)",False).returncode!=0
        # Negative control: if an old SECURITY DEFINER remains executable, the
        # table REVOKEs do not fence it. Roll back its synthetic corruption.
        bypass=sql(f"""BEGIN; CREATE FUNCTION public.old_writer_lab() RETURNS void LANGUAGE sql SECURITY DEFINER AS $$UPDATE public.nmm_tags SET name='unsafe' WHERE owner_id='{a}' AND id='same'$$; GRANT EXECUTE ON FUNCTION public.old_writer_lab() TO authenticated; SET ROLE authenticated; SET request.jwt.claim.sub='{a}'; SELECT public.old_writer_lab(); RESET ROLE; SELECT name FROM public.nmm_tags WHERE owner_id='{a}' AND id='same'; ROLLBACK;""").stdout
        assert 'unsafe' in bypass, bypass
        assert sql(f"select name from public.nmm_tags where owner_id='{a}' and id='same'").stdout.strip()=='A'
        assert result(a,row,0)=={'status':'conflict'} and result(a,row,99)=={'status':'conflict'}
        changed=result(a,{**row,'name':'A2','created_at':'2020-01-01T00:00:00Z'},1)
        assert changed['revision']==2 and changed['row']['created_at'].startswith('2026-01-01')
        assert result(a,row,1)=={'status':'conflict'}
        for bad in ({**row,'extraneous':1},{k:v for k,v in row.items() if k!='deleted_at'},{**row,'color':'bad'}): assert sql(call(a,bad,2),False).returncode!=0
        # Two independent sessions racing the same revision: exactly one succeeds.
        procs=[]
        for name in ('race1','race2'):
            p=subprocess.Popen(cmd,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,env=env)
            procs.append((p,call(a,{**row,'name':name},2)))
        for p,s in procs: p.stdin.write(s);p.stdin.close()
        outputs=[]
        for p,_ in procs:
            out=p.stdout.read();err=p.stderr.read();assert p.wait()==0,err
            outputs.append(json.loads(out.strip().splitlines()[-1]))
        assert sorted(o['status'] for o in outputs)==['conflict','ok']
        assert sql(f"select sync_revision from public.nmm_tags where owner_id='{a}' and id='same'").stdout.strip()=='3'
        assert sql(f"select name from public.nmm_tags where owner_id='{b}' and id='same'").stdout.strip()=='B'
        assert sql("set role authenticated;select public.nmm_tag_cas_lab('{}'::jsonb,0)",False).returncode!=0
        print('PASS: hard stop; inherited-column revoke rollback; schema RLS A/B; spoofed owner; old REST denial; per-owner IDs; validation; immutable creation; stale and concurrent CAS')
    finally: run([BIN/'pg_ctl','-D',data,'-m','immediate','-w','stop'])
