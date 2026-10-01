-- ═══════════════════════════════════════════════════════════════════════════════
-- ORDOMAIL — Mode de contact des rappels (SMS ou appel) — 30/09/2026
--
-- @fix (retour titulaire) — un patient âgé sans mobile capable de recevoir un
-- SMS restait indéfiniment en "sms_envoye" sans jamais répondre. Le mode de
-- contact est auto-détecté à la création (préfixe du numéro, voir
-- secure-data:rappels_create et _shared/telephone.ts) : un rappel en mode
-- "appel" passe directement en "a_appeler" à l'échéance (au lieu d'un SMS),
-- le pharmacien enregistre alors lui-même la réponse du patient après l'avoir
-- appelé (secure-data:rappels_enregistrer_appel), qui rejoint ensuite
-- exactement le même circuit qu'une réponse par SMS ("a_traiter").
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE rappels_ordonnance
  ADD COLUMN IF NOT EXISTS mode_contact TEXT NOT NULL DEFAULT 'sms';

ALTER TABLE rappels_ordonnance DROP CONSTRAINT IF EXISTS rappels_ordonnance_mode_contact_check;
ALTER TABLE rappels_ordonnance
  ADD CONSTRAINT rappels_ordonnance_mode_contact_check CHECK (mode_contact IN ('sms', 'appel'));

ALTER TABLE rappels_ordonnance DROP CONSTRAINT IF EXISTS rappels_ordonnance_statut_check;
ALTER TABLE rappels_ordonnance
  ADD CONSTRAINT rappels_ordonnance_statut_check
  CHECK (statut IN ('en_attente', 'sms_envoye', 'a_appeler', 'a_traiter', 'prepare', 'termine'));

ALTER TABLE rappels_evenements DROP CONSTRAINT IF EXISTS rappels_evenements_type_check;
ALTER TABLE rappels_evenements
  ADD CONSTRAINT rappels_evenements_type_check
  CHECK (type IN ('cree', 'sms_envoye', 'sms_echec', 'a_appeler', 'reponse_patient', 'traite', 'termine', 'reactive', 'prepare'));

COMMENT ON COLUMN rappels_ordonnance.mode_contact IS
  'Canal de contact du patient à l''échéance : sms (défaut, lien vers resolve-rappel) ou appel (patient sans mobile, numéro fixe détecté à la création — le pharmacien appelle et enregistre lui-même la réponse).';

COMMIT;
