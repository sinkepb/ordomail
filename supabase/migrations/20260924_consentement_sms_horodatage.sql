-- ═══════════════════════════════════════════════════════════════════════════════
-- ORDOMAIL — Horodatage du consentement SMS (rappels de renouvellement) — 24/09/2026
--
-- @fix (audit du 23/09/2026, RGPD art. 7(1)) — consentement_sms n'était qu'un
-- simple booléen, sans date ni preuve associée : aucun moyen de démontrer
-- QUAND il a été recueilli en cas de contestation patient. Ajoute un
-- horodatage, rempli à la création du rappel (secure-data:rappels_create) —
-- jamais rétroactivement pour les lignes existantes, dont la date réelle de
-- recueil n'est pas connue avec certitude.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE rappels_ordonnance
  ADD COLUMN IF NOT EXISTS consentement_sms_horodatage TIMESTAMPTZ;

COMMENT ON COLUMN rappels_ordonnance.consentement_sms_horodatage IS
  'Date/heure à laquelle le consentement du patient à être recontacté a été recueilli (saisi par le pharmacien à la création du rappel). NULL pour les rappels créés avant le 24/09/2026.';

COMMIT;
