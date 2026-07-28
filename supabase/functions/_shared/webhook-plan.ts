// Résolution du plan d'abonnement à partir du lookup_key Stripe (stripe-webhook)
// — extraite pour être testable sous Vitest sans dépendances Deno/Stripe.
// Indexé par lookup_key (ex: "price_standard_annual"), pas par price.id — Stripe
// génère toujours un ID aléatoire (price_1AbC2D...) pour price.id, jamais la
// chaîne littérale utilisée ici.

export const PRICE_TO_PLAN: Record<string, string> = {
  price_starter_monthly: "starter", price_starter_annual: "starter",
  price_standard_monthly: "standard", price_standard_annual: "standard",
  price_pro_monthly: "pro", price_pro_annual: "pro",
  price_premium_monthly: "premium", price_premium_annual: "premium",
};

export const FALLBACK_PLAN = "starter";

export function resolvePlan(lookupKey: string | undefined | null): { plan: string; known: boolean } {
  if (lookupKey && PRICE_TO_PLAN[lookupKey]) {
    return { plan: PRICE_TO_PLAN[lookupKey], known: true };
  }
  return { plan: FALLBACK_PLAN, known: false };
}
