import { describe, it, expect } from "vitest";
import { grouperParPeriode } from "./activiteBuckets.js";

const maintenant = new Date(2026, 9, 8); // 08/10/2026, fixe pour des tests déterministes

describe("grouperParPeriode", () => {
  it("jour : 30 barres, la dernière est aujourd'hui", () => {
    const b = grouperParPeriode(["2026-10-08T10:00:00Z", "2026-10-08T15:00:00Z", "2026-09-01T00:00:00Z"], "jour", maintenant);
    expect(b).toHaveLength(30);
    expect(b.at(-1).label).toBe("08/10");
    expect(b.at(-1).value).toBe(2);
    expect(b.some((x) => x.cle === "2026-09-01")).toBe(false); // hors fenêtre de 30 jours
  });

  it("mois : 12 barres, regroupe toutes les dates du mois", () => {
    const b = grouperParPeriode(["2026-10-01", "2026-10-28", "2026-08-15"], "mois", maintenant);
    expect(b).toHaveLength(12);
    expect(b.at(-1).cle).toBe("2026-10");
    expect(b.at(-1).value).toBe(2);
  });

  it("année : une barre par année présente, plus l'année en cours", () => {
    const b = grouperParPeriode(["2024-01-01", "2025-06-01", "2025-07-01"], "annee", maintenant);
    expect(b.map((x) => x.cle)).toEqual(["2024", "2025", "2026"]);
    expect(b.find((x) => x.cle === "2025").value).toBe(2);
    expect(b.find((x) => x.cle === "2026").value).toBe(0);
  });

  it("ignore les dates invalides sans lever d'erreur", () => {
    expect(() => grouperParPeriode(["pas une date", null, undefined], "jour", maintenant)).not.toThrow();
  });
});
