-- OrdoMail — QR codes pré-imprimés (18/08/2026)
--
-- Stock de QR codes générés à l'avance (imprimés sur des goodies physiques
-- avant même qu'une pharmacie n'existe), associés manuellement par le staff
-- à une pharmacie au moment de l'envoi postal — voir secure-data-admin
-- (admin_qrcodes_generate/list/assign) et la nouvelle fonction publique
-- resolve-qr-code (résolution ?qr=<token> → {pharmacie_id, qr_token} pour
-- le parcours patient existant).
--
-- `code`  = identifiant court lisible, imprimé sur le goodie, tapé par le
--           staff pour l'association (jamais transmis au patient).
-- `token` = secret long porté par l'URL scannée par le patient, distinct de
--           `code` pour qu'un identifiant devinable/énuméré ne donne pas
--           directement accès à la page de dépôt d'une pharmacie.
--
-- Même régime RLS que pricing_plans/pin_verification_attempts : RLS forcée,
-- aucune policy anon/authenticated — accès exclusivement via clé de service
-- depuis les edge functions.

CREATE TABLE IF NOT EXISTS qr_codes (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code          TEXT UNIQUE NOT NULL,
  token         TEXT UNIQUE NOT NULL,
  status        TEXT NOT NULL DEFAULT 'genere' CHECK (status IN ('genere','attribue')),
  pharmacie_id  UUID REFERENCES pharmacies(id) ON DELETE SET NULL,
  batch_label   TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  assigned_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_qr_codes_status    ON qr_codes(status);
CREATE INDEX IF NOT EXISTS idx_qr_codes_pharmacie ON qr_codes(pharmacie_id);

ALTER TABLE qr_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE qr_codes FORCE ROW LEVEL SECURITY;
