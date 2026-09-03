-- Phase 6 tarification (§13) : un downgrade doit être programmé à la fin de
-- la période de facturation en cours, sans perte immédiate de
-- fonctionnalités — jusqu'ici change-plan appliquait upgrade ET downgrade
-- immédiatement. L'upgrade reste immédiat (comportement correct, inchangé).
ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS plan_pending              TEXT;
ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS plan_pending_billing      TEXT;
ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS plan_pending_effective_at TIMESTAMPTZ;
