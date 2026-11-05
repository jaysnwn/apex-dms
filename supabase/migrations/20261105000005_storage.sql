-- =============================================================================
-- APEX DMS — Storage buckets (M0)
--   product-images   : catalogue photos, readable by any signed-in active user
--   expense-receipts : receipt photos; folder = uploader's user id
--   delivery-proofs  : delivery photos / signatures
--   documents        : generated PDFs (invoices, receipts, statements)
-- =============================================================================

insert into storage.buckets (id, name, public)
values
  ('product-images', 'product-images', false),
  ('expense-receipts', 'expense-receipts', false),
  ('delivery-proofs', 'delivery-proofs', false),
  ('documents', 'documents', false)
on conflict (id) do nothing;

-- Product images
create policy "product images read" on storage.objects for select to authenticated
  using (bucket_id = 'product-images' and public.is_active_user());
create policy "product images write" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and public.has_role('super_admin', 'manager'));
create policy "product images update" on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and public.has_role('super_admin', 'manager'));
create policy "product images delete" on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and public.has_role('super_admin', 'manager'));

-- Expense receipts: <user id>/<file>
create policy "receipts read" on storage.objects for select to authenticated
  using (bucket_id = 'expense-receipts'
         and (public.has_role('super_admin', 'manager', 'billing')
              or (storage.foldername(name))[1] = auth.uid()::text));
create policy "receipts write own" on storage.objects for insert to authenticated
  with check (bucket_id = 'expense-receipts'
              and public.is_active_user()
              and (storage.foldername(name))[1] = auth.uid()::text);

-- Delivery proofs
create policy "delivery proofs read" on storage.objects for select to authenticated
  using (bucket_id = 'delivery-proofs' and public.has_role('super_admin', 'manager', 'billing', 'warehouse'));
create policy "delivery proofs write" on storage.objects for insert to authenticated
  with check (bucket_id = 'delivery-proofs' and public.has_role('super_admin', 'manager', 'warehouse'));

-- Generated documents are written by the server (service role) and read by staff.
create policy "documents read" on storage.objects for select to authenticated
  using (bucket_id = 'documents' and public.has_role('super_admin', 'manager', 'billing', 'warehouse', 'salesman'));
