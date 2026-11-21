-- LAB ONLY: NOT FOR PRODUCTION. No client integration, no idempotency or migration.
BEGIN;
DO $$ BEGIN RAISE EXCEPTION 'DRAFT: migration disabled; disposable synthetic DB only'; END $$;
ALTER TABLE public.nmm_tags ADD COLUMN sync_revision bigint NOT NULL DEFAULT 1 CHECK(sync_revision > 0);
REVOKE INSERT, UPDATE, DELETE ON public.nmm_tags FROM PUBLIC, anon, authenticated;
DO $$ DECLARE r text; c record; BEGIN
  FOR c IN SELECT attname FROM pg_catalog.pg_attribute WHERE attrelid='public.nmm_tags'::regclass AND attnum>0 AND NOT attisdropped LOOP
    EXECUTE format('REVOKE INSERT (%I), UPDATE (%I) ON public.nmm_tags FROM PUBLIC, anon, authenticated',c.attname,c.attname);
    FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF has_column_privilege(r,'public.nmm_tags',c.attname,'INSERT,UPDATE') THEN RAISE EXCEPTION 'effective column write remains: % %',r,c.attname; END IF;
    END LOOP;
  END LOOP;
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF has_table_privilege(r,'public.nmm_tags','INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'effective table write remains: %',r; END IF;
  END LOOP;
END $$;
CREATE FUNCTION public.nmm_tag_cas_lab(p_row jsonb,p_expected bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,auth AS $$
DECLARE uid uuid := auth.uid(); oldrow public.nmm_tags%rowtype; candidate public.nmm_tags%rowtype;
  required text[] := ARRAY['id','name','color','created_at','updated_at','deleted_at','planner_version'];
BEGIN
  IF uid IS NULL OR p_row IS NULL OR jsonb_typeof(p_row)<>'object' OR p_expected IS NULL OR p_expected<0 THEN RAISE EXCEPTION 'invalid request' USING ERRCODE='22023'; END IF;
  IF NOT (p_row ?& required) OR (p_row - (required || ARRAY['owner_id'])) <> '{}'::jsonb OR nullif(p_row->>'id','') IS NULL THEN RAISE EXCEPTION 'invalid fields' USING ERRCODE='22023'; END IF;
  -- The caller-supplied owner is ignored. Unlike tasks/notes, tag id is per-owner.
  SELECT * INTO oldrow FROM public.nmm_tags WHERE owner_id=uid AND id=p_row->>'id' FOR UPDATE;
  IF FOUND THEN
    IF p_expected=0 OR oldrow.sync_revision<>p_expected THEN RETURN jsonb_build_object('status','conflict'); END IF;
    candidate:=jsonb_populate_record(oldrow,p_row-'owner_id'-'id'-'created_at');
    UPDATE public.nmm_tags SET name=candidate.name,color=candidate.color,updated_at=candidate.updated_at,deleted_at=candidate.deleted_at,planner_version=candidate.planner_version,sync_revision=oldrow.sync_revision+1
    WHERE owner_id=uid AND id=oldrow.id AND sync_revision=p_expected RETURNING * INTO oldrow;
    IF NOT FOUND THEN RETURN jsonb_build_object('status','conflict'); END IF;
  ELSE
    IF p_expected<>0 THEN RETURN jsonb_build_object('status','conflict'); END IF;
    candidate:=jsonb_populate_record(NULL::public.nmm_tags,p_row-'owner_id');
    INSERT INTO public.nmm_tags(owner_id,id,name,color,created_at,updated_at,deleted_at,planner_version,sync_revision)
      VALUES(uid,candidate.id,candidate.name,candidate.color,candidate.created_at,candidate.updated_at,candidate.deleted_at,candidate.planner_version,1)
      ON CONFLICT(owner_id,id) DO NOTHING RETURNING * INTO oldrow;
    IF NOT FOUND THEN RETURN jsonb_build_object('status','conflict'); END IF;
  END IF;
  RETURN jsonb_build_object('status','ok','revision',oldrow.sync_revision,'row',to_jsonb(oldrow));
END $$;
REVOKE ALL ON FUNCTION public.nmm_tag_cas_lab(jsonb,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.nmm_tag_cas_lab(jsonb,bigint) TO authenticated;
COMMIT;
