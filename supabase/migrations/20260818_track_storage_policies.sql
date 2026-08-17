-- OrdoMail — traçabilité des policies storage.objects (audit du 17/08/2026, finding 8)
--
-- Ces policies existaient déjà en production, créées manuellement via le
-- dashboard Supabase, sans jamais être trackées dans aucun fichier de ce
-- dépôt (schema.sql:452-459 se contentait d'un commentaire "à créer/vérifier
-- via dashboard — policies non auditées"). Ce fichier documente l'état réel
-- constaté en base (lecture directe de pg_policy sur storage.objects) et
-- nettoie un doublon inoffensif au passage.
--
-- État constaté :
--   - "public_upload_ordonnances" et "public_upload_ordonnances_files" :
--     deux policies STRICTEMENT IDENTIQUES (INSERT, PUBLIC, WITH CHECK
--     bucket_id = 'ordonnances-files') — doublon sans effet fonctionnel,
--     consolidé en une seule ci-dessous.
--   - "users_own_files 2yeugw_0" (SELECT, PUBLIC, USING bucket_id =
--     'ordonnances-files' AND storage.foldername(name)[1] =
--     get_user_pharmacie_id()::text) : correcte pour authenticated (scope
--     par pharmacie) ; pour anon, get_user_pharmacie_id() renvoie NULL et
--     la comparaison échoue toujours — lecture anonyme donc déjà bloquée
--     de fait. Renommée ci-dessous pour retirer l'espace dans le nom.
--
-- ⚠️ Point non corrigé ici, à traiter séparément (changement de comportement,
-- pas une simple traçabilité) : la policy INSERT n'a AUCUNE restriction de
-- chemin — bucket_id = 'ordonnances-files' suffit. N'importe quel appelant
-- anonyme peut donc écrire un fichier arbitraire sous N'IMPORTE QUEL
-- {pharmacie_id}/{ordonnance_id}/ à l'aide de la seule clé anon, y compris
-- dans le dossier d'une pharmacie qui n'est pas la sienne — ce fichier
-- devient alors lisible par le titulaire légitime de cette pharmacie (SELECT
-- scope par pharmacie_id, donc SES PROPRES fichiers, qui peuvent avoir été
-- plantés par un tiers). Ce chemin est utilisé par
-- src/lib/supabase/ordonnances.js:uploadOrdoFile (le vendeur n'a pas de
-- session Supabase Auth réelle, comme pour appels_patient/story_metrics/
-- offre_interets), donc resserrer WITH CHECK côté SQL seul n'est pas
-- possible sans casser cet usage légitime — nécessite de router cet upload
-- via une edge function qui vérifie le jeton vendeur/titulaire avant
-- d'écrire avec la clé de service (même modèle que submit-ordonnance).

DROP POLICY IF EXISTS "public_upload_ordonnances_files" ON storage.objects;

DROP POLICY IF EXISTS "public_upload_ordonnances" ON storage.objects;
CREATE POLICY "public_upload_ordonnances" ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'ordonnances-files');

DROP POLICY IF EXISTS "users_own_files 2yeugw_0" ON storage.objects;
DROP POLICY IF EXISTS "users_own_files" ON storage.objects;
CREATE POLICY "users_own_files" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'ordonnances-files'
    AND (storage.foldername(name))[1] = (get_user_pharmacie_id())::text
  );
