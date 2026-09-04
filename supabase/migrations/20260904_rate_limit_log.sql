-- OrdoMail — limitation de débit générique pour les endpoints publics
-- anonymes (04/09/2026). submit-ordonnance avait déjà sa propre fenêtre
-- glissante par pharmacie (`submission_log`, voir index.ts) mais
-- toggle-interet, reserver-offre, mobile-offre et resolve-qr-code n'avaient
-- AUCUNE protection — n'importe qui pouvait les appeler sans limite
-- (coûts Storage/edge functions, ou déni de service pur).
--
-- Table générique (scope + key) plutôt qu'une table par endpoint comme
-- submission_log : `scope` identifie l'endpoint/action, `key` l'identifiant
-- à limiter (IP, ou pharmacie_id selon ce qui est disponible/pertinent pour
-- cet endpoint — voir _shared/rateLimit.ts). Même modèle d'accès que
-- submission_log/pin_verification_attempts : RLS actif, AUCUNE policy
-- (deny-all anon/authenticated), écriture/lecture uniquement via clé de
-- service depuis les edge functions.
CREATE TABLE IF NOT EXISTS rate_limit_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope      TEXT NOT NULL,
  key        TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rate_limit_log_scope_key_time ON rate_limit_log (scope, key, created_at);

ALTER TABLE rate_limit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limit_log FORCE ROW LEVEL SECURITY;
REVOKE ALL ON rate_limit_log FROM anon, authenticated;

-- Purge quotidienne — l'IP appelante est une donnée personnelle, pas de
-- raison de la garder au-delà de la fenêtre utile aux fenêtres glissantes
-- (5-15 min selon l'endpoint, voir _shared/rateLimit.ts) ; 2 jours de marge.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-rate-limit-log') THEN
    PERFORM cron.schedule('purge-rate-limit-log', '0 5 * * *',
      $cron$delete from rate_limit_log where created_at < now() - interval '2 days';$cron$);
  END IF;
END $$;
