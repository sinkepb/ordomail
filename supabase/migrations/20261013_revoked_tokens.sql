-- OrdoMail — Révocation serveur des jetons internes vendeur/admin (13/10/2026,
-- audit sécurité). Jusqu'ici, un jeton vendeur (8h) ou admin (4h) n'était
-- vérifié que par sa signature et sa date d'expiration : un clic sur
-- "Déconnexion" ne retirait rien à sa validité réelle, et un jeton volé
-- restait pleinement utilisable jusqu'à expiration. Chaque jeton émis porte
-- désormais un identifiant unique (jti, voir _shared/jwt.ts) ; une
-- déconnexion explicite l'ajoute ici, et resolveCaller() refuse tout jeton
-- dont le jti y figure, même signature et expiration valides par ailleurs.
BEGIN;

CREATE TABLE IF NOT EXISTS revoked_tokens (
  jti TEXT PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Accès à l'index seul : pas besoin de parcourir toute la table pour purger
-- les entrées devenues inutiles une fois le jeton expiré de toute façon.
CREATE INDEX IF NOT EXISTS idx_revoked_tokens_expires ON revoked_tokens (expires_at);

ALTER TABLE revoked_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE revoked_tokens FORCE ROW LEVEL SECURITY;
-- Aucune policy : deny-all réel pour anon/authenticated. Seule la clé de
-- service (utilisée par les Edge Functions) y accède, comme offre_reservations.

COMMIT;
