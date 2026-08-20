-- OrdoMail — empêche deux codes "attribue" pour la même pharmacie (20/08/2026)
--
-- Trouvé par revue de code indépendante lors du ré-audit avant mise en
-- production : admin_qrcodes_assign vérifiait "cette pharmacie a-t-elle déjà
-- un goodie ?" via un SELECT séparé de l'UPDATE qui fait l'attribution — deux
-- appels concurrents (double-clic, deux onglets staff) pouvaient tous les
-- deux lire "non" avant qu'aucun des deux n'ait committé, aboutissant à deux
-- codes "attribue" pour la même pharmacie. Gravité faible (action déjà
-- réservée aux admins), mais corrigible proprement au niveau base : un index
-- unique partiel rend l'UPDATE lui-même atomique — le second appel échoue
-- avec une violation de contrainte (23505) au lieu de réussir silencieusement.

CREATE UNIQUE INDEX IF NOT EXISTS idx_qr_codes_one_attribue_per_pharmacie
  ON qr_codes(pharmacie_id)
  WHERE status = 'attribue';
