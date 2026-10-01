-- ═══════════════════════════════════════════════════════════════════════════════
-- ORDOMAIL — Appel de clarification pour un renouvellement partiel — 01/10/2026
--
-- @fix (retour titulaire) — un patient répondant "partiel" via le lien SMS ne
-- précise AUCUN médicament : un simple clic ne peut pas le dire. Ce choix
-- passe désormais par "à appeler" (voir resolve-rappel/index.ts) au lieu
-- d'aller directement à "à traiter" comme tout_renouveler/rien (non
-- ambigus) — le pharmacien rappelle le patient pour préciser sa demande,
-- puis confirme l'appel (secure-data:rappels_confirmer_appel_partiel) pour
-- passer à "à traiter", sans ressaisir le choix déjà connu.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE rappels_evenements DROP CONSTRAINT IF EXISTS rappels_evenements_type_check;
ALTER TABLE rappels_evenements
  ADD CONSTRAINT rappels_evenements_type_check
  CHECK (type IN ('cree', 'sms_envoye', 'sms_echec', 'a_appeler', 'reponse_patient', 'appel_effectue', 'traite', 'termine', 'reactive', 'prepare'));

COMMIT;
