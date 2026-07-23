-- ═══════════════════════════════════════════════════════════════════════════════
-- ORDOMAIL — Migration phase 3 (24/07/2026) — persistance des tarifs
--
-- À exécuter dans Supabase SQL Editor avant de tester l'onglet "🏷️ Tarifs" du
-- backoffice OrdoMail Business (AdminDashboardLive). Sans cette table, l'éditeur
-- retombe sur les valeurs par défaut codées dans src/lib/plans.js à chaque
-- chargement (comportement dégradé mais sans erreur — voir le catch dans
-- PricingEditor).
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS pricing_plans (
  id          TEXT PRIMARY KEY,           -- "starter" | "standard" | "pro" ...
  label       TEXT NOT NULL,
  icon        TEXT,
  color       TEXT,
  price       INTEGER NOT NULL DEFAULT 0, -- €/mois
  price_annual INTEGER NOT NULL DEFAULT 0,-- €/mois facturé annuellement
  max_postes  INTEGER NOT NULL DEFAULT 0,
  max_ordos   INTEGER NOT NULL DEFAULT 0,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Seed initial depuis les valeurs actuellement codées en dur dans lib/plans.js —
-- à ajuster si ces valeurs ont divergé depuis.
INSERT INTO pricing_plans (id, label, icon, color, price, price_annual, max_postes, max_ordos, sort_order)
VALUES
  ('starter',  'Starter',  '🌱', '#0369a1', 19, 15, 2,   200,   0),
  ('standard', 'Standard', '⭐', '#1a3a6e', 39, 31, 5,   1000,  1),
  ('pro',      'Pro',      '🏥', '#4c1d95', 79, 63, 999, 99999, 2)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE pricing_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_plans FORCE ROW LEVEL SECURITY;

-- Aucune policy anon ni authenticated : cette table n'est lue/écrite que par
-- l'edge function secure-data (resource=admin_pricing / admin_update_pricing),
-- via la clé de service, après vérification du jeton admin.

COMMIT;
