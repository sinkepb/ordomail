-- ═══════════════════════════════════════════════════════════════════════════════
-- ORDOMAIL — Schéma PostgreSQL Supabase (reconstruction, 24/07/2026)
--
-- ⚠️ Ce fichier a été RECONSTRUIT par inspection du code (edge functions,
-- frontend, migrations appliquées) — il ne remplace pas un vrai
-- `supabase db dump --schema public`. L'ancienne version de ce fichier décrivait
-- une table "postes" avec pin_hash bcrypt dès l'origine ; la table réellement
-- déployée s'appelle "pharmacie_postes" et stockait le PIN en clair jusqu'à la
-- phase 1 de durcissement (23/07/2026) — c'est cet écart entre schéma documenté
-- et schéma réel qui a permis à ce document de rester faux pendant longtemps.
--
-- Dès que possible, remplacer ce fichier par un vrai dump :
--   supabase db dump --schema public -f supabase/schema.sql
--
-- Colonnes marquées "(déduit)" : présence confirmée par le code qui les lit/
-- écrit, mais type/contraintes exacts non vérifiés (pas d'accès direct à la base
-- au moment de la rédaction — voir DEPLOIEMENT_PHASE1.md pour le contexte).
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────────────────────────────────────
-- PHARMACIES
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pharmacies (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nom             TEXT NOT NULL,
  adresse         TEXT,
  email           TEXT UNIQUE NOT NULL,
  couleur         TEXT DEFAULT '#1a3a6e',
  logo_url        TEXT,
  email_reception TEXT UNIQUE,                 -- ex: pharmacie-de-la-paix@in.ordomail.fr
  email_slug      TEXT,                        -- (déduit) partie locale de email_reception
  code_vendeur    TEXT,                        -- code à 6 chiffres, connexion vendeur (déduit: pas garanti UNIQUE en base)
  qr_token        TEXT,                        -- jeton public QR code (phase 1, 24/07/2026)
  sonnette_active BOOLEAN DEFAULT TRUE,         -- fonction "appeler le patient"
  smtp_host       TEXT,
  smtp_port       INTEGER DEFAULT 587,
  smtp_user       TEXT,
  smtp_pass_enc   TEXT,                         -- chiffré côté app — jamais exposé à `anon` (voir §RLS)
  plan            TEXT NOT NULL DEFAULT 'starter' CHECK (plan IN ('starter','standard','pro','premium')),
  stripe_customer_id     TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  plan_status     TEXT DEFAULT 'trialing' CHECK (plan_status IN ('active','trialing','past_due','canceled')),
  trial_ends_at   TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days'),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- PHARMACIE_POSTES (terminaux vendeur — nommée "postes" dans l'ancien schema.sql,
-- "pharmacie_postes" dans la base réelle et dans toutes les edge functions)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pharmacie_postes (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pharmacie_id  UUID NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
  nom           TEXT NOT NULL DEFAULT 'Poste',
  actif         BOOLEAN DEFAULT TRUE,
  pin           TEXT,           -- historique : PIN en clair. Nullé par update-pin depuis la phase 1 ;
                                 -- ne doit plus jamais être écrit en clair. Conservé pour compat lecture.
  pin_hash      TEXT,           -- bcrypt — seule source de vérité pour verify-pin depuis le 23/07/2026
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- PHARMACIE_USERS (lié à Supabase Auth — titulaires uniquement, les vendeurs
-- n'ont pas de compte auth.users, voir pharmacie_postes)
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

  -- Regroupement patient (sonnette, file d'attente) — voir PatientPage.jsx / submit-ordonnance
  code_patient  TEXT,           -- 3 chiffres + 1 lettre (position aléatoire), crypto-random côté client (24/07/2026, lettre ajoutée le 25/07/2026)

  -- Données extraites par OCR/IA
  patient_nom   TEXT,
  patient_cv    TEXT,           -- numéro carte vitale — volontairement jamais rempli par l'OCR (RGPD)
  medecin       TEXT,
  date_prescription DATE,
  medicaments   TEXT[],
  ocr_confidence NUMERIC,       -- (déduit) score de confiance OCR, lu par normOrdo() côté client

  -- Fichier joint
  fichier_url   TEXT,           -- chemin Supabase Storage (pas une URL publique)
  fichier_nom   TEXT,
  fichier_type  TEXT CHECK (fichier_type IN ('pdf','image')),
  fichier_taille TEXT,

  -- Métadonnées
  received_at   TIMESTAMPTZ DEFAULT NOW(),
  printed_at    TIMESTAMPTZ,
  printed_by    UUID REFERENCES pharmacie_postes(id),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

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
  user_id       TEXT,           -- id poste ou uid Supabase Auth
  user_role     TEXT,
  poste_nom     TEXT,           -- (déduit) nom du poste vendeur, affiché dans LogsPanel
  action        TEXT NOT NULL,  -- view|print|upload|reopen|login|logout
  ordonnance_id UUID REFERENCES ordonnances(id) ON DELETE SET NULL,
  metadata      JSONB,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_pharmacie
  ON audit_logs(pharmacie_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- ABONNEMENTS & FACTURES (miroir Stripe, alimentés par stripe-webhook)
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
  mrr             INTEGER DEFAULT 0,  -- en euros (pas en centimes malgré le nom historique — voir stripe-webhook)
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS factures (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pharmacie_id    UUID NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
  stripe_invoice_id TEXT UNIQUE NOT NULL,
  numero          TEXT,
  montant_ttc     INTEGER,      -- en centimes (Stripe amount_paid)
  tva             INTEGER,
  statut          TEXT DEFAULT 'draft' CHECK (statut IN ('draft','open','paid','void','uncollectible')),
  pdf_url         TEXT,
  period_start    TIMESTAMPTZ,
  period_end      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- PRICING_PLANS (phase 3, 24/07/2026 — voir migrations/20260724_phase3_pricing.sql)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pricing_plans (
  id            TEXT PRIMARY KEY,           -- "starter" | "standard" | "pro"
  label         TEXT NOT NULL,
  icon          TEXT,
  color         TEXT,
  price         INTEGER NOT NULL DEFAULT 0, -- €/mois
  price_annual  INTEGER NOT NULL DEFAULT 0, -- €/mois facturé annuellement
  max_postes    INTEGER NOT NULL DEFAULT 0,
  max_ordos     INTEGER NOT NULL DEFAULT 0,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- OFFRES PATIENT (contenu marketing affiché en salle d'attente + suivi d'intérêt)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS offres_stories (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pharmacie_id  UUID NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
  actif         BOOLEAN DEFAULT TRUE,
  titre         TEXT,           -- (déduit)
  emoji         TEXT,           -- (déduit)
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Intérêt d'un patient pour une offre — accès anonyme en écriture uniquement
-- (le patient n'est jamais authentifié), lecture réservée à la pharmacie via
-- secure-data depuis la phase 1 (voir §RLS : c'était lisible par n'importe qui).
CREATE TABLE IF NOT EXISTS offre_interets (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pharmacie_id  UUID NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
  code_patient  TEXT NOT NULL,
  date_jour     DATE NOT NULL DEFAULT CURRENT_DATE,
  offre_id      UUID REFERENCES offres_stories(id) ON DELETE SET NULL,
  offre_titre   TEXT,           -- dénormalisé pour affichage (déduit)
  offre_emoji   TEXT,           -- dénormalisé pour affichage (déduit)
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  -- Cible du upsert (PatientPage.jsx onConflict: 'code_patient,offre_id,date_jour') —
  -- voir migrations/20260724_fix_offre_interets_unique.sql pour le correctif appliqué
  -- en production (contrainte absente jusqu'ici, upserts en échec silencieux).
  UNIQUE (code_patient, offre_id, date_jour)
);

-- Suivi métrique des stories — consultation (temps passé) et actions (réponse quiz,
-- intérêt offre). Même modèle d'accès que offre_interets : écriture anonyme (le
-- patient n'est jamais authentifié), lecture réservée à la pharmacie via secure-data.
-- Voir migrations/20260725_story_metrics.sql.
CREATE TABLE IF NOT EXISTS story_metrics (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pharmacie_id  UUID NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
  code_patient  TEXT,
  story_id      TEXT NOT NULL,
  story_type    TEXT,
  event         TEXT NOT NULL,        -- 'view' | 'quiz_answer' | 'offer_interest'
  duree_ms      INTEGER,
  meta          JSONB,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Contenu générique des "stories" patient (conseils santé, quiz) — édité par le
-- backoffice OrdoMail Business (StoriesContentAdmin), pas lié à une pharmacie.
CREATE TABLE IF NOT EXISTS stories_content (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type          TEXT NOT NULL CHECK (type IN ('info','conseil','quiz')),
  titre         TEXT,
  contenu       TEXT,
  emoji         TEXT,
  question      TEXT,           -- si type='quiz'
  reponses      TEXT,           -- si type='quiz' (déduit : format JSON ou séparé par des virgules, à vérifier)
  explication   TEXT,           -- si type='quiz'
  actif         BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Sélection par pharmacie des stories du catalogue global à diffuser à ses
-- patients — absence de ligne = story affichée par défaut. Lecture publique
-- (patient anonyme), écriture uniquement via secure-data (titulaire/vendeur).
-- Voir migrations/20260726_pharmacie_stories_selection.sql.
CREATE TABLE IF NOT EXISTS pharmacie_stories_selection (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pharmacie_id  UUID NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
  story_id      UUID NOT NULL REFERENCES stories_content(id) ON DELETE CASCADE,
  actif         BOOLEAN NOT NULL DEFAULT true,
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (pharmacie_id, story_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- APPELS PATIENT ("sonnette" — appeler un patient dans la file d'attente)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS appels_patient (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pharmacie_id  UUID NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
  code_patient  TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- MÉTRIQUES JOURNALIÈRES (snapshot nocturne, voir edge function snapshot-metriques)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS metriques_journalieres (
  pharmacie_id      UUID NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
  date              DATE NOT NULL,
  ordos_jour        INTEGER DEFAULT 0,
  ordos_semaine     INTEGER DEFAULT 0,
  ordos_mois        INTEGER DEFAULT 0,
  ordos_total       INTEGER DEFAULT 0,
  ordos_attente     INTEGER DEFAULT 0,
  canal_qr_pct      INTEGER DEFAULT 0,
  canal_email_pct   INTEGER DEFAULT 0,
  taux_traitement   INTEGER DEFAULT 0,
  score_activite    INTEGER DEFAULT 0,
  -- Minutes moyennes entre received_at et printed_at (ordonnances imprimées,
  -- 30 derniers jours) — voir migrations/20260725_temps_traitement.sql
  delai_moyen_min INTEGER DEFAULT 0,
  PRIMARY KEY (pharmacie_id, date)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- ADMINISTRATEURS ORDOMAIL BUSINESS (backoffice interne, distinct des titulaires)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ordomail_admins (
  email         TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,   -- bcrypt
  nom           TEXT,
  role          TEXT DEFAULT 'admin',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Fonction de vérification bcrypt côté SQL (variante utilisée par une des deux
-- versions de verify-admin — voir supabase/functions/verify-admin/verify-admin.ts,
-- non déployée, à supprimer en phase 2 avec le reste du nettoyage).
CREATE OR REPLACE FUNCTION check_admin_password(p_hash TEXT, p_password TEXT)
RETURNS BOOLEAN AS $$
  SELECT p_hash = crypt(p_password, p_hash);
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- ─────────────────────────────────────────────────────────────────────────────
-- LIMITATION DE DÉBIT (phase 1, 23/07/2026)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pin_verification_attempts (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pharmacie_id UUID NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pin_attempts_pharmacie_date
  ON pin_verification_attempts(pharmacie_id, created_at DESC);

CREATE TABLE IF NOT EXISTS submission_log (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pharmacie_id UUID NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_submission_log_pharmacie_date
  ON submission_log(pharmacie_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
--
-- État courant après la migration phase 1 (supabase/migrations/20260723_phase1_security.sql) :
--   - `ordonnances`, `pharmacie_postes` : aucune policy pour `anon`, uniquement
--     `authenticated` scopé à sa propre pharmacie. Toute lecture/écriture publique
--     (vendeur PIN, patient) passe par l'edge function secure-data (clé de service,
--     appelant vérifié dans le code, pas par RLS).
--   - `pharmacies` : lecture ouverte à `anon` mais restreinte par GRANT à un sous-
--     ensemble de colonnes non sensibles (id, nom, couleur, code_vendeur,
--     email_reception, sonnette_active, plan) ; écriture réservée au titulaire.
--   - `offre_interets`, `story_metrics` : écriture ouverte à `anon` (le patient
--     n'est jamais authentifié), lecture réservée au titulaire (ou à secure-data
--     via clé de service pour le vendeur).
--   - `pharmacie_stories_selection` : lecture ouverte à `anon` (booléens actif/
--     inactif par story, aucune donnée sensible — nécessaire pour que le patient
--     sache quelles stories exclure), écriture uniquement via secure-data.
--   - `pricing_plans`, `pin_verification_attempts`, `submission_log` : aucune
--     policy anon/authenticated — accès uniquement via clé de service (edge
--     functions), RLS forcée pour empêcher tout accès direct.
--
-- Détail complet et script exécutable : supabase/migrations/20260723_phase1_security.sql
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE pharmacies               ENABLE ROW LEVEL SECURITY;
ALTER TABLE pharmacie_postes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE pharmacie_users          ENABLE ROW LEVEL SECURITY;
ALTER TABLE ordonnances              ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs               ENABLE ROW LEVEL SECURITY;
ALTER TABLE abonnements              ENABLE ROW LEVEL SECURITY;
ALTER TABLE factures                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE offre_interets           ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_plans            ENABLE ROW LEVEL SECURITY;
ALTER TABLE story_metrics            ENABLE ROW LEVEL SECURITY;
ALTER TABLE pharmacie_stories_selection ENABLE ROW LEVEL SECURITY;

-- Fonction helper : pharmacie de l'utilisateur Supabase Auth connecté (titulaire uniquement)
CREATE OR REPLACE FUNCTION get_user_pharmacie_id()
RETURNS UUID AS $$
  SELECT pharmacie_id FROM pharmacie_users WHERE id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Voir supabase/migrations/20260723_phase1_security.sql pour les policies exactes
-- (ce fichier ne les redéfinit pas pour éviter toute divergence — source unique
-- de vérité = la migration, appliquée manuellement).

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
-- REALTIME
-- ─────────────────────────────────────────────────────────────────────────────
BEGIN;
  DROP PUBLICATION IF EXISTS supabase_realtime;
  CREATE PUBLICATION supabase_realtime FOR TABLE ordonnances, audit_logs;
COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- STORAGE BUCKETS (à créer/vérifier via dashboard Supabase — policies non
-- auditées dans les phases 1-3, voir DEPLOIEMENT_PHASE1.md "limites connues")
-- ─────────────────────────────────────────────────────────────────────────────
-- Bucket: ordonnances-files (privé)
--   Dossier: {pharmacie_id}/{ordonnance_id}/
--   Accès prévu : via signed URLs (getSignedUrl, 5-60 min selon l'usage)
-- Bucket: logos-pharmacies (public)
--   Dossier: {pharmacie_id}/
