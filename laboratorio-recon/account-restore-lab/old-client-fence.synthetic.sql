-- SYNTHETIC THROWAWAY POSTGRES ONLY. NOT A SUPABASE MIGRATION.
-- Dedicated login roles model verified identity; this is NOT how Supabase authenticates.
\set ON_ERROR_STOP on
CREATE ROLE synthetic_a LOGIN;
CREATE ROLE synthetic_b LOGIN;
CREATE ROLE synthetic_legacy LOGIN;
CREATE SCHEMA lab;
CREATE TABLE lab.owners (login_name name PRIMARY KEY, owner_id text NOT NULL);
INSERT INTO lab.owners VALUES ('synthetic_a','A'),('synthetic_b','B'),('synthetic_legacy','A');
CREATE TABLE lab.documents (owner_id text NOT NULL, id text NOT NULL, value text NOT NULL, revision bigint NOT NULL CHECK(revision>0), PRIMARY KEY(owner_id,id));
INSERT INTO lab.documents VALUES ('A','same','A0',1),('B','same','B0',1);
ALTER TABLE lab.documents ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION lab.my_owner() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,lab AS $$
 SELECT owner_id FROM lab.owners WHERE login_name=session_user
$$;
REVOKE ALL ON FUNCTION lab.my_owner() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lab.my_owner() TO synthetic_a,synthetic_b,synthetic_legacy;
CREATE POLICY owner_read ON lab.documents FOR SELECT USING (owner_id=lab.my_owner());
GRANT USAGE ON SCHEMA lab TO synthetic_a,synthetic_b,synthetic_legacy;
GRANT SELECT ON lab.documents TO synthetic_a,synthetic_b,synthetic_legacy;
-- No direct writes for any untrusted role, including clients with owner A.
REVOKE ALL ON lab.documents FROM PUBLIC;
CREATE FUNCTION lab.write_document(p_id text,p_value text,p_expected bigint) RETURNS bigint
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,lab AS $$
DECLARE result bigint; who text;
BEGIN
 who:=lab.my_owner();
 IF who IS NULL OR p_expected IS NULL OR p_expected < 1 OR p_id IS NULL OR p_value IS NULL THEN RAISE EXCEPTION 'invalid input'; END IF;
 UPDATE lab.documents SET value=p_value,revision=revision+1 WHERE owner_id=who AND id=p_id AND revision=p_expected RETURNING revision INTO result;
 IF result IS NULL THEN RAISE EXCEPTION 'conflict or missing'; END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION lab.write_document(text,text,bigint) FROM PUBLIC;
-- Legacy role has no access to the endpoint; version parameter alone is not authorization.
GRANT EXECUTE ON FUNCTION lab.write_document(text,text,bigint) TO synthetic_a,synthetic_b;
SET SESSION AUTHORIZATION synthetic_legacy;
DO $$ BEGIN
 BEGIN UPDATE lab.documents SET value='bad' WHERE owner_id='A'; RAISE EXCEPTION 'legacy update succeeded'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN INSERT INTO lab.documents VALUES('A','x','bad',1); RAISE EXCEPTION 'legacy insert succeeded'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN DELETE FROM lab.documents WHERE owner_id='A'; RAISE EXCEPTION 'legacy delete succeeded'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM lab.write_document('same','bad',1); RAISE EXCEPTION 'legacy RPC succeeded'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF (SELECT count(*) FROM lab.documents)<>1 THEN RAISE EXCEPTION 'legacy RLS failed'; END IF;
END $$;
RESET SESSION AUTHORIZATION;
SET SESSION AUTHORIZATION synthetic_a;
DO $$ BEGIN
 IF (SELECT count(*) FROM lab.documents)<>1 OR (SELECT value FROM lab.documents WHERE id='same')<>'A0' THEN RAISE EXCEPTION 'A RLS failed'; END IF;
 IF lab.write_document('same','A1',1)<>2 THEN RAISE EXCEPTION 'valid write failed'; END IF;
 BEGIN PERFORM lab.write_document('same','stale',1); RAISE EXCEPTION 'stale write succeeded'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'conflict or missing' THEN RAISE; END IF; END;
 BEGIN UPDATE lab.documents SET value='bypass' WHERE owner_id='A'; RAISE EXCEPTION 'direct update succeeded'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET SESSION AUTHORIZATION;
SET SESSION AUTHORIZATION synthetic_b;
DO $$ BEGIN
 IF (SELECT count(*) FROM lab.documents)<>1 OR (SELECT value FROM lab.documents WHERE id='same')<>'B0' THEN RAISE EXCEPTION 'B RLS failed'; END IF;
 IF lab.write_document('same','B1',1)<>2 THEN RAISE EXCEPTION 'B write failed'; END IF;
END $$;
RESET SESSION AUTHORIZATION;
DO $$ BEGIN
 IF (SELECT value FROM lab.documents WHERE owner_id='A' AND id='same')<>'A1' OR (SELECT value FROM lab.documents WHERE owner_id='B' AND id='same')<>'B1' THEN RAISE EXCEPTION 'cross-account corruption'; END IF;
END $$;
SELECT 'PASS synthetic fence and isolation tests' AS result;
