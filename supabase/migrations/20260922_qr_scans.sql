-- OrdoMail — Journal des scans de QR code (22/09/2026)
--
-- Demande titulaire : statistiques jour/semaine/mois de scans de QR code par
-- pharmacie. Jusqu'ici, aucun évènement n'était écrit entre le scan d'un QR
-- (goodie pré-imprimé ?qr=<token>, ou affiche self-service ?patient=<id>)
-- et un dépôt d'ordonnance effectivement soumis — un scan qui n'aboutit pas
-- à un dépôt était totalement invisible. Voir la nouvelle fonction publique
-- log-qr-scan (appelée en fire-and-forget par App.jsx juste après la
-- résolution du QR, avant même que la page de dépôt ne s'affiche).
--
-- `source` distingue les deux parcours QR existants (voir App.jsx) : le
-- goodie pré-imprimé résolu via resolve-qr-code (qr_codes.token) d'une part,
-- l'affiche self-service imprimée depuis le dashboard pharmacie
-- (pharmacies.qr_token, lien ?patient=<id>&t=<token>) d'autre part — utile
-- pour distinguer plus tard l'efficacité des deux supports si besoin, mais
-- non exploité pour l'instant (les stats agrégées additionnent les deux).
--
-- Même régime RLS que qr_codes/pin_verification_attempts : RLS forcée,
-- aucune policy anon/authenticated — accès exclusivement via clé de service
-- depuis les edge functions (écriture par log-qr-scan, lecture par
-- secure-data-admin).
CREATE TABLE IF NOT EXISTS qr_scans (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pharmacie_id  UUID NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
  source        TEXT NOT NULL DEFAULT 'qr_code' CHECK (source IN ('qr_code','affiche')),
  scanned_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qr_scans_pharmacie_date ON qr_scans(pharmacie_id, scanned_at);

ALTER TABLE qr_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE qr_scans FORCE ROW LEVEL SECURITY;
