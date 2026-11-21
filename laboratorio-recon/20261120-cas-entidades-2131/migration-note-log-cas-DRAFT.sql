-- LABORATORY ONLY. NOT an integrated migration. Do not execute on real data.
-- Rejects old direct clients. Audit grants, triggers, schema and all writers first.
begin;
do $$ begin raise exception 'DRAFT: migration disabled; use disposable test DB only'; end $$;
alter table public.nmm_notes add column sync_revision bigint not null default 1;
alter table public.nmm_logs add column sync_revision bigint not null default 1;
revoke insert,update,delete on public.nmm_notes,public.nmm_logs from public,anon,authenticated;
do $$ declare t text; r text; c record; begin
  foreach t in array array['nmm_notes','nmm_logs'] loop
    for c in select attname from pg_catalog.pg_attribute where attrelid=format('public.%I',t)::regclass and attnum>0 and not attisdropped loop
      execute format('revoke insert (%I), update (%I) on public.%I from public, anon, authenticated',c.attname,c.attname,t);
      foreach r in array array['anon','authenticated'] loop
        if has_column_privilege(r,format('public.%I',t),c.attname,'INSERT,UPDATE') then
          raise exception 'effective write column privilege remains: % %',r,t;
        end if;
      end loop;
    end loop;
    foreach r in array array['anon','authenticated'] loop
      if has_table_privilege(r,format('public.%I',t),'INSERT,UPDATE,DELETE') then raise exception 'effective write table privilege remains: % %',r,t; end if;
    end loop;
  end loop;
end $$;
create function public.nmm_note_log_cas_lab(p_kind text,p_row jsonb,p_expected bigint)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare uid uuid:=auth.uid(); n public.nmm_notes%rowtype; l public.nmm_logs%rowtype; cn public.nmm_notes%rowtype; cl public.nmm_logs%rowtype; required text[]; permitted text[];
begin
  if uid is null or p_kind is null or p_kind not in ('note','log') or p_row is null or jsonb_typeof(p_row)<>'object' or p_expected is null or p_expected<0 then raise exception 'invalid request' using errcode='22023'; end if;
  if p_kind='note' then
    required:=array['id','title','content','link_url','links','is_pinned','tag_ids','sort_order','planner_version','created_at','updated_at','deleted_at'];
  else
    required:=array['id','content','tag_id','is_locked','planner_version','created_at','updated_at','deleted_at'];
  end if;
  permitted:=required||array['owner_id'];
  if not (p_row ?& required) or (p_row - permitted)<>'{}'::jsonb or nullif(p_row->>'id','') is null then raise exception 'invalid fields' using errcode='22023'; end if;
  if p_kind='note' then
    select * into n from public.nmm_notes where id=p_row->>'id' for update;
    if found then
      if n.owner_id<>uid or p_expected=0 or n.sync_revision<>p_expected then return jsonb_build_object('status','conflict'); end if;
      cn:=jsonb_populate_record(n,p_row-'owner_id'-'id'-'created_at');
      update public.nmm_notes set title=cn.title,content=cn.content,link_url=cn.link_url,links=cn.links,is_pinned=cn.is_pinned,tag_ids=cn.tag_ids,sort_order=cn.sort_order,planner_version=cn.planner_version,updated_at=cn.updated_at,deleted_at=cn.deleted_at,sync_revision=n.sync_revision+1 where id=n.id and owner_id=uid and sync_revision=p_expected returning * into n;
      if not found then return jsonb_build_object('status','conflict'); end if;
    else
      if p_expected<>0 then return jsonb_build_object('status','conflict'); end if;
      cn:=jsonb_populate_record(null::public.nmm_notes,p_row-'owner_id');
      insert into public.nmm_notes(id,owner_id,title,content,link_url,links,is_pinned,tag_ids,sort_order,planner_version,created_at,updated_at,deleted_at,sync_revision) values(cn.id,uid,cn.title,cn.content,cn.link_url,cn.links,cn.is_pinned,cn.tag_ids,cn.sort_order,cn.planner_version,cn.created_at,cn.updated_at,cn.deleted_at,1) on conflict(id) do nothing returning * into n;
      if not found then return jsonb_build_object('status','conflict'); end if;
    end if;
    return jsonb_build_object('status','ok','revision',n.sync_revision,'row',to_jsonb(n));
  else
    select * into l from public.nmm_logs where id=p_row->>'id' for update;
    if found then
      if l.owner_id<>uid or p_expected=0 or l.sync_revision<>p_expected then return jsonb_build_object('status','conflict'); end if;
      cl:=jsonb_populate_record(l,p_row-'owner_id'-'id'-'created_at');
      update public.nmm_logs set content=cl.content,tag_id=cl.tag_id,is_locked=cl.is_locked,planner_version=cl.planner_version,updated_at=cl.updated_at,deleted_at=cl.deleted_at,sync_revision=l.sync_revision+1 where id=l.id and owner_id=uid and sync_revision=p_expected returning * into l;
      if not found then return jsonb_build_object('status','conflict'); end if;
    else
      if p_expected<>0 then return jsonb_build_object('status','conflict'); end if;
      cl:=jsonb_populate_record(null::public.nmm_logs,p_row-'owner_id');
      insert into public.nmm_logs(id,owner_id,content,tag_id,is_locked,planner_version,created_at,updated_at,deleted_at,sync_revision) values(cl.id,uid,cl.content,cl.tag_id,cl.is_locked,cl.planner_version,cl.created_at,cl.updated_at,cl.deleted_at,1) on conflict(id) do nothing returning * into l;
      if not found then return jsonb_build_object('status','conflict'); end if;
    end if;
    return jsonb_build_object('status','ok','revision',l.sync_revision,'row',to_jsonb(l));
  end if;
end $$;
revoke all on function public.nmm_note_log_cas_lab(text,jsonb,bigint) from public,anon;
grant execute on function public.nmm_note_log_cas_lab(text,jsonb,bigint) to authenticated;
commit;
