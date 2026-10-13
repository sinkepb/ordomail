import { describe, it, expect } from "vitest";
import { fonctionnaliteActive } from "./featureRegistry.js";

describe("fonctionnaliteActive", () => {
  it("retourne le défaut du catalogue sans exception mémorisée", () => {
    expect(fonctionnaliteActive({ feature_overrides: {} }, "cadrage_manuel")).toBe(true);
    expect(fonctionnaliteActive({}, "cadrage_manuel")).toBe(true);
    expect(fonctionnaliteActive(null, "cadrage_manuel")).toBe(true);
  });

  it("l'exception mémorisée sur la pharmacie l'emporte sur le défaut", () => {
    expect(fonctionnaliteActive({ feature_overrides: { cadrage_manuel: false } }, "cadrage_manuel")).toBe(false);
    expect(fonctionnaliteActive({ feature_overrides: { cadrage_manuel: true } }, "cadrage_manuel")).toBe(true);
  });

  it("une clé inconnue du catalogue est désactivée par défaut", () => {
    expect(fonctionnaliteActive({ feature_overrides: {} }, "cle_inexistante")).toBe(false);
  });
});
