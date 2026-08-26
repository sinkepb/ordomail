-- OrdoMail — fonctions RPC pour piloter la fréquence de purge-ordonnances
-- depuis le backoffice (onglet Purge, 25/08/2026).
--
-- Le schéma `cron` (pg_cron) n'est pas exposé via PostgREST par défaut — ces
-- deux fonctions SECURITY DEFINER, dans `public` (donc appelables via
-- sb.rpc(...)  depuis secure-data-admin, clé de service), sont le seul accès
-- exposé à `cron.job`. Aucun accès direct à `cron` n'est donné à anon/
-- authenticated : seul le rôle utilisé par les Edge Functions (service_role)
-- peut appeler ces RPC, secure-data-admin vérifie déjà isAdmin en amont.

CREATE OR REPLACE FUNCTION get_purge_schedule(p_job_name TEXT)
RETURNS TABLE(schedule TEXT, active BOOLEAN)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT schedule, active FROM cron.job WHERE jobname = p_job_name;
$$;
REVOKE ALL ON FUNCTION get_purge_schedule(TEXT) FROM PUBLIC;

CREATE OR REPLACE FUNCTION alter_purge_schedule(p_job_name TEXT, p_schedule TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM cron.alter_job(
    job_id   := (SELECT jobid FROM cron.job WHERE jobname = p_job_name),
    schedule := p_schedule
  );
END;
$$;
REVOKE ALL ON FUNCTION alter_purge_schedule(TEXT, TEXT) FROM PUBLIC;
