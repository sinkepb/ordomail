-- ═══════════════════════════════════════════════════════════════════════════════
-- ORDOMAIL — Normalise email_reception/email_slug en minuscule — 03/10/2026
--
-- Incident prod : aucune pharmacie ne recevait d'email (send-email loggait
-- systématiquement "Pharmacie introuvable"). Cause : email_reception est
-- généré avec un code à 4 caractères tirés d'un alphabet MAJUSCULE
-- (register-pharmacie, et le backfill du 09/08/2026 fait pareil), alors que
-- send-email compare l'adresse reçue après l'avoir passée en minuscules
-- (extractEmail()) — un .eq() sensible à la casse ne matchait donc quasiment
-- jamais. Corrigé en deux temps :
--   1. send-email utilise désormais .ilike() (insensible à la casse) —
--      suffit à corriger IMMÉDIATEMENT tous les comptes existants, cette
--      migration n'est pas un prérequis du correctif fonctionnel.
--   2. register-pharmacie génère désormais le code en minuscule — nouveaux
--      comptes directement cohérents.
-- Cette migration aligne les comptes déjà créés avec le nouveau format, pour
-- ne plus dépendre uniquement du .ilike() (si une future modification
-- repassait par erreur en .eq(), la casse ne doit plus pouvoir recasser la
-- réception email).
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

UPDATE pharmacies
SET email_reception = lower(email_reception),
    email_slug      = lower(email_slug)
WHERE email_reception IS NOT NULL
  AND email_reception <> lower(email_reception);

COMMIT;
