-- ═══════════════════════════════════════════════════════════════════════════════
-- ORDOMAIL — Correctif CRITIQUE : fuite de pharmacies à tout compte authentifié
-- 01/10/2026 (audit sécurité)
--
-- "pharmacies_public_lookup" (20260723_phase1_security.sql:148-150) est
-- FOR SELECT USING(true) SANS clause TO — s'applique donc au rôle PUBLIC,
-- c'est-à-dire anon ET authenticated, sans filtrer aucune ligne. La
-- restriction de colonnes du 23/07 (REVOKE/GRANT) n'a jamais porté que sur
-- `anon` ; le correctif du 23/09 (20260923_audit_critiques_rls.sql) a fermé
-- l'UPDATE pour `authenticated` mais jamais le SELECT. Résultat : un titulaire
-- quelconque pouvait lire TOUTES les colonnes de TOUTES les pharmacies via
-- l'API REST directe (email, stripe_customer_id, smtp_pass_enc, qr_token...).
--
-- Correctif : PAS une restriction de colonnes comme pour `anon` (le titulaire
-- a un besoin légitime de lire TOUTE sa propre fiche — voir
-- src/lib/supabase/pharmacies.js:18, .select('*') sur sa propre pharmacieId,
-- utilisé par l'écran Paramètres). Le vrai problème est l'absence de filtre
-- PAR LIGNE pour authenticated. On scope donc la policy "lookup" à `anon`
-- uniquement (seul rôle qui en a besoin : code pharmacie avant PIN vendeur,
-- page patient QR, inscription — toujours avec la liste de colonnes déjà
-- restreinte), et on ajoute une policy dédiée pour authenticated filtrée par
-- get_user_pharmacie_id(), exactement comme pharmacies_titulaire_write
-- (UPDATE) et ordonnances_titulaire_own le font déjà pour ce même rôle.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

DROP POLICY IF EXISTS "pharmacies_public_lookup" ON pharmacies;
CREATE POLICY "pharmacies_public_lookup" ON pharmacies
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "pharmacies_titulaire_read_own" ON pharmacies
  FOR SELECT
  TO authenticated
  USING (id = get_user_pharmacie_id());

COMMIT;
