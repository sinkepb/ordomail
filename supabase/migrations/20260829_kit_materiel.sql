-- Kit matériel envoyé à l'inscription (3 stickers sol, 3 supports panneau
-- acrylique, 1 présentoir plexiglas 1m) — prix et politique "offert si
-- engagement annuel" paramétrables en backoffice (onglet Tarifs).
CREATE TABLE IF NOT EXISTS kit_materiel_settings (
  id                UUID PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000001',
  prix              NUMERIC NOT NULL DEFAULT 149,
  offert_si_annuel  BOOLEAN NOT NULL DEFAULT true,
  actif             BOOLEAN NOT NULL DEFAULT true,
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO kit_materiel_settings (id) VALUES ('00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- RLS activée sans policy : lecture publique via get-pricing (service_role),
-- écriture via secure-data-admin (jeton admin) — même schéma que
-- pricing_plans.
ALTER TABLE kit_materiel_settings ENABLE ROW LEVEL SECURITY;
