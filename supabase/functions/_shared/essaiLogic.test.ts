// Tests de la prolongation d'essai (voir essaiLogic.ts).
import { describe, it, expect } from "vitest";
import { calculerNouvelleFinEssai, MAX_JOURS_PAR_PROLONGATION } from "./essaiLogic.ts";

const JOUR = 86400;
const MAINTENANT = 1_800_000_000;

describe("calculerNouvelleFinEssai", () => {
  it("ajoute les jours à la fin d'essai ACTUELLE, pas à aujourd'hui", () => {
    const fin = MAINTENANT + 10 * JOUR; // il reste 10 jours d'essai
    const r = calculerNouvelleFinEssai(fin, 30, MAINTENANT);
    expect(r).toEqual({ ok: true, nouvelleFinSec: fin + 30 * JOUR });
  });

  it("accepte un nombre de jours reçu en chaîne (formulaire)", () => {
    const fin = MAINTENANT + 5 * JOUR;
    expect(calculerNouvelleFinEssai(fin, "30", MAINTENANT)).toEqual({ ok: true, nouvelleFinSec: fin + 30 * JOUR });
  });

  it("refuse si l'essai est terminé", () => {
    const r = calculerNouvelleFinEssai(MAINTENANT - JOUR, 30, MAINTENANT);
    expect(r.ok).toBe(false);
  });

  it("refuse si aucune fin d'essai n'est connue (pas d'essai)", () => {
    expect(calculerNouvelleFinEssai(null, 30, MAINTENANT).ok).toBe(false);
    expect(calculerNouvelleFinEssai(undefined, 30, MAINTENANT).ok).toBe(false);
  });

  it("refuse un nombre de jours invalide", () => {
    const fin = MAINTENANT + 10 * JOUR;
    for (const j of [0, -5, 1.5, "abc", null, undefined, NaN]) {
      expect(calculerNouvelleFinEssai(fin, j, MAINTENANT).ok).toBe(false);
    }
  });

  it("plafonne chaque prolongation", () => {
    const fin = MAINTENANT + 10 * JOUR;
    expect(calculerNouvelleFinEssai(fin, MAX_JOURS_PAR_PROLONGATION, MAINTENANT).ok).toBe(true);
    expect(calculerNouvelleFinEssai(fin, MAX_JOURS_PAR_PROLONGATION + 1, MAINTENANT).ok).toBe(false);
  });

  it("plafonne l'essai total à un an à partir d'aujourd'hui", () => {
    const fin = MAINTENANT + 300 * JOUR;
    expect(calculerNouvelleFinEssai(fin, 90, MAINTENANT).ok).toBe(false); // 390 jours
    expect(calculerNouvelleFinEssai(fin, 60, MAINTENANT).ok).toBe(true);  // 360 jours
  });
});
