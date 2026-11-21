-- =============================================================================
-- ROLLBACK of 0039 back to 0038. Run as ONE transaction.
-- 0039 only added three read-only functions; no data was written.
-- =============================================================================
drop function if exists public.account_statement_entries(text, uuid, date, date);
drop function if exists public.account_statement(text, uuid, date, date);
drop function if exists public.statement_retailers(text, uuid);
