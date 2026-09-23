-- ═══════════════════════════════════════════════════════════════════════════════
-- ORDOMAIL — Correctifs des points critiques/élevés de l'audit du 23/09/2026
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. CRITIQUE — pharmacies_titulaire_write autorisait l'UPDATE de TOUTES les
--    colonnes (aucune restriction, contrairement au SELECT anon qui était déjà
--    limité par colonnes ci-dessous). Un titulaire pouvait s'auto-attribuer un
--    plan payant (`update({plan:'pro'})` depuis son navigateur) ou altérer
--    stripe_customer_id/code_vendeur/smtp_pass_enc directement via PostgREST.
--
--    Seules les colonnes réellement écrites par le client authentifié
--    aujourd'hui (voir src/lib/supabase/pharmacies.js:savePharmacie et
--    src/lib/supabase/sonnette.js) restent autorisées. Tout le reste (plan,
--    plan_status, stripe_*, code_vendeur, qr_token, email*, smtp_pass_enc,
--    trial_ends_at, compte_test, titulaire...) ne passe plus que par les edge
--    functions à clé de service (change-plan, update-titulaire,
--    stripe-webhook, etc.), comme c'était déjà l'intention documentée mais
--    jamais appliquée au niveau GRANT.
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE UPDATE ON pharmacies FROM authenticated;
GRANT UPDATE (nom, adresse, siret, couleur, accent_unique, pin_mode, sonnette_active)
  ON pharmacies TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. ÉLEVÉ — offre_interets : policies anon INSERT/UPDATE (USING(true)) jamais
--    retirées après le passage de l'écriture réelle vers toggle-interet (clé
--    de service, 27/07/2026, qui vérifie isValidPatientCode). N'importe qui
--    avec la clé anon publique pouvait insérer/modifier des intérêts patients
--    pour n'importe quelle pharmacie, sans aucune vérification.
--
--    Le test src/lib/supabase/__tests__/rls.live.test.js documentait
--    volontairement ce comportement permissif ("pas un bloqueur en pratique
--    depuis le 27/07") — mis à jour dans le même mouvement que ce correctif
--    pour documenter le nouveau comportement sécurisé, pas l'ancien.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "interets_patient_insert" ON offre_interets;
DROP POLICY IF EXISTS "interets_patient_upsert" ON offre_interets;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. ÉLEVÉ — audit_logs/factures/abonnements en "FOR ALL" (pas "FOR SELECT")
--    laissaient un titulaire modifier/supprimer ses propres entrées de
--    journal d'audit, ou fabriquer ses factures/abonnements directement via
--    PostgREST.
--
--    audit_logs : addAuditLog (src/lib/supabase/audit.js) fait un INSERT
--    direct côté client — fonctionnalité réelle utilisée à chaque
--    connexion/impression/suppression, à préserver. Seul le UPDATE/DELETE
--    (la vraie vulnérabilité : altérer/effacer son propre journal) est
--    retiré. La lecture reste couverte par la policy dédiée déjà existante
--    audit_logs_select_own_pharmacie (20260808).
--
--    factures/abonnements : aucune écriture directe cliente nulle part dans
--    le frontend (uniquement via stripe-webhook, clé de service) — factures
--    a déjà sa policy SELECT dédiée (factures_select_own_pharmacie,
--    20260813) ; abonnements n'en avait pas encore, ajoutée ici.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS logs_own ON audit_logs;
CREATE POLICY "audit_logs_insert_own_pharmacie" ON audit_logs
  FOR INSERT
  WITH CHECK (pharmacie_id = get_user_pharmacie_id());

DROP POLICY IF EXISTS factures_own ON factures;

DROP POLICY IF EXISTS abonnements_own ON abonnements;
CREATE POLICY "abonnements_select_own_pharmacie" ON abonnements
  FOR SELECT
  USING (pharmacie_id = get_user_pharmacie_id());

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. ÉLEVÉ — aucun plafond sur la durée de rétention configurable (seul un
--    minimum > 0 était vérifié) : rien n'empêchait techniquement une valeur
--    du type 99999 jours. Plafond de sécurité à 3650 jours (10 ans) — un
--    garde-fou technique, PAS une durée validée juridiquement : la durée
--    réelle à appliquer reste à confirmer avec le DPO (voir
--    DEPLOIEMENT_CHECKLIST.md), ce correctif empêche seulement une valeur
--    absurde/non bornée d'être enregistrée en attendant.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE retention_settings DROP CONSTRAINT IF EXISTS retention_settings_positive;
ALTER TABLE retention_settings ADD CONSTRAINT retention_settings_positive
  CHECK (ordonnances_retention_days IS NULL OR (ordonnances_retention_days > 0 AND ordonnances_retention_days <= 3650));

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Vérification manuelle recommandée après exécution :
--   -- Doit échouer (permission denied) avec un JWT titulaire réel :
--   -- PATCH .../pharmacies?id=eq.<sa_pharmacie>  { "plan": "pro" }
--   -- Doit toujours réussir avec le même JWT :
--   -- PATCH .../pharmacies?id=eq.<sa_pharmacie>  { "nom": "Nouveau nom" }
--   SELECT tablename, policyname, cmd FROM pg_policies
--   WHERE tablename IN ('offre_interets','audit_logs','factures','abonnements');
-- ─────────────────────────────────────────────────────────────────────────────
