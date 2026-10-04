-- ═══════════════════════════════════════════════════════════════════════════════
-- ORDOMAIL — Suppression logique des rappels — 04/10/2026
--
-- Audit : la suppression physique d'un rappel emportait la preuve du
-- consentement (consentement_sms_horodatage) et l'opposition du patient
-- (opt_out). On marque désormais la ligne (supprime_le) au lieu de la
-- supprimer ; toutes les lectures l'excluent, et la purge de rétention
-- supprime définitivement les lignes marquées après la durée configurée.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE rappels_ordonnance ADD COLUMN IF NOT EXISTS supprime_le TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_rappels_ordonnance_supprime
  ON rappels_ordonnance (supprime_le) WHERE supprime_le IS NOT NULL;

COMMIT;
