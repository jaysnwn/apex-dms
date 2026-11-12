-- =============================================================================
-- ROLLBACK of 0029 (explicit function definitions) back to 0028.
-- Run as ONE transaction. 0029 changed no logic, so this only puts back the
-- exact stored text each function had before (comments and spacing included).
-- =============================================================================
do $$
declare r record;
begin
  for r in select src from mt_rollback.function_src_0029 loop execute r.src; end loop;
end $$;
drop table mt_rollback.function_src_0029;
