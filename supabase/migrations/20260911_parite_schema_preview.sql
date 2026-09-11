-- Alignement de schéma preview/production suite à l'audit de parité du 11/09/2026.
-- offre_interets.offre_type manquait sur preview (présent sur schema.sql / prod) :
-- toggle-interet écrit cette colonne, son absence cassait la fonction sur preview.
ALTER TABLE offre_interets ADD COLUMN IF NOT EXISTS offre_type text;
