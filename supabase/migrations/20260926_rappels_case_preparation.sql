-- ═══════════════════════════════════════════════════════════════════════════════
-- ORDOMAIL — Étape "préparé" pour les rappels de renouvellement — 26/09/2026
--
-- Demande titulaire : entre "à traiter" (le patient a répondu) et la
-- validation finale (médicament livré), le pharmacien a besoin d'une étape
-- intermédiaire "préparé" — le médicament est préparé et rangé dans un
-- casier physique en attendant que le patient vienne le retirer. Ne
-- concerne QUE les renouvellements réels (tout_renouveler/partiel) : un
-- patient qui a répondu "rien" n'a rien à préparer.
--
-- case_code : repère interne pour l'équipe (jamais communiqué au patient) —
-- 2 lettres aléatoires + un numéro de casier sur 2 chiffres (00-99). Le
-- numéro de casier n'est PAS aléatoire : incrémenté et bouclé (compteur
-- rappel_case_compteur ci-dessous, une pharmacies) pour répartir
-- équitablement l'usage des 100 casiers physiques, plutôt que de risquer
-- une concentration sur quelques numéros si le tirage était aléatoire.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE pharmacies
  ADD COLUMN IF NOT EXISTS rappel_case_compteur SMALLINT NOT NULL DEFAULT -1;

ALTER TABLE rappels_ordonnance
  ADD COLUMN IF NOT EXISTS case_code TEXT,
  ADD COLUMN IF NOT EXISTS date_preparee TIMESTAMPTZ;

COMMENT ON COLUMN rappels_ordonnance.case_code IS
  'Repère interne (2 lettres + 2 chiffres, ex. AB05) du casier où le médicament préparé est rangé en attendant le retrait patient. Jamais communiqué au patient. Réinitialisé (redevient NULL) à la validation du cycle suivant.';

ALTER TABLE rappels_ordonnance DROP CONSTRAINT IF EXISTS rappels_ordonnance_statut_check;
ALTER TABLE rappels_ordonnance ADD CONSTRAINT rappels_ordonnance_statut_check
  CHECK (statut IN ('en_attente','sms_envoye','a_traiter','prepare','termine'));

ALTER TABLE rappels_evenements DROP CONSTRAINT IF EXISTS rappels_evenements_type_check;
ALTER TABLE rappels_evenements ADD CONSTRAINT rappels_evenements_type_check
  CHECK (type IN ('cree','sms_envoye','sms_echec','reponse_patient','traite','termine','reactive','prepare'));

-- Incrément atomique et circulaire (0-99) du compteur de casiers d'UNE
-- pharmacie — un simple UPDATE...RETURNING (verrou de ligne implicite)
-- garantit que deux préparations simultanées ne reçoivent jamais le même
-- numéro. EXECUTE réservé à service_role : cette fonction ne doit être
-- appelée que par secure-data (jamais directement via /rest/v1/rpc par
-- anon/authenticated).
CREATE OR REPLACE FUNCTION increment_rappel_case_compteur(p_pharmacie_id UUID)
RETURNS SMALLINT
LANGUAGE sql
SET search_path = public
AS $$
  UPDATE pharmacies
  SET rappel_case_compteur = (rappel_case_compteur + 1) % 100
  WHERE id = p_pharmacie_id
  RETURNING rappel_case_compteur;
$$;

REVOKE ALL ON FUNCTION increment_rappel_case_compteur(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION increment_rappel_case_compteur(UUID) TO service_role;

COMMIT;
