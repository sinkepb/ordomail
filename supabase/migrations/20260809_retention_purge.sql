-- ═══════════════════════════════════════════════════════════════════════════════
-- ORDOMAIL — Rétention/purge automatique des ordonnances — 09/08/2026
--
-- RGPD art. 5.1.e (limitation de la conservation) : aucune purge automatique
-- n'existait jusqu'ici, les ordonnances (données de santé) et le journal
-- d'activité s'accumulaient indéfiniment. Ce fichier crée le paramétrage
-- (une durée en jours, modifiable depuis le backoffice OrdoMail Business) lu
-- par la nouvelle edge function purge-ordonnances (cron nocturne, même schéma
-- que snapshot-metriques).
--
-- Même modèle d'accès que `alerts` (20260807) : aucune policy anon/
-- authenticated — lecture/écriture uniquement via secure-data (resources
-- admin_retention_get / admin_retention_set, jeton admin vérifié) ou
-- service_role (edge function purge-ordonnances).
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- Une seule ligne en pratique (id fixe) — pas un paramètre par pharmacie : la
-- décision de durée de rétention est portée par OrdoMail en tant que
-- responsable de traitement pour l'infrastructure, pas déléguée à chaque
-- client. Valeur NULL par défaut = purge désactivée tant que le DPO n'a pas
-- validé une durée (voir DEPLOIEMENT_CHECKLIST.md) — la fonction cron doit
-- refuser de purger si la valeur n'est pas définie, jamais supposer un défaut
-- silencieux sur des données de santé.
CREATE TABLE IF NOT EXISTS retention_settings (
  id                        SMALLINT PRIMARY KEY DEFAULT 1,
  ordonnances_retention_days INTEGER,
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by                TEXT,
  CONSTRAINT retention_settings_single_row CHECK (id = 1),
  CONSTRAINT retention_settings_positive CHECK (ordonnances_retention_days IS NULL OR ordonnances_retention_days > 0)
);

INSERT INTO retention_settings (id, ordonnances_retention_days)
VALUES (1, NULL)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE retention_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE retention_settings FORCE ROW LEVEL SECURITY;
REVOKE ALL ON retention_settings FROM anon, authenticated;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Après exécution : configurer la durée depuis le backoffice OrdoMail Business
-- (onglet Rétention) une fois validée par le DPO — sans ça, purge-ordonnances
-- ne supprime rien (par conception, voir commentaire ci-dessus).
-- ─────────────────────────────────────────────────────────────────────────────
