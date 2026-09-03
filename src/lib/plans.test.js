// Phase 8 tarification (§20) — couverture des règles de plans/limites/impact
// de changement de plan (src/lib/plans.js), jusqu'ici jamais testées
// automatiquement malgré 6 phases de refonte dessus. Purement des fonctions
// pures (pas de réseau, pas de Supabase) — s'exécute dans toute CI, contrairement
// aux tests "live" (__tests__/rls.live.test.js) qui nécessitent des secrets dédiés.
import { describe, it, expect } from "vitest";
import {
  PLAN_LIMITS, PLAN_ORDER, KIT_RULES,
  getKitRule, getPromoPrice, hasFeature, getLimit,
  getNextPlan, getPrevPlan, computeImpact, canAddPoste,
} from "./plans.js";

describe("PLAN_LIMITS / PLAN_ORDER — cohérence des paliers", () => {
  it("les limites de postes croissent strictement avec l'ordre des plans (§1)", () => {
    for (let i = 1; i < PLAN_ORDER.length; i++) {
      const prev = PLAN_LIMITS[PLAN_ORDER[i - 1]];
      const curr = PLAN_LIMITS[PLAN_ORDER[i]];
      expect(curr.maxPostes).toBeGreaterThan(prev.maxPostes);
    }
  });

  it("Essentiel n'a pas Offres/Stories, Fluidité et Performance l'ont (§1, gating serveur voir rls.live.test.js)", () => {
    expect(PLAN_LIMITS.starter.offresStories).toBe(false);
    expect(PLAN_LIMITS.standard.offresStories).toBe(true);
    expect(PLAN_LIMITS.pro.offresStories).toBe(true);
  });
});

describe("hasFeature() / getLimit() — couche centrale (§14)", () => {
  it("hasFeature lit le bon plan et retombe sur starter pour un plan inconnu", () => {
    expect(hasFeature("standard", "offresStories")).toBe(true);
    expect(hasFeature("starter", "offresStories")).toBe(false);
    expect(hasFeature("plan-inexistant", "offresStories")).toBe(false); // repli starter
  });

  it("getLimit renvoie la bonne limite selon le plan", () => {
    expect(getLimit("starter", "maxPostes")).toBe(3);
    expect(getLimit("standard", "maxPostes")).toBe(10);
    expect(getLimit("pro", "maxPostes")).toBe(999);
  });
});

describe("getKitRule() — règles par plan × intervalle (§17)", () => {
  it("Essentiel : jamais offert, ni mensuel ni annuel", () => {
    expect(getKitRule("starter", "monthly").offert).toBe(false);
    expect(getKitRule("starter", "annual").offert).toBe(false);
  });

  it("Fluidité : offert seulement en annuel", () => {
    expect(getKitRule("standard", "monthly").offert).toBe(false);
    expect(getKitRule("standard", "annual").offert).toBe(true);
  });

  it("Performance : kit premium offert en annuel", () => {
    expect(getKitRule("pro", "annual").offert).toBe(true);
    expect(getKitRule("pro", "annual").label).toBe(KIT_RULES.pro.annual.label);
  });

  it("un plan inconnu retombe sur les règles Essentiel plutôt que de planter", () => {
    expect(getKitRule("plan-inexistant", "monthly")).toEqual(KIT_RULES.starter.monthly);
  });

  it("un intervalle inconnu retombe sur mensuel", () => {
    expect(getKitRule("starter", "trimestriel")).toEqual(KIT_RULES.starter.monthly);
  });
});

describe("getPromoPrice() — aucune promotion active par défaut (§12)", () => {
  it("renvoie null quand ACTIVE_PROMOTION est null (état par défaut avant loadPlanLimits())", () => {
    expect(getPromoPrice("starter", "monthly")).toBeNull();
    expect(getPromoPrice("pro", "annual")).toBeNull();
  });
});

describe("getNextPlan() / getPrevPlan()", () => {
  it("navigue dans l'ordre des plans et s'arrête aux bornes", () => {
    expect(getNextPlan("starter")).toBe("standard");
    expect(getNextPlan("pro")).toBeNull();
    expect(getPrevPlan("pro")).toBe("standard");
    expect(getPrevPlan("starter")).toBeNull();
  });
});

describe("computeImpact() — prévisualisation d'un changement de plan (§13)", () => {
  it("détecte un upgrade et ne perd aucune fonctionnalité", () => {
    const pharmacie = { plan: "starter" };
    const impact = computeImpact(pharmacie, [], "standard");
    expect(impact.isUpgrade).toBe(true);
    expect(impact.featuresLost).toEqual([]);
    expect(impact.priceDiff).toBe(PLAN_LIMITS.standard.price - PLAN_LIMITS.starter.price);
  });

  it("détecte un downgrade et liste les fonctionnalités perdues", () => {
    const pharmacie = { plan: "standard" };
    const impact = computeImpact(pharmacie, [], "starter");
    expect(impact.isUpgrade).toBe(false);
    expect(impact.featuresLost).toContain("Offres & Stories");
  });

  it("calcule les postes à désactiver quand un downgrade dépasse la nouvelle limite", () => {
    const pharmacie = { plan: "standard" };
    const postes = Array.from({ length: 7 }, (_, i) => ({ id: `p${i}`, actif: true }));
    const impact = computeImpact(pharmacie, postes, "starter"); // maxPostes starter = 3
    expect(impact.postesActuels).toBe(7);
    expect(impact.postesASusprimer).toBe(4);
  });

  it("ne demande jamais de désactiver de poste sur un upgrade (maxPostes croît toujours)", () => {
    const pharmacie = { plan: "starter" };
    const postes = Array.from({ length: 3 }, (_, i) => ({ id: `p${i}`, actif: true }));
    const impact = computeImpact(pharmacie, postes, "pro");
    expect(impact.postesASusprimer).toBe(0);
  });
});

describe("canAddPoste()", () => {
  it("autorise l'ajout tant que la limite du plan n'est pas atteinte", () => {
    const postes = [{ actif: true }, { actif: true }];
    expect(canAddPoste("starter", postes)).toBe(true); // 2 actifs < 3
  });

  it("refuse l'ajout une fois la limite atteinte", () => {
    const postes = [{ actif: true }, { actif: true }, { actif: true }];
    expect(canAddPoste("starter", postes)).toBe(false); // 3 actifs = limite Essentiel
  });

  it("ignore les postes inactifs dans le décompte", () => {
    const postes = [{ actif: true }, { actif: true }, { actif: false }, { actif: false }];
    expect(canAddPoste("starter", postes)).toBe(true); // 2 actifs < 3
  });
});
