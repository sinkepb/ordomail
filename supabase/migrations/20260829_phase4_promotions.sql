-- Phase 4 tarification : système de promotions configurable (§6-9, §12, §18
-- du brief) — "Founding Pharmacies" est la première instance, pas un cas
-- codé en dur : l'admin peut créer/activer/désactiver d'autres promotions
-- plus tard sans déploiement.

CREATE TABLE IF NOT EXISTS promotions (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nom                  TEXT NOT NULL,
  actif                BOOLEAN NOT NULL DEFAULT false,
  plans                TEXT[] NOT NULL DEFAULT '{}',       -- ex: {starter,standard,pro}
  prix_promo_monthly   JSONB NOT NULL DEFAULT '{}',         -- {"starter":29,"standard":49,"pro":69}
  prix_promo_annual    JSONB NOT NULL DEFAULT '{}',         -- totaux annuels, même forme
  duree_garantie_mois  INTEGER NOT NULL DEFAULT 24,
  max_pharmacies       INTEGER,                             -- NULL = illimité
  slots_used           INTEGER NOT NULL DEFAULT 0,           -- compteur atomique, voir claim_promotion_slot()
  date_debut           TIMESTAMPTZ,
  date_fin             TIMESTAMPTZ,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- Un Price Stripe par (promotion, plan, intervalle) — contrairement au kit
-- matériel (Phase 3, price_data dynamique), le prix promo est stable dans le
-- temps pour une promotion donnée : un vrai Price Stripe pré-créé permet de
-- le retrouver de façon fiable dans les rapports Stripe et les webhooks.
CREATE TABLE IF NOT EXISTS promotion_stripe_prices (
  promotion_id      UUID NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  plan_id           TEXT NOT NULL,
  billing_interval  TEXT NOT NULL CHECK (billing_interval IN ('monthly', 'annual')),
  stripe_price_id   TEXT NOT NULL,
  PRIMARY KEY (promotion_id, plan_id, billing_interval)
);

-- Une pharmacie n'occupe une place QUE si cette ligne existe — créée
-- uniquement par le webhook Stripe (customer.subscription.created), jamais à
-- la création du compte ni au démarrage du Checkout (§8 : "utilisateur crée
-- son compte mais ne paie pas" / "démarre Stripe Checkout mais abandonne" ne
-- doivent jamais consommer de place).
CREATE TABLE IF NOT EXISTS promotion_redemptions (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  promotion_id           UUID NOT NULL REFERENCES promotions(id),
  pharmacie_id           UUID NOT NULL REFERENCES pharmacies(id),
  plan_id                TEXT NOT NULL,
  billing_interval       TEXT NOT NULL,
  prix_garanti           NUMERIC NOT NULL,
  garanti_jusqua         TIMESTAMPTZ NOT NULL,
  stripe_subscription_id TEXT,
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (pharmacie_id, promotion_id)
);

-- Dénormalisé sur pharmacies pour un affichage simple (page Compte/Abonnement,
-- Phase 5) sans jointure — mis à jour uniquement en même temps qu'une ligne
-- promotion_redemptions est créée.
ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS promotion_id     UUID REFERENCES promotions(id);
ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS prix_garanti     NUMERIC;
ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS garanti_jusqua   TIMESTAMPTZ;

ALTER TABLE promotions              ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotion_stripe_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotion_redemptions   ENABLE ROW LEVEL SECURITY;

-- Réservation atomique d'une place — un seul UPDATE, verrouillage de ligne
-- Postgres standard : deux appels concurrents pour la DERNIÈRE place ne
-- peuvent jamais tous les deux réussir (§8 : "empêcher deux pharmacies de
-- bénéficier simultanément de la dernière place disponible"). Renvoie true
-- si la place a été prise, false si la promotion est pleine/inactive —
-- jamais d'exception, l'appelant décide quoi faire (voir stripe-webhook :
-- le paiement reste honoré même si la place n'a pas pu être comptée, avec
-- une alerte pour revue manuelle).
CREATE OR REPLACE FUNCTION claim_promotion_slot(p_promotion_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE
  v_claimed BOOLEAN;
BEGIN
  UPDATE promotions
  SET slots_used = slots_used + 1, updated_at = now()
  WHERE id = p_promotion_id
    AND actif = true
    AND (max_pharmacies IS NULL OR slots_used < max_pharmacies)
  RETURNING true INTO v_claimed;
  RETURN COALESCE(v_claimed, false);
END;
$$;
