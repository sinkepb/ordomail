-- OrdoMail — Fenêtre d'affichage optionnelle pour une story du catalogue
-- (07/09/2026). Permet de programmer une story à l'avance (ex. campagne
-- vaccination antigrippale, octobre-décembre) sans avoir à penser à
-- l'activer/désactiver manuellement à la bonne date. NULL = pas de borne
-- (comportement actuel inchangé pour les stories déjà existantes) — le
-- filtrage réel se fait côté client (PatientPage.jsx), même endroit que le
-- filtre "actif" existant, pas de policy RLS supplémentaire nécessaire.
ALTER TABLE stories_content ADD COLUMN IF NOT EXISTS date_debut DATE;
ALTER TABLE stories_content ADD COLUMN IF NOT EXISTS date_fin DATE;
