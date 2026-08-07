-- ═══════════════════════════════════════════════════════════════════════════════
-- ORDOMAIL — Policies RLS manquantes sur audit_logs — 08/08/2026
--
-- audit_logs a RLS activée (schema.sql, ALTER TABLE ... ENABLE ROW LEVEL SECURITY)
-- mais AUCUNE policy n'a jamais été créée pour cette table — confirmé par lecture
-- complète de schema.sql et de toutes les migrations : zéro CREATE POLICY sur
-- audit_logs. Avec RLS activée et aucune policy, Postgres refuse tout accès par
-- défaut à tous les rôles non service_role. Résultat concret : depuis l'activation
-- de RLS phase 1 (23/07/2026), addAuditLog() (src/lib/supabase/audit.js, appelée
-- en anon/authenticated, jamais en service_role) échouait SILENCIEUSEMENT à
-- chaque appel — vue/impression/import/connexion/déconnexion/remise en file —
-- pour TOUS les rôles (vendeur ET titulaire), avalé par le .catch(()=>{}) de
-- chaque site d'appel. Le Journal d'activité semblait vide non pas par manque de
-- câblage React (déjà vérifié et corrigé les jours précédents) mais parce que
-- l'écriture elle-même n'a jamais atteint la base.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- INSERT : ouvert à anon (vendeur — jamais de session Supabase Auth, jeton signé
-- par verify-pin uniquement) ET authenticated (titulaire). Même modèle que
-- story_metrics / offre_interets / appels_patient (voir 20260723_phase1_security.sql
-- et son commentaire "connu et accepté") : donnée opérationnelle non sensible
-- (pas de PII médical — action, pharmacie_id, poste, référence ordonnance), pas
-- de vérification cryptographique possible côté vendeur sans passer par une edge
-- function dédiée. Risque résiduel : un acteur connaissant l'API REST publique
-- pourrait polluer le journal d'une autre pharmacie avec de fausses entrées —
-- gênant, pas une fuite de données de santé.
CREATE POLICY "audit_logs_insert" ON audit_logs
  FOR INSERT
  WITH CHECK (true);

-- SELECT : réservé aux titulaires authentifiés, scopé à LEUR PROPRE pharmacie.
-- LogsPanel n'est de toute façon affiché qu'au titulaire côté client (canAdmin,
-- voir Dashboard.jsx) — cette policy fait respecter la même restriction côté
-- serveur plutôt que de compter uniquement sur le filtrage client.
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
