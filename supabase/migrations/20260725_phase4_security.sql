-- ═══════════════════════════════════════════════════════════════════════════════
-- ORDOMAIL — Migration phase 4 (25/07/2026) — durcissement complémentaire
--
-- À exécuter manuellement (Supabase SQL Editor), comme les migrations
-- précédentes. Contexte complet : DEPLOIEMENT_PHASE4.md.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- stories_content — le backoffice (BackofficeAdmin) n'a pas de session Supabase
-- Auth réelle (même architecture que le vendeur, voir phase 1) : il écrivait
-- directement cette table avec la clé anon, donc RLS ne pouvait pas distinguer
-- un admin authentifié d'un simple visiteur muni de la clé anon publique.
-- Les écritures admin passent désormais par secure-data (clé de service, jeton
-- admin vérifié côté serveur — voir resource=admin_stories_write). Seule la
-- lecture des contenus actifs reste publique (nécessaire : PatientPage.jsx lit
-- cette table pour la salle d'attente, sans authentification).
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'stories_content'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.stories_content', pol.policyname);
  END LOOP;
END $$;

ALTER TABLE stories_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE stories_content FORCE ROW LEVEL SECURITY;

CREATE POLICY "stories_public_read_active" ON stories_content
  FOR SELECT
  USING (actif = true);

-- Aucune policy d'écriture : INSERT/UPDATE/DELETE uniquement via la clé de
-- service (edge function secure-data), jamais directement par le client.

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Vérification manuelle recommandée après exécution :
--   -- Doit renvoyer uniquement les lignes actif=true, avec la clé anon :
--   SELECT id, titre, actif FROM stories_content; -- (via l'API REST, pas psql,
--                                                     pour que RLS s'applique)
-- ─────────────────────────────────────────────────────────────────────────────
