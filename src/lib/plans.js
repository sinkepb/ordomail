// ─── Définition des plans et logique d'upgrade ───────────────────────────────

// priceAnnual = équivalent mensuel affiché quand l'annuel est sélectionné —
// 19/08/2026 : passage de -20% (chiffre arbitraire, sans tarif Stripe réel
// derrière) à "11 mois facturés = 12 mois de service" (1 mois offert),
// aligné sur les Price Stripe price_{plan}_annual réellement créés
// (montant exact facturé une fois par an = price × 11 ; voir
// create-checkout-session/_shared/checkout.ts buildLookupKey).
export const PLAN_LIMITS = {
  starter:  { id:"starter",  maxPostes: 2,   maxOrdos: 200,   label:"Starter",  price:19,  priceAnnual:17, icon:"🌱", color:"#0369a1", offresStories: true },
  standard: { id:"standard", maxPostes: 5,   maxOrdos: 1000,  label:"Standard", price:39,  priceAnnual:36, icon:"⭐", color:"#1a3a6e", offresStories: true },
  pro:      { id:"pro",      maxPostes: 15,  maxOrdos: 99999, label:"Pro",       price:79,  priceAnnual:72, icon:"🏥", color:"#4c1d95", offresStories: true },
};

// Palier Premium retiré (19/08/2026) — aucun tarif Stripe n'a jamais existé
// pour lui (price_premium_monthly/annual absents), aucun client dessus.
export const PLAN_ORDER = ["starter","standard","pro"];

export function getNextPlan(currentPlan) {
  const idx = PLAN_ORDER.indexOf(currentPlan);
  return PLAN_ORDER[idx+1] || null;
}

export function getPrevPlan(currentPlan) {
  const idx = PLAN_ORDER.indexOf(currentPlan);
  return idx > 0 ? PLAN_ORDER[idx-1] : null;
}

export function computeImpact(pharmacie, postes, newPlanId) {
  const curr   = PLAN_LIMITS[pharmacie.plan] || PLAN_LIMITS.starter;
  const next   = PLAN_LIMITS[newPlanId]      || PLAN_LIMITS.starter;
  const actifs = (postes || []).filter(p => p.actif).length;
  return {
    curr,
    next,
    isUpgrade:       PLAN_ORDER.indexOf(newPlanId) > PLAN_ORDER.indexOf(pharmacie.plan),
    postesActuels:   actifs,
    postesASusprimer: Math.max(0, actifs - next.maxPostes),
    priceDiff:       next.price - curr.price,
  };
}

export function canAddPoste(plan, postes) {
  const limit = PLAN_LIMITS[plan]?.maxPostes || 2;
  return (postes || []).filter(p => p.actif).length < limit;
}
