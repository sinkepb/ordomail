-- Comble une lacune trouvée en ajoutant l'onglet "QR code" en libre-service
-- côté pharmacien (14/09/2026) : register-pharmacie n'a jamais renseigné
-- pharmacies.qr_token depuis sa création (seul le backfill ponctuel du
-- 23/07/2026 avait couvert les pharmacies existantes à cette date-là) —
-- 24 pharmacies sur 29 en production s'étaient créées depuis sans jamais
-- recevoir de qr_token, rendant leur lien libre-service (?patient=<id>&t=<qr_token>)
-- non fonctionnel (submit-ordonnance exige qr_token === pharmacies.qr_token).
-- Voir aussi le correctif dans register-pharmacie/index.ts pour les futures inscriptions.
UPDATE pharmacies SET qr_token = encode(gen_random_bytes(16), 'hex') WHERE qr_token IS NULL;
