-- ═══════════════════════════════════════════════════════════════════════════════
-- ORDOMAIL — Temps de traitement moyen (25/07/2026)
--
-- À exécuter manuellement (Supabase SQL Editor), comme les migrations
-- précédentes.
--
-- ordonnances.received_at et ordonnances.printed_at existent et sont déjà
-- renseignés à chaque impression (voir secure-data, resource ordonnances_update) —
-- il manquait la colonne pour stocker la moyenne calculée par pharmacie/jour,
-- au même endroit que taux_traitement et score_activite.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE metriques_journalieres
  ADD COLUMN IF NOT EXISTS delai_moyen_min INTEGER DEFAULT 0;

COMMENT ON COLUMN metriques_journalieres.delai_moyen_min IS
  'Temps moyen (minutes) entre received_at et printed_at, sur les ordonnances imprimées des 30 derniers jours.';

COMMIT;
