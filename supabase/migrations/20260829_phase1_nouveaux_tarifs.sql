-- Phase 1 du chantier tarification (mission "nouveau système de tarification") :
-- nouveaux prix officiels + nouveaux libellés commerciaux. Les identifiants
-- techniques (starter/standard/pro) sont volontairement conservés (décision
-- explicite) — seuls label/price/price_annual changent.
--
-- @conformite price_annual change de SIGNIFICATION ici : jusqu'ici un tarif
-- MENSUEL équivalent (facturé ×12 sur Stripe) ; devient le TOTAL ANNUEL réel
-- facturé une fois par an (39×10=390, 59×10=590, 89×10=890 — "10 mois payés
-- pour 12 mois d'usage", 2 mois offerts). Tout code lisant price_annual doit
-- refléter ce nouveau sens (voir BillingModule.jsx, PricingEditor.jsx).
UPDATE pricing_plans SET label='Essentiel',   price=39, price_annual=390, max_postes=3,   updated_at=now() WHERE id='starter';
UPDATE pricing_plans SET label='Fluidité',    price=59, price_annual=590, max_postes=10,  updated_at=now() WHERE id='standard';
UPDATE pricing_plans SET label='Performance', price=89, price_annual=890, max_postes=999, updated_at=now() WHERE id='pro';
