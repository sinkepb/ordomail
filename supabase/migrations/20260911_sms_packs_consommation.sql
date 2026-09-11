-- OrdoMail — Packs SMS supplémentaires pour les rappels (11/09/2026)
--
-- Le plan Performance inclut 200 SMS/mois (voir SMS_INCLUS_MENSUEL,
-- src/lib/plans.js) dans son abonnement. Au-delà, la pharmacie achète des
-- packs de 100 SMS à 10 € TTC (paiement Stripe one-time, voir
-- secure-data:sms_acheter_pack et stripe-webhook — checkout.session.completed
-- en mode "payment"). Cette table trace chaque pack réellement payé — la
-- consommation elle-même (SMS envoyés) se lit depuis rappels_evenements
-- (type='sms_envoye', déjà en place), jamais dupliquée ici.
--
-- Même modèle d'accès que factures/abonnements : RLS active, aucune policy
-- anon/authenticated — lecture uniquement via secure-data (pharmacien,
-- sa propre pharmacie) ou secure-data-admin (backoffice), écriture
-- uniquement par stripe-webhook (rôle de service) à la confirmation du
-- paiement.
CREATE TABLE IF NOT EXISTS sms_packs_achetes (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacie_id              UUID NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
  quantite                  INTEGER NOT NULL DEFAULT 100 CHECK (quantite > 0),
  prix_paye_ttc             INTEGER NOT NULL, -- en centimes (1000 = 10,00 €)
  stripe_checkout_session_id TEXT UNIQUE NOT NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Backoffice (liste par pharmacie) et calcul de quota (packs du mois courant).
CREATE INDEX IF NOT EXISTS idx_sms_packs_pharmacie ON sms_packs_achetes (pharmacie_id, created_at);

ALTER TABLE sms_packs_achetes ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_packs_achetes FORCE ROW LEVEL SECURITY;
REVOKE ALL ON sms_packs_achetes FROM anon, authenticated;
