-- ═══════════════════════════════════════════════════════════════════════════════
-- ORDOMAIL — Schéma PostgreSQL Supabase
-- Exécuter dans l'éditeur SQL de Supabase (Settings > SQL Editor)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────────────────────────────────────
-- PHARMACIES
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pharmacies (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nom           TEXT NOT NULL,
  adresse       TEXT,
  email         TEXT UNIQUE NOT NULL,
  couleur       TEXT DEFAULT '#1a3a6e',
  logo_url      TEXT,
  email_reception TEXT UNIQUE,  -- ex: ph1@in.ordomail.fr
  smtp_host     TEXT,
  smtp_port     INTEGER DEFAULT 587,
  smtp_user     TEXT,
  smtp_pass_enc TEXT,           -- chiffré côté app
  plan          TEXT NOT NULL DEFAULT 'starter' CHECK (plan IN ('starter','standard','pro')),
  stripe_customer_id   TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  plan_status   TEXT DEFAULT 'trialing' CHECK (plan_status IN ('active','trialing','past_due','canceled')),
  trial_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days'),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- POSTES (terminaux dans la pharmacie)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS postes (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pharmacie_id  UUID NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
  nom           TEXT NOT NULL DEFAULT 'Poste',
  actif         BOOLEAN DEFAULT TRUE,
  pin_hash      TEXT,           -- bcrypt hash du PIN à 4 chiffres
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- UTILISATEURS (lié à Supabase Auth)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pharmacie_users (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  pharmacie_id  UUID REFERENCES pharmacies(id) ON DELETE SET NULL,
  role          TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin','vendeur')),
  rpps          TEXT,           -- identifiant PSC (pharmacien)
  prenom        TEXT,
  nom           TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- ORDONNANCES
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ordonnances (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pharmacie_id  UUID NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
  source        TEXT NOT NULL DEFAULT 'email' CHECK (source IN ('email','qrcode','nfc','upload')),
  status        TEXT NOT NULL DEFAULT 'nouveau' CHECK (status IN ('nouveau','imprime','archive')),

  -- Expéditeur
  from_name     TEXT,
  from_email    TEXT,

  -- Données extraites par OCR/IA
  patient_nom   TEXT,
  patient_cv    TEXT,           -- numéro carte vitale
  medecin       TEXT,
  date_prescription DATE,
  medicaments   TEXT[],         -- tableau de médicaments

  -- Fichier joint
  fichier_url   TEXT,           -- URL Supabase Storage
  fichier_nom   TEXT,
  fichier_type  TEXT CHECK (fichier_type IN ('pdf','image')),
  fichier_taille TEXT,

  -- Métadonnées
  received_at   TIMESTAMPTZ DEFAULT NOW(),
  printed_at    TIMESTAMPTZ,
  printed_by    UUID REFERENCES postes(id),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour les requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_ordonnances_pharmacie_date
  ON ordonnances(pharmacie_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_ordonnances_status
  ON ordonnances(pharmacie_id, status);

-- ─────────────────────────────────────────────────────────────────────────────
-- AUDIT LOGS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pharmacie_id  UUID NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
  user_id       TEXT,           -- id poste ou RPPS
  user_role     TEXT,
  action        TEXT NOT NULL,  -- view|print|upload|reopen|login|logout
  ordonnance_id UUID REFERENCES ordonnances(id) ON DELETE SET NULL,
  metadata      JSONB,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_pharmacie
  ON audit_logs(pharmacie_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- ABONNEMENTS (miroir Stripe)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS abonnements (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pharmacie_id    UUID NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
  stripe_sub_id   TEXT UNIQUE NOT NULL,
  plan            TEXT NOT NULL,
  billing_cycle   TEXT DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly','annual')),
  status          TEXT NOT NULL,
  current_period_start TIMESTAMPTZ,
  current_period_end   TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  mrr             INTEGER DEFAULT 0,  -- en centimes
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- FACTURES (miroir Stripe)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS factures (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pharmacie_id    UUID NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
  stripe_invoice_id TEXT UNIQUE NOT NULL,
  numero          TEXT,         -- ex: INV-2025-001
  montant_ttc     INTEGER,      -- en centimes
  tva             INTEGER,      -- en centimes
  statut          TEXT DEFAULT 'draft' CHECK (statut IN ('draft','open','paid','void','uncollectible')),
  pdf_url         TEXT,         -- URL Stripe hosted invoice
  period_start    TIMESTAMPTZ,
  period_end      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────────────────────

-- Activer RLS sur toutes les tables
ALTER TABLE pharmacies      ENABLE ROW LEVEL SECURITY;
ALTER TABLE postes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE pharmacie_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE ordonnances     ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE abonnements     ENABLE ROW LEVEL SECURITY;
ALTER TABLE factures        ENABLE ROW LEVEL SECURITY;

-- Fonction helper : récupérer la pharmacie de l'utilisateur connecté
CREATE OR REPLACE FUNCTION get_user_pharmacie_id()
RETURNS UUID AS $$
  SELECT pharmacie_id FROM pharmacie_users WHERE id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER;

-- Policies : chaque utilisateur ne voit que sa pharmacie
CREATE POLICY "pharmacie_own" ON pharmacies
  FOR ALL USING (id = get_user_pharmacie_id());

CREATE POLICY "postes_own" ON postes
  FOR ALL USING (pharmacie_id = get_user_pharmacie_id());

CREATE POLICY "ordonnances_own" ON ordonnances
  FOR ALL USING (pharmacie_id = get_user_pharmacie_id());

CREATE POLICY "logs_own" ON audit_logs
  FOR ALL USING (pharmacie_id = get_user_pharmacie_id());

CREATE POLICY "abonnements_own" ON abonnements
  FOR ALL USING (pharmacie_id = get_user_pharmacie_id());

CREATE POLICY "factures_own" ON factures
  FOR ALL USING (pharmacie_id = get_user_pharmacie_id());

-- ─────────────────────────────────────────────────────────────────────────────
-- TRIGGERS : updated_at automatique
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER pharmacies_updated_at
  BEFORE UPDATE ON pharmacies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER abonnements_updated_at
  BEFORE UPDATE ON abonnements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- REALTIME : activer les publications pour les ordonnances
-- ─────────────────────────────────────────────────────────────────────────────
BEGIN;
  DROP PUBLICATION IF EXISTS supabase_realtime;
  CREATE PUBLICATION supabase_realtime FOR TABLE ordonnances, audit_logs;
COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- STORAGE BUCKETS (à créer via dashboard Supabase)
-- ─────────────────────────────────────────────────────────────────────────────
-- Bucket: ordonnances-files (privé)
--   Dossier: {pharmacie_id}/{ordonnance_id}/
--   Accès: via signed URLs (1h expiry)
-- Bucket: logos-pharmacies (public)
--   Dossier: {pharmacie_id}/
