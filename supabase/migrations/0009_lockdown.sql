-- 0009_lockdown.sql  (Milestone M9: hardening)
-- Belt and braces: the anonymous role must never touch application data, whatever the
-- platform's default privileges were when the tables were created.
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon;

-- Service role keeps full access for scheduled jobs and Edge Functions.
grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
