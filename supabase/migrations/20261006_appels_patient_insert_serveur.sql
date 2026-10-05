-- OrdoMail — la sonnette passe par secure-data (resource appeler_patient) :
-- l'insertion et la diffusion Realtime sont faites côté serveur pour un
-- appelant authentifié. L'INSERT anonyme ouvert par 20261817 n'est plus utile
-- et permettait d'enregistrer de faux appels pour n'importe quelle pharmacie.

BEGIN;

DROP POLICY IF EXISTS "appels_patient_insert" ON appels_patient;

COMMIT;
