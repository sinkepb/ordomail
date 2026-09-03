-- Phase 7 tarification (§18-19) : rien ne trace aujourd'hui qu'une pharmacie a
-- payé le kit matériel (3 stickers sol, 3 supports panneau acrylique, 1
-- présentoir plexiglas 1m) — la demande d'origine de ce chantier ("le package
-- doit être envoyé à la pharmacie") n'a jamais eu de suivi d'expédition
-- concret, seulement le prix/l'option "offert" (Phase 3). checkout.session.
-- completed (stripe-webhook) insère une ligne ici dès que le paiement Stripe
-- confirme un achat de kit (ligne one-time distincte de l'abonnement) —
-- source de vérité pour la file d'expédition backoffice (onglet 📦 Matériel).
CREATE TABLE IF NOT EXISTS kit_commandes (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacie_id                UUID NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
  label                       TEXT NOT NULL,
  prix_paye                   NUMERIC,
  stripe_checkout_session_id  TEXT UNIQUE,
  expedie                     BOOLEAN NOT NULL DEFAULT false,
  expedie_at                  TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Même modèle d'accès que `alerts`/`retention_settings` : aucune policy anon/
-- authenticated — lecture/écriture uniquement via secure-data-admin (jeton
-- admin vérifié) ou service_role (stripe-webhook).
ALTER TABLE kit_commandes ENABLE ROW LEVEL SECURITY;
ALTER TABLE kit_commandes FORCE ROW LEVEL SECURITY;
REVOKE ALL ON kit_commandes FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_kit_commandes_a_expedier ON kit_commandes (expedie, created_at) WHERE NOT expedie;
