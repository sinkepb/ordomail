-- OrdoMail — active Postgres Realtime pour offres_stories (03/09/2026).
--
-- Sans ceci, aucun postgres_changes ne part jamais vers les abonnés
-- (subscribeToOffres, PatientPage.jsx/OffresSection.jsx) : une table n'émet
-- des événements Realtime QUE si elle appartient explicitement à la
-- publication `supabase_realtime` — ce n'est jamais implicite, même avec des
-- policies RLS correctes. Repéré en testant en direct : la création d'une
-- offre depuis mobile-offre fonctionnait (ligne bien insérée), mais
-- n'apparaissait jamais côté PC/patient sans rafraîchissement manuel, et
-- aucune erreur ne le signalait (le canal se souscrit "avec succès", il ne
-- reçoit simplement jamais rien).
--
-- ALTER PUBLICATION ... ADD TABLE n'a pas de IF NOT EXISTS — vérifié via
-- pg_publication_tables pour rester rejouable sans erreur.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'offres_stories'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE offres_stories;
  END IF;
END $$;
