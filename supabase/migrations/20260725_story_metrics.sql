-- ═══════════════════════════════════════════════════════════════════════════════
-- ORDOMAIL — Suivi métrique des stories (25/07/2026)
--
-- À exécuter manuellement (Supabase SQL Editor), comme les migrations
-- précédentes.
--
-- Objectif : mesurer la consultation de chaque story (conseil/quiz/offre) par les
-- patients — temps passé par story, et actions menées (réponse à un quiz,
-- déclaration d'intérêt pour une offre). Complète offre_interets (qui ne capture
-- que l'intérêt final pour une offre, pas l'engagement sur l'ensemble des stories).
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS story_metrics (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pharmacie_id  UUID NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
  -- Code patient (3 chiffres + 1 lettre, voir PatientPage.jsx generateCode()) —
  -- pas de FK vers ordonnances : une story peut être vue avant tout dépôt
  -- d'ordonnance (salle d'attente affichée dès l'arrivée).
  code_patient  TEXT,
  story_id      TEXT NOT NULL,
  story_type    TEXT,                 -- 'info' | 'conseil' | 'quiz' | 'offre'
  event         TEXT NOT NULL,        -- 'view' | 'quiz_answer' | 'offer_interest'
  duree_ms      INTEGER,              -- rempli pour event='view' (temps passé sur la story)
  meta          JSONB,                -- détail selon l'event (ex: {"correct":true}, {"isOn":true})
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_story_metrics_pharmacie_date
  ON story_metrics(pharmacie_id, created_at DESC);

ALTER TABLE story_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE story_metrics FORCE ROW LEVEL SECURITY;

-- Le patient (anonyme) doit pouvoir enregistrer ses événements de consultation —
-- mais pas relire ceux des autres patients (même principe que offre_interets,
-- voir migrations/20260723_phase1_security.sql).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'story_metrics' AND policyname = 'story_metrics_patient_insert'
  ) THEN
    CREATE POLICY "story_metrics_patient_insert" ON story_metrics
      FOR INSERT TO anon
      WITH CHECK (true);
  END IF;
END $$;

-- Aucune policy de lecture directe : la consultation se fait via secure-data
-- (resource "story_metrics"), qui vérifie côté serveur que l'appelant est bien
-- le titulaire ou un vendeur de la pharmacie concernée.

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Vérification manuelle recommandée après exécution :
--   SELECT tablename, policyname, roles, cmd FROM pg_policies WHERE tablename = 'story_metrics';
--   -- Doit renvoyer 0 ligne avec la clé anon (aucune session) en lecture :
--   -- GET {SUPABASE_URL}/rest/v1/story_metrics?select=id&limit=1  (apikey = anon key)
-- ─────────────────────────────────────────────────────────────────────────────
