-- Read-only fingerprint of every backed-up table: row count + checksum of all
-- rows. Run with psql -qAt; prints "schema.table|rows|md5" sorted by name.
-- The same output from production (inside the dump's snapshot) and from the
-- restored copy proves the restore holds exactly the same data.
-- Tables whose data is deliberately left out of the backup (sessions, tokens)
-- are skipped here too; keep this list in step with backup.sh.
set timezone = 'UTC';
set datestyle = 'ISO, YMD';
set intervalstyle = 'postgres';
set extra_float_digits = 1;
select format(
         'select %L || ''|'' || count(*) || ''|'' || coalesce(md5(string_agg(md5(t::text), '','' order by md5(t::text))), ''-'') from %I.%I t',
         n.nspname || '.' || c.relname, n.nspname, c.relname)
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where c.relkind in ('r', 'p')
   and n.nspname in ('public', 'auth', 'storage', 'mt_rollback', 'supabase_migrations')
   and (n.nspname, c.relname) not in (
         ('auth', 'sessions'), ('auth', 'refresh_tokens'), ('auth', 'flow_state'),
         ('auth', 'one_time_tokens'), ('auth', 'mfa_challenges'), ('auth', 'audit_log_entries'),
         ('auth', 'mfa_amr_claims'))
 order by n.nspname, c.relname
\gexec
