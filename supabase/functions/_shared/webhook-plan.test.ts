// Tests de la résolution de plan depuis le lookup_key Stripe (stripe-webhook).
// Voir tâche #36 (mapping plan.id vs lookup_key) — la régression corrigée à
// l'époque doit rester impossible : un lookup_key inconnu ne doit jamais
// silencieusement mapper vers un mauvais plan payant.
import { describe, it, expect } from "vitest";
import { resolvePlan, PRICE_TO_PLAN, FALLBACK_PLAN } from "./webhook-plan.ts";

describe("resolvePlan", () => {
  it("résout chaque lookup_key connu vers le bon plan", () => {
    for (const [key, plan] of Object.entries(PRICE_TO_PLAN)) {
      expect(resolvePlan(key)).toEqual({ plan, known: true });
    }
  });

  it("distingue mensuel/annuel du même plan", () => {
    expect(resolvePlan("price_pro_monthly").plan).toBe("pro");
    expect(resolvePlan("price_pro_annual").plan).toBe("pro");
  });

  it("retombe sur le plan par défaut pour un lookup_key inconnu, en le signalant", () => {
    const result = resolvePlan("price_inexistant_monthly");
    expect(result).toEqual({ plan: FALLBACK_PLAN, known: false });
  });

  it("retombe sur le plan par défaut si le lookup_key est absent", () => {
    expect(resolvePlan(undefined)).toEqual({ plan: FALLBACK_PLAN, known: false });
    expect(resolvePlan(null)).toEqual({ plan: FALLBACK_PLAN, known: false });
    expect(resolvePlan("")).toEqual({ plan: FALLBACK_PLAN, known: false });
  });
});
