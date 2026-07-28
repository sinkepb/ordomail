-- ═══════════════════════════════════════════════════════════════════════════════
-- ORDOMAIL — Sélection des stories par pharmacie (26/07/2026)
--
-- À exécuter manuellement (Supabase SQL Editor), comme les migrations
-- précédentes.
--
-- Objectif : le catalogue de stories (stories_content) est global, géré par
-- OrdoMail Business — jusqu'ici, toutes les pharmacies affichaient tout le
-- catalogue actif sans distinction. Cette table permet à chaque titulaire de
-- désactiver individuellement, pour SES patients uniquement, les stories du
-- catalogue qu'il ne souhaite pas diffuser.
--
-- Absence de ligne = story affichée par défaut (compatible avec l'existant :
-- aucune pharmacie n'a besoin d'agir pour garder le comportement actuel).
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS pharmacie_stories_selection (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pharmacie_id  UUID NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
  story_id      UUID NOT NULL REFERENCES stories_content(id) ON DELETE CASCADE,
  actif         BOOLEAN NOT NULL DEFAULT true,
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (pharmacie_id, story_id)
);

ALTER TABLE pharmacie_stories_selection ENABLE ROW LEVEL SECURITY;
ALTER TABLE pharmacie_stories_selection FORCE ROW LEVEL SECURITY;

-- Lecture publique nécessaire : PatientPage.jsx (patient anonyme) doit savoir
-- quelles stories exclure pour la pharmacie qu'il consulte. Aucune donnée
-- sensible ici (juste des booléens actif/inactif par story).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'pharmacie_stories_selection'
      AND policyname = 'pharmacie_stories_selection_public_read'
  ) THEN
    CREATE POLICY "pharmacie_stories_selection_public_read" ON pharmacie_stories_selection
      FOR SELECT
      USING (true);
  END IF;
END $$;

-- Aucune policy d'écriture directe : la bascule actif/inactif passe par
-- secure-data (resource "pharmacie_stories_write"), qui vérifie que l'appelant
-- est bien le titulaire ou un vendeur de la pharmacie concernée.

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Vérification manuelle recommandée après exécution :
--   SELECT tablename, policyname, roles, cmd FROM pg_policies
--   WHERE tablename = 'pharmacie_stories_selection';
-- ─────────────────────────────────────────────────────────────────────────────
