-- =============================================================================
-- ROLLBACK of 0038 back to 0037. Run as ONE transaction.
-- 0038 only added delete_retailer(); retailers it deleted stay deleted.
-- =============================================================================
drop function if exists public.delete_retailer(uuid);
