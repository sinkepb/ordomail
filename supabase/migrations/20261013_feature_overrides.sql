-- OrdoMail — Fonctionnalités réglables par pharmacie, depuis le back-office
-- (06/10/2026). Jusqu'ici, seules les fonctionnalités par PLAN existaient
-- (pricing_plans.feature_*, voir _shared/planFeatures.ts) : toutes les
-- pharmacies d'un même plan ont le même comportement. Un colonne JSON
-- générique permet désormais une exception par pharmacie, sans migration à
-- chaque nouvelle fonctionnalité réglable : une entrée ajoutée au catalogue
-- (_shared/featureRegistry.ts côté serveur, lib/featureRegistry.js côté
-- client) suffit. Absence de clé = comportement par défaut du catalogue ;
-- la colonne ne sert qu'à mémoriser les EXCEPTIONS.
BEGIN;

ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS feature_overrides JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMIT;
