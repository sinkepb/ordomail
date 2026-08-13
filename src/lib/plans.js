// ─── Définition des plans et logique d'upgrade ───────────────────────────────

export const PLAN_LIMITS = {
  starter:  { id:"starter",  maxPostes: 2,   maxOrdos: 200,   label:"Starter",  price:19,  priceAnnual:15, icon:"🌱", color:"#0369a1", offresStories: true },
  standard: { id:"standard", maxPostes: 5,   maxOrdos: 1000,  label:"Standard", price:39,  priceAnnual:31, icon:"⭐", color:"#1a3a6e", offresStories: true },
  pro:      { id:"pro",      maxPostes: 15,  maxOrdos: 99999, label:"Pro",       price:79,  priceAnnual:63, icon:"🏥", color:"#4c1d95", offresStories: true },
  premium:  { id:"premium",  maxPostes: 999, maxOrdos: 99999, label:"Premium",   price:119, priceAnnual:95, icon:"💎", color:"#b45309", offresStories: true },
};

export const PLAN_ORDER = ["starter","standard","pro","premium"];

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
