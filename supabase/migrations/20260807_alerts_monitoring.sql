-- ═══════════════════════════════════════════════════════════════════════════════
-- ORDOMAIL — Table alerts (monitoring/alerting edge functions) — 07/08/2026
--
-- Support du panneau "Monitoring" du backoffice OrdoMail Business : les edge
-- functions critiques (stripe-webhook, submit-ordonnance, snapshot-metriques)
-- y écrivent un événement quand quelque chose échoue de façon anormale (échec
-- de paiement, dépôt d'ordonnance en erreur serveur, cron en échec partiel).
--
-- Accès volontairement restreint à service_role uniquement (même schéma que
-- pin_verification_attempts/submission_log, voir 20260726_live_advisor_fixes.sql) :
-- le backoffice n'a pas de session Supabase Auth réelle (jeton admin signé,
-- pas auth.uid()), donc une policy RLS ne peut pas distinguer un admin d'un
-- visiteur muni de la clé anon publique. La lecture/résolution passe par
-- l'edge function secure-data (resources admin_alerts / admin_alerts_resolve),
-- qui vérifie le jeton admin explicitement — pas par un accès direct anon/
-- authenticated à cette table, jamais accordé ici.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS alerts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  source      TEXT NOT NULL,                          -- ex: 'stripe-webhook', 'submit-ordonnance'
  severity    TEXT NOT NULL CHECK (severity IN ('critical','warning','info')),
  message     TEXT NOT NULL,
  meta        JSONB,
  resolved    BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_alerts_resolved_created ON alerts (resolved, created_at DESC);

ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts FORCE ROW LEVEL SECURITY;

-- Aucune policy créée intentionnellement : sans policy, RLS refuse tout accès
-- à anon/authenticated par défaut. service_role bypass RLS (edge functions).
REVOKE ALL ON alerts FROM anon, authenticated;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Après exécution : redéployer les edge functions qui écrivent dans alerts
-- (stripe-webhook, submit-ordonnance, snapshot-metriques) et secure-data
-- (nouvelles resources admin_alerts / admin_alerts_resolve), et configurer en
-- option le secret ALERT_WEBHOOK_URL (webhook entrant Slack/Discord/Teams) pour
-- une notification immédiate en plus du panneau Monitoring :
--   supabase secrets set ALERT_WEBHOOK_URL=https://hooks.slack.com/services/...
-- ─────────────────────────────────────────────────────────────────────────────
