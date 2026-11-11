-- =============================================================================
-- 0028 Company branding: each business's own logo
--
--   * company_settings.logo_path: the business's logo, a file in the public
--     "branding" bucket inside that business's own folder (checked).
--   * bucket "branding": public read (a logo is printed on every invoice and
--     shown on the business's sign-in page), PNG or JPG, at most 2 MB.
--     Only a Super Admin of the business may add or remove files, and only in
--     that business's folder.
--   * tenant_public_profile(slug) also returns the logo, for the branded
--     sign-in page (/login/<slug>).
-- Rollback: supabase/rollback/20261110000028_to_0027_down.sql
-- =============================================================================

-- 1. The setting
alter table public.company_settings add column logo_path text;
alter table public.company_settings add constraint company_settings_logo_path_own_folder
  check (logo_path is null
         or (logo_path ~ '^[0-9a-f-]{36}/logo-[0-9]+\.(png|jpg)$'
             and split_part(logo_path, '/', 1) = tenant_id::text));

-- 2. The bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('branding', 'branding', true, 2097152, array['image/png', 'image/jpeg'])
on conflict (id) do nothing;

create policy "branding read own business" on storage.objects for select to authenticated
  using (bucket_id = 'branding'
         and public.storage_object_tenant(name) = (select public.current_tenant_id())
         and (select public.is_active_user()));
create policy "branding write super admin" on storage.objects for insert to authenticated
  with check (bucket_id = 'branding'
              and public.storage_object_tenant(name) = (select public.current_tenant_id())
              and (select public.has_role('super_admin')));
create policy "branding delete super admin" on storage.objects for delete to authenticated
  using (bucket_id = 'branding'
         and public.storage_object_tenant(name) = (select public.current_tenant_id())
         and (select public.has_role('super_admin')));

-- 3. The branded sign-in page gets the logo too
drop function public.tenant_public_profile(text);
create function public.tenant_public_profile(p_slug text)
returns table (slug text, display_name text, logo_path text)
language sql stable security definer set search_path = public as $$
  select t.slug, t.display_name, cs.logo_path
    from public.tenants t
    left join public.company_settings cs on cs.tenant_id = t.id
   where t.slug = lower(trim(p_slug)) and t.status in ('trial', 'active')
$$;
revoke all on function public.tenant_public_profile(text) from public;
grant execute on function public.tenant_public_profile(text) to anon, authenticated;

-- 4. Check
do $$
begin
  if not exists (select 1 from storage.buckets where id = 'branding' and public) then
    raise exception 'M-T28 check failed: branding bucket missing or not public';
  end if;
  if (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'branding %') <> 3 then
    raise exception 'M-T28 check failed: branding policies';
  end if;
  if not has_function_privilege('anon', 'public.tenant_public_profile(text)', 'execute') then
    raise exception 'M-T28 check failed: sign-in page cannot read the business profile';
  end if;
  if pg_get_userbyid((select proowner from pg_proc where oid = 'public.tenant_public_profile(text)'::regprocedure))
     <> pg_get_userbyid((select proowner from pg_proc where oid = 'public.current_tenant_id()'::regprocedure)) then
    raise exception 'M-T28 check failed: tenant_public_profile must keep the platform owner';
  end if;
end $$;
