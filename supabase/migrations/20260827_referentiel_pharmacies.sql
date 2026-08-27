-- Référentiel des pharmacies françaises (SIRET/SIREN/adresse) — assistant de
-- saisie à l'inscription (autocomplete "Pharmacie *" dans BillingModule.jsx),
-- pas une contrainte : le titulaire garde la main pour corriger/saisir
-- librement si sa pharmacie n'y figure pas.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS pharmacies_referentiel (
  siret       TEXT PRIMARY KEY,
  siren       TEXT,
  nom         TEXT NOT NULL,
  adresse     TEXT,
  code_postal TEXT,
  commune     TEXT
);

CREATE INDEX IF NOT EXISTS idx_pharmacies_referentiel_nom_trgm
  ON pharmacies_referentiel USING gin (nom gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_pharmacies_referentiel_commune_trgm
  ON pharmacies_referentiel USING gin (commune gin_trgm_ops);

-- RLS activée sans policy : accès exclusivement via l'edge function
-- search-pharmacies-referentiel (service_role) — pas d'exposition directe via
-- l'API REST anon, même si la donnée elle-même est un annuaire public.
ALTER TABLE pharmacies_referentiel ENABLE ROW LEVEL SECURITY;

-- Conserve le SIRET une fois la pharmacie créée (signal de légitimité,
-- pertinent pour un produit qui traite des données de santé).
ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS siret TEXT;
