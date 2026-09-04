-- ═══════════════════════════════════════════════════════════════════════════════
-- ORDOMAIL — Rappels de renouvellement d'ordonnance (relance patient) — 04/09/2026
--
-- Demande d'un pharmacien pilote : créer un rappel (nom/prénom/tél/commentaire)
-- pour un patient. À J+21, un SMS lui est envoyé (adaptateur mock pour l'instant,
-- voir _shared/sms.ts) avec un lien vers une page publique où il choisit une des
-- 3 options (tout renouveler / rien / renouvellement partiel). Le rappel passe
-- alors en "à traiter" (compteur affiché au pharmacien). Quand le pharmacien
-- valide, le cycle repart à J+21 — jusqu'à ce qu'il clique "fin de traitement".
--
-- Cycle de statut : en_attente → sms_envoye → a_traiter → (validé) en_attente
-- [cycle_numero+1] → … → termine (définitif, plus jamais relancé).
--
-- Consentement (RGPD) : consentement_sms doit être coché par le pharmacien à la
-- création (case obligatoire côté UI) — le scan cron ne traite que les lignes
-- où il est vrai, en défense en profondeur (même logique que retention_settings :
-- jamais de traitement de données de santé sur un défaut supposé).
--
-- Même modèle d'accès que les autres tables scopées pharmacie (offres_stories,
-- story_metrics…) : RLS active, aucune policy anon/authenticated — lecture/
-- écriture uniquement via secure-data (pharmacien, jeton vérifié), la fonction
-- publique resolve-rappel (patient, token opaque) ou service_role (cron
-- send-rappel-sms).
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS rappels_ordonnance (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacie_id            UUID NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
  patient_nom             TEXT NOT NULL,
  patient_prenom          TEXT NOT NULL,
  patient_telephone       TEXT NOT NULL,
  commentaire             TEXT,
  consentement_sms        BOOLEAN NOT NULL DEFAULT false,
  statut                  TEXT NOT NULL DEFAULT 'en_attente'
                             CHECK (statut IN ('en_attente','sms_envoye','a_traiter','termine')),
  choix_patient            TEXT CHECK (choix_patient IN ('tout_renouveler','rien','partiel')),
  cycle_numero             INTEGER NOT NULL DEFAULT 1 CHECK (cycle_numero > 0),
  -- Régénéré à chaque cycle (voir rappels_traiter) : un ancien lien SMS ne doit
  -- plus pouvoir enregistrer de réponse une fois le cycle suivant lancé.
  token                    UUID NOT NULL DEFAULT gen_random_uuid(),
  date_prochaine_relance   TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '21 days'),
  date_dernier_sms_envoye  TIMESTAMPTZ,
  date_reponse_patient     TIMESTAMPTZ,
  date_traite              TIMESTAMPTZ,
  created_by               TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Liste "Rappels" du backoffice, filtrée par pharmacie + statut.
CREATE INDEX IF NOT EXISTS idx_rappels_ordonnance_pharmacie ON rappels_ordonnance (pharmacie_id, statut);
-- Scan quotidien du cron : uniquement les lignes en attente, triées par échéance.
CREATE INDEX IF NOT EXISTS idx_rappels_ordonnance_cron_scan ON rappels_ordonnance (statut, date_prochaine_relance) WHERE statut = 'en_attente';
-- Résolution du lien patient (resolve-rappel) par token opaque.
CREATE UNIQUE INDEX IF NOT EXISTS idx_rappels_ordonnance_token ON rappels_ordonnance (token);

ALTER TABLE rappels_ordonnance ENABLE ROW LEVEL SECURITY;
ALTER TABLE rappels_ordonnance FORCE ROW LEVEL SECURITY;
REVOKE ALL ON rappels_ordonnance FROM anon, authenticated;

-- Historique des événements d'un rappel (créé, SMS envoyé, réponse patient,
-- validé, terminé) — traçabilité en cas de litige ("je n'ai jamais reçu le
-- SMS") et base d'un futur écran de détail, sans surcharger la ligne
-- principale de champs "dernier X" pour chaque type d'événement.
CREATE TABLE IF NOT EXISTS rappels_evenements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rappel_id   UUID NOT NULL REFERENCES rappels_ordonnance(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('cree','sms_envoye','sms_echec','reponse_patient','traite','termine')),
  meta        JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rappels_evenements_rappel ON rappels_evenements (rappel_id, created_at);

ALTER TABLE rappels_evenements ENABLE ROW LEVEL SECURITY;
ALTER TABLE rappels_evenements FORCE ROW LEVEL SECURITY;
REVOKE ALL ON rappels_evenements FROM anon, authenticated;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Après exécution : déployer secure-data (nouvelles resources rappels_*),
-- send-rappel-sms et resolve-rappel, puis créer le job pg_cron quotidien
-- (voir DEPLOIEMENT_CHECKLIST.md — même principe que purge-ordonnances,
-- secret partagé RAPPEL_CRON_SECRET) :
--
--   select cron.schedule(
--     'send-rappel-sms', '0 8 * * *',
--     $$ select net.http_post(
--          url:='https://<project-ref>.functions.supabase.co/send-rappel-sms',
--          headers:=jsonb_build_object('x-cron-secret', '<RAPPEL_CRON_SECRET>'),
--          body:='{}'::jsonb
--        ) $$
--   );
-- ─────────────────────────────────────────────────────────────────────────────
