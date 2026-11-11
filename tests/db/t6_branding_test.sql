-- =============================================================================
-- 0028 tests: each business's logo.
-- Runs after t1-t5 (Apex fixtures; ISO DISTRIBUTORS with its owner c1…01).
--   * a Super Admin can add a logo file only in their own business's folder
--   * other roles cannot add or remove logo files
--   * a business's logo setting must point into its own folder
--   * the branded sign-in page (anonymous) gets name and logo, nothing else
-- =============================================================================
\set ON_ERROR_STOP 1

-- ---------- Apex Super Admin ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
select set_config('request.headers', '{}', false);
select set_config('request.jwt.claims', '{"role":"authenticated"}', false);
set role authenticated;
do $$
begin
  insert into storage.objects (bucket_id, name) values ('branding', 'a9e70000-0000-4000-8000-000000000001/logo-1.png');
  begin
    insert into storage.objects (bucket_id, name) values ('branding', 'c0000000-0000-4000-8000-00000000000c/logo-1.png');
    raise exception 'Apex admin wrote into the ISO folder';
  exception when insufficient_privilege then null;
  end;
  update public.company_settings set logo_path = 'a9e70000-0000-4000-8000-000000000001/logo-1.png';
  begin
    update public.company_settings set logo_path = 'c0000000-0000-4000-8000-00000000000c/logo-1.png';
    raise exception 'Apex logo pointed at the ISO folder';
  exception when check_violation then null;
  end;
  begin
    update public.company_settings set logo_path = 'a9e70000-0000-4000-8000-000000000001/../x.svg';
    raise exception 'logo path not checked';
  exception when check_violation then null;
  end;
  assert (select count(*) from public.company_settings) = 1, 'Apex admin sees only Apex settings';
end $$;
reset role;

-- ---------- Apex billing staff: may not change the logo ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$
declare n int;
begin
  begin
    insert into storage.objects (bucket_id, name) values ('branding', 'a9e70000-0000-4000-8000-000000000001/logo-2.png');
    raise exception 'billing staff added a logo file';
  exception when insufficient_privilege then null;
  end;
  delete from storage.objects where bucket_id = 'branding';
  get diagnostics n = row_count;
  assert n = 0, 'billing staff removed a logo file';
end $$;
reset role;

-- ---------- ISO owner: cannot see or remove Apex's file ----------
select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000001', false);
set role authenticated;
do $$
declare n int;
begin
  assert not exists (select 1 from storage.objects where bucket_id = 'branding'), 'ISO owner listed Apex logo files';
  delete from storage.objects where bucket_id = 'branding';
  get diagnostics n = row_count;
  assert n = 0, 'ISO owner removed an Apex logo file';
  insert into storage.objects (bucket_id, name) values ('branding', 'c0000000-0000-4000-8000-00000000000c/logo-7.png');
  update public.company_settings set logo_path = 'c0000000-0000-4000-8000-00000000000c/logo-7.png';
  assert (select logo_path from public.company_settings) = 'c0000000-0000-4000-8000-00000000000c/logo-7.png', 'ISO logo set';
end $$;
reset role;

-- ---------- anonymous: the branded sign-in page ----------
select set_config('request.jwt.claim.sub', '', false);
select set_config('request.jwt.claims', '{"role":"anon"}', false);
set role anon;
do $$
declare r record;
begin
  select * into r from public.tenant_public_profile('apex');
  assert r.display_name = 'APEX TRADING CO.' and r.logo_path = 'a9e70000-0000-4000-8000-000000000001/logo-1.png', 'Apex sign-in page shows its logo';
  select * into r from public.tenant_public_profile('ISO-DIST');
  assert r.logo_path = 'c0000000-0000-4000-8000-00000000000c/logo-7.png', 'ISO sign-in page shows its own logo';
  assert not exists (select 1 from public.tenant_public_profile('nobody')), 'unknown business: nothing';
  begin
    insert into storage.objects (bucket_id, name) values ('branding', 'a9e70000-0000-4000-8000-000000000001/logo-9.png');
    raise exception 'anonymous visitor added a logo file';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ---------- clean up (so the rollback test starts with no logos) ----------
update public.company_settings set logo_path = null;
delete from storage.objects where bucket_id = 'branding';
select 'ALL BRANDING TESTS PASSED';
