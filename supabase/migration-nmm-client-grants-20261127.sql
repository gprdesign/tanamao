-- Remove broad client grants from Tá na Mão tables while preserving authenticated CRUD under existing RLS policies.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname = 'public' AND left(tablename, 4) = 'nmm_'
    ORDER BY tablename
  LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM PUBLIC, anon, authenticated', r.schemaname, r.tablename);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I.%I TO authenticated', r.schemaname, r.tablename);
  END LOOP;
END $$;

-- Keep future tables created by the current owner from inheriting broad grants.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

-- Fail atomically if any current TNM table lost RLS or retained the dangerous privilege.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.oid, c.relname, c.relrowsecurity
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND left(c.relname, 4) = 'nmm_' AND c.relkind IN ('r','p')
  LOOP
    IF NOT r.relrowsecurity THEN RAISE EXCEPTION 'RLS disabled on %', r.relname; END IF;
    IF has_table_privilege('anon', r.oid, 'TRUNCATE') THEN RAISE EXCEPTION 'anon still has TRUNCATE on %', r.relname; END IF;
    IF has_table_privilege('authenticated', r.oid, 'TRUNCATE') THEN RAISE EXCEPTION 'authenticated still has TRUNCATE on %', r.relname; END IF;
    IF NOT (has_table_privilege('authenticated', r.oid, 'SELECT') AND has_table_privilege('authenticated', r.oid, 'INSERT') AND has_table_privilege('authenticated', r.oid, 'UPDATE') AND has_table_privilege('authenticated', r.oid, 'DELETE')) THEN RAISE EXCEPTION 'authenticated CRUD grant missing on %', r.relname; END IF;
  END LOOP;
END $$;
