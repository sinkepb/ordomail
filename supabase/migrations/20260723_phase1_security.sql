-- ═══════════════════════════════════════════════════════════════════════════════
-- ORDOMAIL — Migration phase 1 sécurité (23/07/2026)
--
-- À REVOIR PUIS EXÉCUTER MANUELLEMENT dans Supabase (Dashboard → SQL Editor),
-- de préférence sur une base de test/staging avant la production. Ce script est
-- écrit pour être idempotent (peut être rejoué sans casser un état déjà migré),
-- mais il modifie des policies RLS sur des tables en production — à exécuter en
-- connaissance de cause, pas via un pipeline automatique.
--
-- Contexte : l'audit du 23/07/2026 a confirmé par un test live (requête anonyme,
-- clé publique) que la table `ordonnances` (ordonnances patients — données de
-- santé) était lisible sans authentification. La cause la plus probable est que
-- RLS n'était pas activé (ou une policy trop permissive existait) sur les tables
-- réellement utilisées en production (`ordonnances`, `pharmacie_postes`,
-- `pharmacies`, `offre_interets`) — qui ne correspondent pas exactement au
-- schema.sql versionné (ex: `postes` vs `pharmacie_postes`).
--
-- Ce script :
--   1. Ajoute les colonnes nécessaires au durcissement (pin_hash, qr_token, tables
--      de limitation de débit)
--   2. Réinitialise les policies RLS des 4 tables concernées (DROP dynamique de
--      TOUTES les policies existantes, quel que soit leur nom, puis recréation)
--   3. Restreint l'accès anonyme aux colonnes non sensibles de `pharmacies`
--
-- À FAIRE DANS L'ORDRE :
--   1. Lire ce fichier en entier et l'adapter si vos noms de colonnes diffèrent
--   2. L'exécuter dans Supabase SQL Editor
--   3. Définir le secret ORDOMAIL_JWT_SECRET (voir DEPLOIEMENT_PHASE1.md)
--   4. Déployer les edge functions modifiées (verify-pin, update-pin, verify-admin,
--      submit-ordonnance, secure-data)
--   5. Déployer le frontend
-- Ne PAS déployer le frontend/les edge functions avant d'avoir exécuté ce script :
-- le nouveau code s'attend à pin_hash/qr_token/aux nouvelles tables.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. COLONNES & TABLES NÉCESSAIRES AU DURCISSEMENT
-- ─────────────────────────────────────────────────────────────────────────────

-- 1.a PIN vendeur hashé (bcrypt) — remplace la comparaison en clair de verify-pin
ALTER TABLE pharmacie_postes ADD COLUMN IF NOT EXISTS pin_hash TEXT;

-- Backfill : hasher les PIN en clair existants avec pgcrypto (bcrypt / blowfish),
-- compatible avec la vérification bcrypt.compare() côté edge function.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pharmacie_postes' AND column_name='pin') THEN
    UPDATE pharmacie_postes
      SET pin_hash = crypt(pin, gen_salt('bf'))
      WHERE pin IS NOT NULL AND (pin_hash IS NULL OR pin_hash = '');
  END IF;
END $$;

-- 1.b Limitation de débit — vérification de PIN (verify-pin)
CREATE TABLE IF NOT EXISTS pin_verification_attempts (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pharmacie_id UUID NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pin_attempts_pharmacie_date
  ON pin_verification_attempts(pharmacie_id, created_at DESC);

-- 1.c Limitation de débit — dépôt d'ordonnance public (submit-ordonnance)
CREATE TABLE IF NOT EXISTS submission_log (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pharmacie_id UUID NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_submission_log_pharmacie_date
  ON submission_log(pharmacie_id, created_at DESC);

-- 1.d Jeton public par pharmacie (QR code) — remplace le pharmacie_id seul comme "secret"
ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS qr_token TEXT;
UPDATE pharmacies SET qr_token = encode(gen_random_bytes(16), 'hex') WHERE qr_token IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. RÉINITIALISER LES POLICIES RLS EXISTANTES (noms inconnus/hérités)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('ordonnances', 'pharmacies', 'pharmacie_postes', 'offre_interets')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  END LOOP;
END $$;

-- S'assurer que RLS est bien activé (et forcé même pour le propriétaire de la table) —
-- une cause plausible de la fuite constatée est que RLS n'était tout simplement pas
-- activé sur ces tables (renommées/recréées depuis le schema.sql d'origine).
ALTER TABLE ordonnances       ENABLE ROW LEVEL SECURITY;
ALTER TABLE ordonnances       FORCE ROW LEVEL SECURITY;
ALTER TABLE pharmacies        ENABLE ROW LEVEL SECURITY;
ALTER TABLE pharmacies        FORCE ROW LEVEL SECURITY;
ALTER TABLE pharmacie_postes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE pharmacie_postes  FORCE ROW LEVEL SECURITY;
ALTER TABLE offre_interets    ENABLE ROW LEVEL SECURITY;
ALTER TABLE offre_interets    FORCE ROW LEVEL SECURITY;

-- Fonction helper (déjà définie dans schema.sql — recréée ici au cas où) :
-- pharmacie du titulaire actuellement authentifié via Supabase Auth.
CREATE OR REPLACE FUNCTION get_user_pharmacie_id()
RETURNS UUID AS $$
  SELECT pharmacie_id FROM pharmacie_users WHERE id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- ── ordonnances ──────────────────────────────────────────────────────────────
-- Aucune policy pour `anon` : toute lecture/écriture publique (vendeur PIN, patient)
-- passe désormais par l'edge function secure-data, qui utilise la clé de service et
-- vérifie elle-même l'appelant (jeton vendeur/admin ou session titulaire).
CREATE POLICY "ordonnances_titulaire_own" ON ordonnances
  FOR ALL
  TO authenticated
  USING (pharmacie_id = get_user_pharmacie_id())
  WITH CHECK (pharmacie_id = get_user_pharmacie_id());

-- ── pharmacie_postes ─────────────────────────────────────────────────────────
-- Idem : verify-pin/update-pin/secure-data utilisent la clé de service.
CREATE POLICY "postes_titulaire_own" ON pharmacie_postes
  FOR ALL
  TO authenticated
  USING (pharmacie_id = get_user_pharmacie_id())
  WITH CHECK (pharmacie_id = get_user_pharmacie_id());

-- ── offre_interets ───────────────────────────────────────────────────────────
-- Le patient (anonyme) doit pouvoir enregistrer son intérêt pour une offre — mais
-- pas relire les intérêts des autres patients (c'était la fuite : lecture anon libre).
CREATE POLICY "interets_patient_insert" ON offre_interets
  FOR INSERT TO anon
  WITH CHECK (true);
CREATE POLICY "interets_patient_upsert" ON offre_interets
  FOR UPDATE TO anon
  USING (true) WITH CHECK (true);
CREATE POLICY "interets_titulaire_read" ON offre_interets
  FOR SELECT
  TO authenticated
  USING (pharmacie_id = get_user_pharmacie_id());

-- ── pharmacies ───────────────────────────────────────────────────────────────
-- Lecture publique nécessaire (recherche par code pharmacie à 6 chiffres avant le
-- PIN vendeur, page patient via QR code, inscription) — restreinte aux colonnes
-- non sensibles par les GRANT ci-dessous, pas par la policy elle-même.
CREATE POLICY "pharmacies_public_lookup" ON pharmacies
  FOR SELECT
  USING (true);
CREATE POLICY "pharmacies_titulaire_write" ON pharmacies
  FOR UPDATE
  TO authenticated
  USING (id = get_user_pharmacie_id())
  WITH CHECK (id = get_user_pharmacie_id());

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RESTREINDRE LES COLONNES LISIBLES PAR `anon` SUR `pharmacies`
-- ─────────────────────────────────────────────────────────────────────────────
-- La policy de lecture ci-dessus ouvre toutes les LIGNES ; ceci restreint les
-- COLONNES visibles par le rôle anon aux seules valeurs déjà publiques dans le
-- produit (jamais email, stripe_customer_id, smtp_pass_enc, qr_token, etc.)
REVOKE SELECT ON pharmacies FROM anon;
GRANT SELECT (id, nom, couleur, code_vendeur, email_reception, sonnette_active, plan)
  ON pharmacies TO anon;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Vérification manuelle recommandée après exécution :
--   SELECT tablename, policyname, roles, cmd FROM pg_policies
--   WHERE tablename IN ('ordonnances','pharmacies','pharmacie_postes','offre_interets');
--
--   -- Doit échouer / renvoyer 0 ligne avec la clé anon (aucune session) :
--   -- GET {SUPABASE_URL}/rest/v1/ordonnances?select=id&limit=1  (apikey = anon key)
-- ─────────────────────────────────────────────────────────────────────────────
