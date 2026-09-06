-- OrdoMail — mode "interface unicouleur" pour les cartes ordonnance
-- (06/09/2026, retour direct : "certains n'aiment pas le foisonnement de
-- couleur"). Par defaut chaque ordonnance recoit une teinte differente
-- (ORDO_ACCENTS, purement decorative, voir src/lib/utils.js) ; une pharmacie
-- peut desormais figer cette teinte sur une seule des presets proposes
-- (ACCENT_PRESETS, meme fichier) plutot qu'un choix libre — ces couleurs sont
-- validees pour rester lisibles en bandeau + avatar.
ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS accent_unique TEXT DEFAULT NULL;

ALTER TABLE pharmacies DROP CONSTRAINT IF EXISTS pharmacies_accent_unique_check;
ALTER TABLE pharmacies ADD CONSTRAINT pharmacies_accent_unique_check
  CHECK (accent_unique IS NULL OR accent_unique IN ('ardoise','marine','foret','bordeaux','prune','ambre'));
