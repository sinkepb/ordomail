-- ═══════════════════════════════════════════════════════════════════════════════
-- ORDOMAIL — Suivi des cron jobs pour le backoffice — 05/10/2026
--
-- Le schéma cron n'est pas exposé par l'API : cette fonction lit cron.job et
-- cron.job_run_details et renvoie l'état de chaque job avec ses dernières
-- exécutions. Réservée au rôle de service, appelée uniquement par
-- secure-data-admin (gate isAdmin côté fonction).
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_cron_runs(p_limit int DEFAULT 20)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, cron
AS $$
  SELECT COALESCE(jsonb_agg(j ORDER BY j->>'jobname'), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
      'jobid', jb.jobid,
      'jobname', jb.jobname,
      'schedule', jb.schedule,
      'active', jb.active,
      'runs', COALESCE((
        SELECT jsonb_agg(r)
        FROM (
          SELECT jsonb_build_object(
            'status', d.status,
            'start_time', d.start_time,
            'end_time', d.end_time,
            'message', left(d.return_message, 300)
          ) AS r
          FROM cron.job_run_details d
          WHERE d.jobid = jb.jobid
          ORDER BY d.start_time DESC
          LIMIT p_limit
        ) x
      ), '[]'::jsonb)
    ) AS j
    FROM cron.job jb
  ) y;
$$;

REVOKE ALL ON FUNCTION public.admin_cron_runs(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_cron_runs(int) TO service_role;

COMMIT;
