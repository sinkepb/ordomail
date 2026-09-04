-- OrdoMail — rappels_ordonnance.token : UUID → TEXT (04/09/2026)
--
-- Un UUID (36 caractères) rend le lien de rappel inutilement long pour un
-- SMS — voir _shared/shortToken.ts pour le détail (encodage UCS-2 dès qu'un
-- accent est présent, limite de segment réduite à 70 caractères). Le token
-- est désormais un court identifiant aléatoire généré côté applicatif
-- (8 caractères, alphabet sans caractères ambigus), plus assez d'entropie
-- pour un lien à usage unique déjà protégé par rate limiting
-- (resolve-rappel, 30 req/5min/IP).
--
-- ALTER ... TYPE TEXT est sans perte : toute valeur UUID existante reste
-- valide telle quelle sous forme de texte. Le défaut est repoussé sur
-- gen_random_uuid()::text par simple filet de sécurité (chaque site
-- d'écriture réel — création, cron, envoi de test — fixe désormais le token
-- explicitement côté applicatif, voir secure-data et rappelLogic.ts).
ALTER TABLE rappels_ordonnance ALTER COLUMN token DROP DEFAULT;
ALTER TABLE rappels_ordonnance ALTER COLUMN token TYPE TEXT USING token::text;
ALTER TABLE rappels_ordonnance ALTER COLUMN token SET DEFAULT gen_random_uuid()::text;
