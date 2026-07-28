-- ═══════════════════════════════════════════════════════════════════════════════
-- ORDOMAIL — Correctifs issus de la vérification live Supabase (26/07/2026)
-- (supabase db advisors --linked, exécuté en direct contre le projet de prod)
--
-- Déjà appliqué en direct sur le projet lié via `supabase db query` (accès CLI
-- confirmé) — ce fichier documente le changement pour l'historique du dépôt et
-- pour qu'un futur `supabase db diff` reste cohérent avec l'état réel.
--
-- 1) pin_verification_attempts et submission_log : tables PostgREST-exposées
--    SANS RLS, avec anon en SELECT/INSERT/UPDATE/DELETE/TRUNCATE complet.
--    Ces deux tables ne servent QUE de compteurs de limitation de débit internes
--    (verify-pin, submit-ordonnance), toujours lus/écrits via la clé service_role
--    (qui bypass RLS) — jamais par le client. Avec anon en accès complet et sans
--    RLS, n'importe qui pouvait DELETE/TRUNCATE ces tables via l'API REST pour
--    réinitialiser à volonté la limitation de débit (brute-force PIN vendeur /
--    spam submit-ordonnance), rendant inopérants les correctifs des tâches
--    "Sécuriser verify-pin" et "Protéger submit-ordonnance".
--
-- 2) verify_admin_login / verify_admin_password / check_admin_password :
--    fonctions SECURITY DEFINER appelables directement via
--    /rest/v1/rpc/verify_admin_login par anon ET authenticated, sans aucune
--    limitation de débit (contrairement à l'edge function verify-admin qui,
--    elle, applique bcrypt + rate limit). Un attaquant pouvait bypasser
--    entièrement cette protection en appelant le RPC SQL directement pour
--    brute-forcer les identifiants admin.
--
-- 3) get_user_pharmacie_id() : conservé pour `authenticated` (utilisé par la
--    policy RLS pharmacie_owns_offres sur offres_stories, appelée par le
--    dashboard titulaire via le client Supabase direct) mais retiré pour
--    `anon`, qui n'en a jamais l'usage (auth.uid() est toujours NULL côté anon).
--
-- 4) search_path mutable sur les fonctions SECURITY DEFINER — durcissement
--    standard contre le détournement de recherche de schéma.
--
-- 5) offre_interets : deux contraintes UNIQUE strictement identiques sur
--    (code_patient, offre_id, date_jour) coexistaient — l'une auto-nommée
--    (héritée de la définition inline dans schema.sql), l'autre créée
--    explicitement par 20260724_fix_offre_interets_unique.sql. Fonctionnellement
--    redondantes (même colonnes) : on ne garde que celle déjà documentée/
--    référencée par le correctif du 24/07.
--
-- 6) audit_logs : même chose, deux index identiques sur (pharmacie_id, created_at).
--
-- 7) stories_content : RLS activée (FORCE) mais AUCUNE policy présente en base —
--    la policy `stories_public_read_active` de
--    20260725_phase4_security.sql n'a jamais réellement été créée (ou a été
--    supprimée depuis), malgré RLS active. Résultat : plus aucune lecture
--    possible via la clé anon, silencieusement masqué côté client par le
--    fallback try/catch de PatientPage.jsx (retombe sur les stories statiques
--    sans erreur visible) — le catalogue dynamique de conseils santé/quiz était
--    cassé en production sans que personne ne s'en aperçoive. Confirmé et
--    corrigé en direct le 26/07/2026 (policy recréée + GRANT anon/authenticated
--    resserré à SELECT seul), revérifié via un appel REST anon réel.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Verrouiller les tables de rate-limit interne (aucune policy = accès refusé
--    à anon/authenticated ; service_role continue de fonctionner car il bypass RLS).
ALTER TABLE pin_verification_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pin_verification_attempts FORCE ROW LEVEL SECURITY;
ALTER TABLE submission_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE submission_log FORCE ROW LEVEL SECURITY;

REVOKE ALL ON pin_verification_attempts FROM anon, authenticated;
REVOKE ALL ON submission_log FROM anon, authenticated;

-- 2. Empêcher le bypass du rate-limit de verify-admin via RPC SQL direct.
--    ⚠️ Postgres accorde EXECUTE à PUBLIC par défaut à la création d'une fonction :
--    un simple `REVOKE ... FROM anon, authenticated` ne suffit pas tant que PUBLIC
--    conserve le droit (anon/authenticated en héritent via PUBLIC). Il faut révoquer
--    PUBLIC explicitement, puis regranter seulement ce qui est nécessaire.
REVOKE ALL ON FUNCTION verify_admin_login(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION verify_admin_password(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION check_admin_password(text, text) FROM PUBLIC;

-- 3. get_user_pharmacie_id() : retirer pour tout le monde (y compris PUBLIC),
--    puis regranter uniquement à authenticated (utilisé par la policy RLS
--    pharmacie_owns_offres pour le dashboard titulaire — anon n'en a jamais l'usage,
--    auth.uid() y est toujours NULL).
REVOKE ALL ON FUNCTION get_user_pharmacie_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_user_pharmacie_id() TO authenticated;

-- 4. Fixer le search_path des fonctions SECURITY DEFINER restantes.
ALTER FUNCTION get_user_pharmacie_id() SET search_path = public, pg_temp;
ALTER FUNCTION verify_admin_login(text, text) SET search_path = public, pg_temp;
ALTER FUNCTION verify_admin_password(text, text) SET search_path = public, pg_temp;
ALTER FUNCTION check_admin_password(text, text) SET search_path = public, pg_temp;
ALTER FUNCTION update_updated_at() SET search_path = public, pg_temp;

-- 5. Index dupliqué sur offre_interets — on garde la contrainte nommée et
--    documentée par le correctif du 24/07/2026, on retire l'auto-nommée.
ALTER TABLE offre_interets DROP CONSTRAINT IF EXISTS offre_interets_code_patient_offre_id_date_jour_key;

-- 6. Index dupliqué sur audit_logs.
DROP INDEX IF EXISTS idx_audit_logs_pharmacie_date;

-- 7. stories_content : la policy de lecture publique attendue depuis
--    20260725_phase4_security.sql était absente en base malgré RLS active —
--    recréée ici (idempotent), et grants resserrés à SELECT seul pour
--    anon/authenticated (écriture uniquement via secure-data / clé de service).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'stories_content'
      AND policyname = 'stories_public_read_active'
  ) THEN
    CREATE POLICY "stories_public_read_active" ON stories_content
      FOR SELECT
      USING (actif = true);
  END IF;
END $$;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON stories_content FROM anon, authenticated;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Vérification manuelle recommandée après exécution :
--   supabase db advisors --linked
--   -- ne doit plus lister rls_disabled_in_public pour pin_verification_attempts
--   -- ni submission_log, ni les 4 anon_security_definer_function_executable
--   -- concernant verify_admin_login/verify_admin_password/check_admin_password.
-- ─────────────────────────────────────────────────────────────────────────────
