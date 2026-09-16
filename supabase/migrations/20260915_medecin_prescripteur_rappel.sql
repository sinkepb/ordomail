-- OrdoMail — Nom du médecin prescripteur sur les rappels de renouvellement
-- (15/09/2026). Un même patient peut avoir plusieurs rappels actifs pour des
-- traitements différents (cardiologie, dermatologie…) — le SMS envoyé ne
-- permettait pas de distinguer lequel concerne quoi, ni de confirmer au
-- destinataire (pas forcément le patient lui-même) de quelle ordonnance il
-- s'agit. Champ structuré plutôt que de réutiliser le "commentaire" libre
-- existant : plus fiable pour ce qu'un patient reconnaît généralement
-- ("mon cardiologue" plutôt qu'un texte libre saisi par le pharmacien).
ALTER TABLE rappels_ordonnance ADD COLUMN IF NOT EXISTS medecin_prescripteur TEXT;
