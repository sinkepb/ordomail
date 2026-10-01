-- ═══════════════════════════════════════════════════════════════════════════════
-- ORDOMAIL — Relance puis escalade pour les rappels sans réponse — 01/10/2026
--
-- @fix (retour titulaire) — un patient qui ne répond jamais au premier SMS
-- restait bloqué indéfiniment en "sms_envoye", sans aucune action. Un SMS de
-- relance à J+3 sans réponse, puis passage en "à appeler" à J+3 après la
-- relance (J+6 au total) si toujours aucune réponse — voir
-- _shared/rappelLogic.ts:runRelanceEtEscaladeScan.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE rappels_ordonnance
  ADD COLUMN IF NOT EXISTS relance_sms_envoyee BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE rappels_evenements DROP CONSTRAINT IF EXISTS rappels_evenements_type_check;
ALTER TABLE rappels_evenements
  ADD CONSTRAINT rappels_evenements_type_check
  CHECK (type IN ('cree', 'sms_envoye', 'sms_echec', 'a_appeler', 'reponse_patient', 'appel_effectue', 'relance_envoyee', 'traite', 'termine', 'reactive', 'prepare'));

COMMENT ON COLUMN rappels_ordonnance.relance_sms_envoyee IS
  'Un SMS de relance a déjà été envoyé pour ce cycle (J+3 sans réponse au premier SMS) — remis à false à chaque nouveau cycle. Si toujours sans réponse 3 jours après, le rappel passe en "a_appeler".';

COMMIT;
