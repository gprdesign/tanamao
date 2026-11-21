-- LABORATÓRIO: DESATIVADO. Não aplicar em dados reais.
-- A transação é all-or-nothing. Testes removem APENAS a linha do hard stop.
BEGIN;
DO $$ BEGIN RAISE EXCEPTION 'LAB ONLY: migration disabled'; END $$;

-- Lock protege o inventário e o corte de escritor. Sem lock distribuído de clientes,
-- isso NÃO é um plano de implantação. Não revogar privilégios do service_role.
DO $migration$
DECLARE names text[] := ARRAY['nmm_tasks','nmm_tags','nmm_task_comments','nmm_task_links','nmm_notes','nmm_logs','nmm_finance_entries','nmm_finance_state','nmm_user_settings','nmm_private_vaults','nmm_private_notes'];
 t text; c record; f record; p record; r text;
BEGIN
 IF EXISTS (SELECT 1 FROM pg_class x JOIN pg_namespace n ON n.oid=x.relnamespace WHERE n.nspname='public' AND x.relkind IN ('r','p','v','m','f') AND x.relname LIKE 'nmm\_%' ESCAPE '\' AND NOT x.relname=ANY(names)) THEN
   RAISE EXCEPTION 'unknown nmm relation: inventory and reconcile first';
 END IF;
 FOREACH t IN ARRAY names LOOP
   IF to_regclass(format('public.%I',t)) IS NULL THEN RAISE EXCEPTION 'missing table %',t; END IF;
   EXECUTE format('LOCK TABLE public.%I IN ACCESS EXCLUSIVE MODE',t);
   IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid=to_regclass(format('public.%I',t)) AND relkind='r') THEN RAISE EXCEPTION 'unsupported table %',t; END IF;
   IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass(format('public.%I',t)) AND NOT tgisinternal) THEN RAISE EXCEPTION 'review triggers first: %',t; END IF;
   IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass(format('public.%I',t)) AND attname='sync_revision' AND NOT attisdropped) THEN RAISE EXCEPTION 'revision already exists on %',t; END IF;
   EXECUTE format('ALTER TABLE public.%I ADD COLUMN sync_revision bigint NOT NULL DEFAULT 1 CHECK (sync_revision > 0)',t);
   EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
   FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
     EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,t);
   END LOOP;
   EXECUTE format('CREATE POLICY nmm_cas_owner_read ON public.%I FOR SELECT TO authenticated USING (owner_id = (SELECT auth.uid()))',t);
   EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated',t);
   FOR c IN SELECT attname FROM pg_attribute WHERE attrelid=to_regclass(format('public.%I',t)) AND attnum>0 AND NOT attisdropped LOOP
     EXECUTE format('REVOKE SELECT (%I), INSERT (%I), UPDATE (%I), REFERENCES (%I) ON public.%I FROM PUBLIC, anon, authenticated',c.attname,c.attname,c.attname,c.attname,t);
     FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
       IF has_column_privilege(r,format('public.%I',t),c.attname,'INSERT,UPDATE,REFERENCES') OR (r='anon' AND has_column_privilege(r,format('public.%I',t),c.attname,'SELECT')) THEN
         RAISE EXCEPTION 'effective column privilege remains: % %.%',r,t,c.attname;
       END IF;
     END LOOP;
   END LOOP;
   FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
     IF has_table_privilege(r,format('public.%I',t),'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR (r='anon' AND has_table_privilege(r,format('public.%I',t),'SELECT')) THEN
       RAISE EXCEPTION 'effective table privilege remains: % %',r,t;
     END IF;
   END LOOP;
   EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
 END LOOP;
 -- A legacy SECURITY DEFINER can bypass table revokes. Revoke all public routines
 -- (including invoker wrappers); fail if access remains through role membership.
 FOR f IN SELECT p.oid, p.oid::regprocedure AS sig, p.prokind FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind IN ('f','p') LOOP
   EXECUTE format('REVOKE ALL ON %s %s FROM PUBLIC, anon, authenticated',CASE WHEN f.prokind='p' THEN 'PROCEDURE' ELSE 'FUNCTION' END,f.sig);
   FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
     IF has_function_privilege(r,f.oid,'EXECUTE') THEN RAISE EXCEPTION 'effective legacy routine execute remains: % %',r,f.sig; END IF;
   END LOOP;
 END LOOP;
 -- Unknown SECURITY DEFINERs outside public remain a hard stop, except built-in
 -- pg_catalog and auth.uid() (which CAS itself calls). Audit auth.uid separately.
 FOR f IN SELECT p.oid,p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE p.prosecdef AND n.nspname NOT IN ('pg_catalog','information_schema','public')
   AND p.oid <> 'auth.uid()'::regprocedure LOOP
   FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
     IF has_function_privilege(r,f.oid,'EXECUTE') THEN RAISE EXCEPTION 'unknown definer executable: % %',r,f.sig; END IF;
   END LOOP;
 END LOOP;
 -- All other public relations with effective client write are unreviewed paths,
 -- including views whose rules/triggers may reach protected tables.
 FOR c IN SELECT x.oid,x.oid::regclass AS rel FROM pg_class x JOIN pg_namespace n ON n.oid=x.relnamespace WHERE n.nspname='public' AND x.relkind IN ('r','p','v','m','f') AND NOT x.relname=ANY(names) LOOP
   FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
     IF has_table_privilege(r,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER') THEN RAISE EXCEPTION 'unreviewed writable relation: % %',r,c.rel; END IF;
     FOR p IN SELECT attname FROM pg_attribute WHERE attrelid=c.oid AND attnum>0 AND NOT attisdropped LOOP
       IF has_column_privilege(r,c.oid,p.attname,'INSERT,UPDATE') THEN RAISE EXCEPTION 'unreviewed writable column: % %.%',r,c.rel,p.attname; END IF;
     END LOOP;
   END LOOP;
 END LOOP;
END $migration$;

-- One-row compare-and-swap, not a multi-entity financial transaction. Entire
-- field list derives from the actual locked table; unknown keys and keys of
-- protected columns are rejected. Owner is always derived from auth.uid().
CREATE FUNCTION public.nmm_cas_lab(p_table text,p_id text,p_expected bigint,p_values jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,auth AS $cas$
DECLARE uid uuid := auth.uid(); singleton boolean; cols text; vals text; sets text; k text; rel regclass; result jsonb; oldrev bigint; oldrow jsonb; parent_id text;
BEGIN
 IF uid IS NULL OR p_expected IS NULL OR p_expected<0 OR p_values IS NULL OR jsonb_typeof(p_values)<>'object' THEN RAISE EXCEPTION 'invalid request' USING ERRCODE='22023'; END IF;
 IF p_table IS NULL OR NOT p_table=ANY(ARRAY['nmm_tasks','nmm_tags','nmm_task_comments','nmm_task_links','nmm_notes','nmm_logs','nmm_finance_entries','nmm_finance_state','nmm_user_settings','nmm_private_vaults','nmm_private_notes']) THEN RAISE EXCEPTION 'invalid entity' USING ERRCODE='22023'; END IF;
 singleton := p_table=ANY(ARRAY['nmm_finance_state','nmm_user_settings','nmm_private_vaults']);
 IF (singleton AND p_id IS NOT NULL) OR (NOT singleton AND (p_id IS NULL OR length(p_id)=0 OR length(p_id)>512)) THEN RAISE EXCEPTION 'invalid key' USING ERRCODE='22023'; END IF;
 rel:=format('public.%I',p_table)::regclass;
 FOR k IN SELECT jsonb_object_keys(p_values) LOOP
   IF k IN ('id','owner_id','sync_revision') OR NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid=rel AND attname=k AND attnum>0 AND NOT attisdropped AND attgenerated='' AND attidentity='') THEN RAISE EXCEPTION 'invalid field %',k USING ERRCODE='22023'; END IF;
   IF p_expected>0 AND k='created_at' THEN RAISE EXCEPTION 'immutable creation time' USING ERRCODE='22023'; END IF;
 END LOOP;
 IF NOT singleton THEN
   EXECUTE format('SELECT sync_revision,to_jsonb(x) FROM %s x WHERE owner_id=$1 AND id=$2 FOR UPDATE',rel) INTO oldrev,oldrow USING uid,p_id;
 ELSE
   EXECUTE format('SELECT sync_revision,to_jsonb(x) FROM %s x WHERE owner_id=$1 FOR UPDATE',rel) INTO oldrev,oldrow USING uid;
 END IF;
 IF (oldrev IS NULL AND p_expected<>0) OR (oldrev IS NOT NULL AND oldrev<>p_expected) THEN RETURN jsonb_build_object('status','conflict'); END IF;
 -- Same-owner parent is required for task children, independently of legacy RLS.
 IF p_table IN ('nmm_task_comments','nmm_task_links') THEN
   parent_id := COALESCE(p_values->>'task_id',oldrow->>'task_id');
   IF parent_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.nmm_tasks WHERE owner_id=uid AND id=parent_id) THEN RAISE EXCEPTION 'invalid parent' USING ERRCODE='23503'; END IF;
 END IF;
 SELECT string_agg(format('%I',key),',' ORDER BY key), string_agg(format('(v).%I',key),',' ORDER BY key), string_agg(format('%1$I=(v).%1$I',key),',' ORDER BY key)
 INTO cols,vals,sets FROM jsonb_object_keys(p_values) AS j(key);
 IF oldrev IS NULL THEN
   IF singleton THEN
     EXECUTE format('INSERT INTO %s(owner_id%s) SELECT $1%s FROM jsonb_populate_record(NULL::%s,$2) v ON CONFLICT DO NOTHING RETURNING to_jsonb(%I.*)',rel,CASE WHEN cols IS NULL THEN '' ELSE ','||cols END,CASE WHEN vals IS NULL THEN '' ELSE ','||vals END,rel,p_table) INTO result USING uid,p_values;
   ELSE
     EXECUTE format('INSERT INTO %s(owner_id,id%s) SELECT $1,$2%s FROM jsonb_populate_record(NULL::%s,$3) v ON CONFLICT DO NOTHING RETURNING to_jsonb(%I.*)',rel,CASE WHEN cols IS NULL THEN '' ELSE ','||cols END,CASE WHEN vals IS NULL THEN '' ELSE ','||vals END,rel,p_table) INTO result USING uid,p_id,p_values;
   END IF;
 ELSE
   IF singleton THEN
     EXECUTE format('UPDATE %s x SET %s sync_revision=x.sync_revision+1 FROM jsonb_populate_record(NULL::%s,$3) v WHERE x.owner_id=$1 AND x.sync_revision=$2 RETURNING to_jsonb(x.*)',rel,CASE WHEN sets IS NULL THEN '' ELSE sets||',' END,rel) INTO result USING uid,p_expected,p_values;
   ELSE
     EXECUTE format('UPDATE %s x SET %s sync_revision=x.sync_revision+1 FROM jsonb_populate_record(NULL::%s,$4) v WHERE x.owner_id=$1 AND x.id=$2 AND x.sync_revision=$3 RETURNING to_jsonb(x.*)',rel,CASE WHEN sets IS NULL THEN '' ELSE sets||',' END,rel) INTO result USING uid,p_id,p_expected,p_values;
   END IF;
 END IF;
 IF result IS NULL THEN RETURN jsonb_build_object('status','conflict'); END IF;
 RETURN jsonb_build_object('status','ok','revision',(result->>'sync_revision')::bigint,'row',result);
END $cas$;
REVOKE ALL ON FUNCTION public.nmm_cas_lab(text,text,bigint,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.nmm_cas_lab(text,text,bigint,jsonb) TO authenticated;
COMMIT;
