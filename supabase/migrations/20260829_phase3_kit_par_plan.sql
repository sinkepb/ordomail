-- Phase 3 tarification : le kit matériel dépend du plan ET de l'intervalle
-- de facturation (§17 du brief) — remplace kit_materiel_settings (réglage
-- unique global, insuffisant : Essentiel n'a jamais de kit offert, Fluidité
-- l'offre seulement en annuel, Performance a un kit "premium" distinct).
-- kit_materiel_settings n'est pas supprimée (aucune destruction de données)
-- mais n'est plus lue par le code applicatif après cette phase.
CREATE TABLE IF NOT EXISTS kit_materiel_rules (
  plan_id          TEXT NOT NULL REFERENCES pricing_plans(id),
  billing_interval TEXT NOT NULL CHECK (billing_interval IN ('monthly', 'annual')),
  label            TEXT NOT NULL DEFAULT 'Kit matériel',
  contenu          TEXT,
  prix             NUMERIC NOT NULL DEFAULT 0,
  offert           BOOLEAN NOT NULL DEFAULT false,
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (plan_id, billing_interval)
);

ALTER TABLE kit_materiel_rules ENABLE ROW LEVEL SECURITY;

INSERT INTO kit_materiel_rules (plan_id, billing_interval, label, contenu, prix, offert) VALUES
  ('starter',  'monthly', 'Kit matériel',         '3 stickers sol, 3 supports panneau acrylique, 1 présentoir plexiglas 1m', 49, false),
  ('starter',  'annual',  'Kit matériel',         '3 stickers sol, 3 supports panneau acrylique, 1 présentoir plexiglas 1m', 49, false),
  ('standard', 'monthly', 'Kit QR Code',          '3 stickers sol, 3 supports panneau acrylique, 1 présentoir plexiglas 1m', 49, false),
  ('standard', 'annual',  'Kit QR Code',          '3 stickers sol, 3 supports panneau acrylique, 1 présentoir plexiglas 1m', 49, true),
  -- @a-trancher (brief §17) : comportement Performance/mensuel volontairement
  -- laissé à la configuration commerciale — 99€ optionnel posé comme repli
  -- raisonnable, éditable en backoffice sans redéploiement.
  ('pro',      'monthly', 'Kit matériel premium', '3 stickers sol, 3 supports panneau acrylique, 1 présentoir plexiglas 1m premium', 99, false),
  ('pro',      'annual',  'Kit matériel premium', '3 stickers sol, 3 supports panneau acrylique, 1 présentoir plexiglas 1m premium', 99, true)
ON CONFLICT (plan_id, billing_interval) DO NOTHING;
