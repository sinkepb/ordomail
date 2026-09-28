-- Onglet "Gestion" du backoffice (15/09/2026) — pilotage comptable/fiscal/
-- juridique/SaaS. Stockage volontairement générique (une seule table,
-- catégorie + jsonb) plutôt qu'une table par usage : le volume de données
-- réel (quelques dizaines de lignes de registre du personnel/titres, quelques
-- paramètres manuels) ne justifie pas un schéma relationnel dédié, et ça
-- évite une nouvelle migration à chaque champ ajouté par la suite.
--
-- Accès exclusivement via secure-data-admin (service role, résolu isAdmin) —
-- même modèle que `alerts` (voir 20260807_alerts_monitoring.sql) : RLS activée
-- sans policy, aucun accès anon/authenticated, uniquement le service role qui
-- bypass RLS.
CREATE TABLE IF NOT EXISTS gestion_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL CHECK (category IN ('personnel', 'titres', 'depense', 'parametre', 'checklist')),
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gestion_entries_category ON gestion_entries(category);

ALTER TABLE gestion_entries ENABLE ROW LEVEL SECURITY;
