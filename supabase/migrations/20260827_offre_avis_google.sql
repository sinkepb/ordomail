-- Offre "Avis Google" : invite le patient à laisser un avis sur la fiche
-- Google du pharmacien via un lien qu'il renseigne à la création.
ALTER TABLE offres_stories ADD COLUMN IF NOT EXISTS lien_url TEXT;

ALTER TABLE offres_stories DROP CONSTRAINT IF EXISTS offres_stories_type_check;
ALTER TABLE offres_stories ADD CONSTRAINT offres_stories_type_check
  CHECK (type = ANY (ARRAY['promo'::text, 'service'::text, 'fidelite'::text, 'avis_google'::text]));
