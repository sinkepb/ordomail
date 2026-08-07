-- ═══════════════════════════════════════════════════════════════════════════════
-- ORDOMAIL — Créer audit_logs + policies RLS — 08/08/2026
--
-- ⚠️ Découverte en exécutant cette migration : la table audit_logs n'existe pas
-- du tout dans le projet Supabase lié (ERREUR 42P01 relation "audit_logs" does
-- not exist). Elle n'est définie que dans schema.sql, qui sert de référence de
-- lecture et n'est jamais rejoué tel quel contre le projet (voir
-- DEPLOIEMENT_CHECKLIST.md § 3) — aucune migration datée ne la crée. Conclusion
-- réelle : le Journal d'activité n'a JAMAIS fonctionné, depuis le tout début,
-- pas seulement depuis l'activation de RLS phase 1 comme supposé dans la
-- version précédente de cette migration. addAuditLog()/getAuditLogs()
-- échouaient silencieusement (table introuvable), avalé par .catch(()=>{}).
--
-- Cette version crée la table (IF NOT EXISTS, fidèle à schema.sql) puis les
-- policies RLS qui lui manquaient de toute façon.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

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

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;

-- INSERT : ouvert à anon (vendeur — jamais de session Supabase Auth, jeton signé
-- par verify-pin uniquement) ET authenticated (titulaire). Même modèle que
-- story_metrics / offre_interets / appels_patient (voir 20260723_phase1_security.sql
-- et son commentaire "connu et accepté") : donnée opérationnelle non sensible
-- (pas de PII médical — action, pharmacie_id, poste, référence ordonnance), pas
-- de vérification cryptographique possible côté vendeur sans passer par une edge
-- function dédiée. Risque résiduel : un acteur connaissant l'API REST publique
-- pourrait polluer le journal d'une autre pharmacie avec de fausses entrées —
-- gênant, pas une fuite de données de santé.
DROP POLICY IF EXISTS "audit_logs_insert" ON audit_logs;
CREATE POLICY "audit_logs_insert" ON audit_logs
  FOR INSERT
  WITH CHECK (true);

-- SELECT : réservé aux titulaires authentifiés, scopé à LEUR PROPRE pharmacie.
-- LogsPanel n'est de toute façon affiché qu'au titulaire côté client (canAdmin,
-- voir Dashboard.jsx) — cette policy fait respecter la même restriction côté
-- serveur plutôt que de compter uniquement sur le filtrage client.
DROP POLICY IF EXISTS "audit_logs_select_own_pharmacie" ON audit_logs;
CREATE POLICY "audit_logs_select_own_pharmacie" ON audit_logs
  FOR SELECT
  TO authenticated
  USING (pharmacie_id = get_user_pharmacie_id());

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Vérification manuelle recommandée après exécution :
--   - Se connecter comme vendeur (PIN), consulter/imprimer une ordonnance,
--     vérifier côté titulaire que l'entrée apparaît dans le Journal d'activité.
--   - supabase db advisors --linked ne doit pas signaler de nouvelle policy trop
--     permissive de façon inattendue (l'INSERT WITH CHECK(true) est volontaire,
--     documenté ci-dessus, cohérent avec le reste du schéma).
-- ─────────────────────────────────────────────────────────────────────────────
