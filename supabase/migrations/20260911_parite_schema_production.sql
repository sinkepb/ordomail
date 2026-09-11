-- Alignement de schéma preview/production suite à l'audit de parité du 11/09/2026.
-- Appliqué uniquement en production (preview était déjà correct) :

-- 1) Table "postes" legacy (avant le renommage en pharmacie_postes), plus
--    référencée par aucun code. La FK ordonnances.printed_by pointait encore
--    dessus au lieu de pharmacie_postes(id) comme le décrit schema.sql.
ALTER TABLE ordonnances DROP CONSTRAINT IF EXISTS ordonnances_printed_by_fkey;
ALTER TABLE ordonnances ADD CONSTRAINT ordonnances_printed_by_fkey
  FOREIGN KEY (printed_by) REFERENCES pharmacie_postes(id);
DROP TABLE IF EXISTS postes;

-- 2) stories_content.reponses était jsonb en production mais le code
--    (StoriesContentAdmin.jsx écrit une chaîne, PatientPage.jsx fait
--    JSON.parse(s.reponses)) attend un text — bug réel en production pour
--    toute story de type quiz.
ALTER TABLE stories_content ALTER COLUMN reponses TYPE text USING reponses::text;
