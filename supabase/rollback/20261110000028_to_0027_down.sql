-- =============================================================================
-- ROLLBACK of 0028 (company branding) back to 0027. Run as ONE transaction.
-- Refuses while a business has a logo set or logo files exist: remove the
-- logos in Company settings first, so no file is orphaned or lost silently.
-- =============================================================================
do $$
begin
  if exists (select 1 from public.company_settings where logo_path is not null) then
    raise exception 'A business still has a logo set: remove it in Company settings first';
  end if;
  if exists (select 1 from storage.objects where bucket_id = 'branding') then
    raise exception 'Logo files still exist in the branding bucket: remove them first';
  end if;
end $$;

drop function public.tenant_public_profile(text);
create function public.tenant_public_profile(p_slug text)
returns table (slug text, display_name text)
language sql stable security definer set search_path = public as $$
  select t.slug, t.display_name from public.tenants t
   where t.slug = lower(trim(p_slug)) and t.status in ('trial', 'active')
$$;
revoke all on function public.tenant_public_profile(text) from public;
grant execute on function public.tenant_public_profile(text) to anon, authenticated;

-- Supabase refuses SQL deletes from its storage tables unless asked for this
-- transaction only; the checks above ensure the bucket is empty.
select set_config('storage.allow_delete_query', 'true', true);
drop policy "branding read own business" on storage.objects;
drop policy "branding write super admin" on storage.objects;
drop policy "branding delete super admin" on storage.objects;
delete from storage.buckets where id = 'branding';
select set_config('storage.allow_delete_query', 'false', true);

alter table public.company_settings drop constraint company_settings_logo_path_own_folder;
alter table public.company_settings drop column logo_path;
