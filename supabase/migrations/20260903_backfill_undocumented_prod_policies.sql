-- OrdoMail — comble un écart découvert le 03/09/2026 en remettant à niveau le
-- projet Supabase "preview" (jamais fait depuis la séparation preview/
-- production) : plusieurs policies RLS existent en PRODUCTION sans jamais
-- avoir été capturées dans un fichier de migration (appliquées à la main via
-- l'éditeur SQL du dashboard, cf. l'avertissement du même type dans
-- DEPLOIEMENT_CHECKLIST.md §3). Sans ce fichier, tout nouvel environnement
-- (preview, ou une reconstruction future) atterrit avec pharmacie_users
-- totalement verrouillée (RLS actif, aucune policy) — la connexion titulaire
-- échoue silencieusement ("Aucune pharmacie liée") alors que le lien existe
-- bien en base.
--
-- Découvert en tentant de se connecter avec un compte titulaire de test créé
-- directement sur preview : l'auth réussissait, mais la lecture de
-- pharmacie_users (nécessaire pour retrouver la pharmacie liée) était bloquée
-- par RLS faute de policy SELECT.
-- CREATE POLICY n'a pas de IF NOT EXISTS en PostgreSQL — DROP IF EXISTS puis
-- CREATE, seule façon idempotente (convention déjà utilisée partout ailleurs
-- dans ce dossier de migrations).
DROP POLICY IF EXISTS abonnements_own ON abonnements;
CREATE POLICY abonnements_own ON abonnements FOR ALL
  USING (pharmacie_id = get_user_pharmacie_id());
DROP POLICY IF EXISTS logs_own ON audit_logs;
CREATE POLICY logs_own ON audit_logs FOR ALL
  USING (pharmacie_id = get_user_pharmacie_id());
DROP POLICY IF EXISTS factures_own ON factures;
CREATE POLICY factures_own ON factures FOR ALL
  USING (pharmacie_id = get_user_pharmacie_id());
DROP POLICY IF EXISTS public_read_offres_actives ON offres_stories;
CREATE POLICY public_read_offres_actives ON offres_stories FOR SELECT
  USING (actif = true);
DROP POLICY IF EXISTS users_can_read_own_link ON pharmacie_users;
CREATE POLICY users_can_read_own_link ON pharmacie_users FOR SELECT
  USING (auth.uid() = id);

-- Bug d'ordre distinct, découvert au même moment : 20260818_close_storage_
-- anon_write.sql (DROP) et 20260818_track_storage_policies.sql (CREATE) ont
-- la même date — rejoués dans l'ordre alphabétique du nom de fichier plutôt
-- que l'ordre logique réel, le DROP s'exécutait AVANT le CREATE et laissait
-- donc la policy d'écriture anonyme grande ouverte (finding 8 de l'audit du
-- 17/08/2026, censé être fermé). Sans effet sur la production (appliqué à la
-- main dans le bon ordre à l'époque) — uniquement pertinent pour rejouer
-- l'historique complet sur un nouvel environnement.
DROP POLICY IF EXISTS "public_upload_ordonnances" ON storage.objects;
