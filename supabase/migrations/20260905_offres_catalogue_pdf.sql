-- OrdoMail — permet de publier des pages de catalogue groupement (PDF) en
-- story image plein écran (05/09/2026).
--
-- Le pharmacien reçoit régulièrement de son groupement un PDF de plusieurs
-- pages (offres promo). Plutôt qu'une extraction automatisée par LLM (coût,
-- fiabilité sur une mise en page en grille — évalué et écarté), chaque page
-- choisie par le pharmacien est simplement rendue en image côté client
-- (pdfAllPagesAsImages, déjà utilisé pour l'impression) puis publiée comme
-- une story à part entière : type 'catalogue', image_url = la page rendue,
-- sans titre/badge/prix (le contenu visuel de la page se suffit à lui-même).
ALTER TABLE offres_stories DROP CONSTRAINT IF EXISTS offres_stories_type_check;
ALTER TABLE offres_stories ADD CONSTRAINT offres_stories_type_check
  CHECK (type = ANY (ARRAY['promo'::text, 'service'::text, 'fidelite'::text, 'avis_google'::text, 'catalogue'::text]));

ALTER TABLE offres_stories DROP CONSTRAINT IF EXISTS offres_stories_created_via_check;
ALTER TABLE offres_stories ADD CONSTRAINT offres_stories_created_via_check
  CHECK (created_via = ANY (ARRAY['pc'::text, 'mobile'::text, 'template'::text, 'pdf'::text]));
