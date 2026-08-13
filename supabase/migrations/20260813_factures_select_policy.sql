-- ═══════════════════════════════════════════════════════════════════════════════
-- ORDOMAIL — Policy SELECT manquante sur factures — 13/08/2026
--
-- factures a RLS activée depuis toujours (schema.sql) mais AUCUNE policy —
-- même défaut que audit_logs (20260808) : RLS + zéro policy = deny-all pour
-- anon/authenticated, seul service_role (edge functions) peut lire. Résultat :
-- fetchFactures() (src/lib/supabase/billing.js) n'a jamais pu retourner la
-- moindre ligne au titulaire, ce qui explique pourquoi CompteSection.jsx a
-- toujours affiché des factures fictives codées en dur (amount:plan.price)
-- au lieu des vraies lignes de la table factures (alimentée par stripe-webhook
-- avec le montant RÉELLEMENT facturé à l'époque — donc jamais réécrit
-- rétroactivement par un changement de plan ultérieur, contrairement au mock).
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE factures FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "factures_select_own_pharmacie" ON factures;
CREATE POLICY "factures_select_own_pharmacie" ON factures
  FOR SELECT
  TO authenticated
  USING (pharmacie_id = get_user_pharmacie_id());

COMMIT;
