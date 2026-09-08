-- OrdoMail — Créneau de retrait à la confirmation d'un rappel (08/09/2026).
--
-- Le patient qui confirme "tout renouveler" ou "renouvellement partiel"
-- indique désormais quand il pense passer le récupérer — une indication
-- large (pas un vrai système de réservation de capacité), pour aider le
-- pharmacien à prioriser/préparer avant l'arrivée du patient. Optionnel :
-- laissé à NULL si le patient ne le renseigne pas (parcours existant avant
-- cette date, ou "ne rien prendre" qui n'a pas de retrait à planifier).
ALTER TABLE rappels_ordonnance ADD COLUMN IF NOT EXISTS creneau_retrait TEXT;
ALTER TABLE rappels_ordonnance DROP CONSTRAINT IF EXISTS rappels_ordonnance_creneau_retrait_check;
ALTER TABLE rappels_ordonnance ADD CONSTRAINT rappels_ordonnance_creneau_retrait_check
  CHECK (creneau_retrait IS NULL OR creneau_retrait IN ('ce_matin', 'cet_apres_midi', 'demain_matin', 'demain_apres_midi'));
