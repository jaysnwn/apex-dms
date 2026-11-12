-- One line per public function: name|exact checksum|checksum ignoring comments and spacing.
select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
       || '|' || md5(p.prosrc || p.prosecdef || coalesce(array_to_string(p.proconfig, ','), ''))
       || '|' || md5(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g'))
  from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname <> 'rls_auto_enable'
 order by 1;
