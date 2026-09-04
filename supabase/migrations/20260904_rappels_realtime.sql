-- OrdoMail — active le temps réel pour rappels_ordonnance (04/09/2026).
--
-- Retour direct : quand le patient répond (resolve-rappel, sa propre session
-- anonyme — jamais celle du pharmacien), le passage à "a_traiter" et le
-- badge associé ne devaient plus attendre un rechargement manuel de l'onglet
-- Rappels. Deux conditions, toutes les deux nécessaires (voir la même
-- remarque sur offres_stories, 20260903_offres_mobile_phase1_realtime.sql) :
--
-- 1. La table doit appartenir explicitement à la publication
--    supabase_realtime — jamais implicite, même avec des policies RLS
--    correctes.
-- 2. Une policy RLS doit autoriser le rôle `authenticated` à SELECT ses
--    propres lignes — Supabase Realtime applique RLS aux postgres_changes.
--    rappels_ordonnance était jusqu'ici deny-all (accès exclusivement par
--    service_role via secure-data), comme ordonnances avant l'ajout de la
--    policy "ordonnances_titulaire_own" (20260723_phase1_security.sql) — même
--    schéma repris ici, en lecture seule (l'écriture reste exclusivement via
--    secure-data, qui vérifie déjà l'appartenance à la pharmacie appelante).
-- 3. ⚠️ Contrairement à `ordonnances` (jamais verrouillée par un REVOKE), la
--    migration de création de rappels_ordonnance a fait un
--    `REVOKE ALL ... FROM anon, authenticated` explicite — une policy RLS ne
--    fait que FILTRER les lignes, elle ne crée jamais le privilège de base :
--    sans un GRANT SELECT explicite, la policy ci-dessous n'a rien à
--    autoriser. Repéré en direct : le canal Realtime rejoignait le topic
--    avec succès ("joined") mais ne recevait STRICTEMENT AUCUN événement —
--    confirmé via une requête PostgREST directe avec le JWT du titulaire,
--    qui renvoyait "permission denied for table rappels_ordonnance" malgré
--    la policy déjà en place.
GRANT SELECT ON rappels_ordonnance TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'rappels_ordonnance'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE rappels_ordonnance;
  END IF;
END $$;

-- DROP + CREATE (pas de IF NOT EXISTS pour les policies) pour rester rejouable.
DROP POLICY IF EXISTS "rappels_titulaire_read" ON rappels_ordonnance;
CREATE POLICY "rappels_titulaire_read" ON rappels_ordonnance
  FOR SELECT
  TO authenticated
  USING (pharmacie_id = get_user_pharmacie_id());
