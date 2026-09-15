-- OrdoMail — Spécialité/type d'ordonnance sur les rappels de renouvellement
-- (15/09/2026, complète medecin_prescripteur ajouté le même jour) — un
-- patient avec plusieurs rappels actifs (ex. généraliste + dentiste) peut
-- ainsi être renseigné par catégorie, en plus ou à la place du nom du
-- médecin. Liste fermée côté frontend (RappelsSection.jsx) avec repli
-- "Autre" en texte libre — colonne texte simple ici, pas d'enum Postgres
-- pour ne pas exiger une migration à chaque nouvelle spécialité ajoutée.
ALTER TABLE rappels_ordonnance ADD COLUMN IF NOT EXISTS specialite TEXT;
