-- OrdoMail — sécurisation appels_patient (sonnette)
--
-- Audit du 17/08/2026 : cette table n'a JAMAIS eu de RLS depuis sa création
-- (supabase/schema.sql, absente de la liste "ENABLE ROW LEVEL SECURITY").
-- Confirmé exploitable en lecture anonyme par un test réel : requête REST
-- anonyme (clé anon, sans Authorization) contre /rest/v1/appels_patient,
-- retournant id/pharmacie_id/code_patient/created_at de TOUTES les
-- pharmacies, sans restriction ni pagination cachée.
--
-- Le patient (toujours anonyme, jamais de session Supabase Auth) n'a plus
-- besoin de lire cette table pour être notifié : la notification "votre
-- code a été appelé" passe désormais par un canal Realtime Broadcast (voir
-- src/lib/supabase/sonnette.js), qui ne dépend d'aucun droit de lecture SQL
-- et n'est donc pas exposable via l'API REST. Seul le titulaire authentifié
-- de la pharmacie concernée peut désormais lire l'historique des appels.

ALTER TABLE appels_patient ENABLE ROW LEVEL SECURITY;
ALTER TABLE appels_patient FORCE ROW LEVEL SECURITY;

-- Nettoyage de policies existant en production mais absentes de tout fichier
-- tracké (dérive déjà constatée sur d'autres tables lors de l'audit) :
-- "public_read_appels" accordait SELECT à PUBLIC (donc à anon) — sans effet
-- tant que RLS était désactivée, mais aurait totalement neutralisé la policy
-- appels_patient_own ci-dessous une fois RLS activée (les policies RLS sont
-- combinées en OR). "public_insert_appels" est un doublon inoffensif de
-- appels_patient_insert.
DROP POLICY IF EXISTS "public_read_appels" ON appels_patient;
DROP POLICY IF EXISTS "public_insert_appels" ON appels_patient;

-- INSERT ouvert à anon + authenticated : le vendeur qui déclenche l'appel
-- n'a jamais de session Supabase Auth (jeton HMAC signé par verify-pin
-- uniquement) — même modèle déjà accepté pour audit_logs/story_metrics/
-- offre_interets (voir 20260808_audit_logs_policies.sql) : donnée
-- opérationnelle non sensible (pharmacie_id + code patient éphémère à 4
-- caractères, pas de PII médicale), pas de vérification cryptographique
-- possible côté vendeur sans passer par une edge function dédiée.
DROP POLICY IF EXISTS "appels_patient_insert" ON appels_patient;
CREATE POLICY "appels_patient_insert" ON appels_patient
  FOR INSERT
  WITH CHECK (true);

-- SELECT réservé au titulaire authentifié de sa propre pharmacie.
DROP POLICY IF EXISTS "appels_patient_own" ON appels_patient;
CREATE POLICY "appels_patient_own" ON appels_patient
  FOR SELECT
  TO authenticated
  USING (pharmacie_id = get_user_pharmacie_id());
