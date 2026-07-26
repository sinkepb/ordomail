// Logique pure de create-checkout-session (résolution du lookup_key Stripe et de
// l'URL de retour) — extraite pour être testable sous Vitest sans dépendances Deno/Stripe.

export function buildLookupKey(plan: string, billing: string): string {
  return `price_${plan}_${billing === "annual" ? "annual" : "monthly"}`;
}

// appUrl vient du client (window.location.origin) : ne jamais l'utiliser tel quel
// comme base des URLs de retour Stripe (redirection ouverte) — ne l'accepter que
// s'il correspond à une origine connue (prod, ou localhost en dev).
export function resolveAppOrigin(appUrl: string | undefined | null, allowedOrigins: (string | undefined)[], fallback: string): string {
  const allowed = allowedOrigins.filter(Boolean) as string[];
  return (appUrl && allowed.includes(appUrl)) ? appUrl : fallback;
}
