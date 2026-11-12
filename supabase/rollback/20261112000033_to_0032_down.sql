-- =============================================================================
-- ROLLBACK of 0033 back to 0032. Run as ONE transaction.
-- Takes the fixed search path off the two functions again. Their bodies were
-- never changed, so there is nothing else to put back.
-- =============================================================================
alter function public.search_condition(text[]) reset search_path;
alter function public.platform_definer_allowlist() reset search_path;
