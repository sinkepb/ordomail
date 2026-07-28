// Tests de la logique pure de create-checkout-session : construction du
// lookup_key Stripe et résolution sécurisée de l'URL de retour (anti open-redirect).
import { describe, it, expect } from "vitest";
import { buildLookupKey, resolveAppOrigin } from "./checkout.ts";

describe("buildLookupKey", () => {
  it("construit un lookup_key mensuel par défaut", () => {
    expect(buildLookupKey("standard", "monthly")).toBe("price_standard_monthly");
  });

  it("construit un lookup_key annuel", () => {
    expect(buildLookupKey("pro", "annual")).toBe("price_pro_annual");
  });

  it("traite toute valeur de billing différente de 'annual' comme mensuelle", () => {
    expect(buildLookupKey("starter", "")).toBe("price_starter_monthly");
    expect(buildLookupKey("starter", "n'importe quoi")).toBe("price_starter_monthly");
  });
});

describe("resolveAppOrigin", () => {
  const allowed = ["https://ordomail.fr", "http://localhost:5173", undefined];
  const fallback = "https://ordomail.fr";

  it("accepte une origine connue fournie par le client", () => {
    expect(resolveAppOrigin("http://localhost:5173", allowed, fallback)).toBe("http://localhost:5173");
  });

  it("rejette une origine inconnue (protection open-redirect) et retombe sur le fallback", () => {
    expect(resolveAppOrigin("https://evil.example.com", allowed, fallback)).toBe(fallback);
  });

  it("retombe sur le fallback si appUrl est absent", () => {
    expect(resolveAppOrigin(null, allowed, fallback)).toBe(fallback);
    expect(resolveAppOrigin(undefined, allowed, fallback)).toBe(fallback);
  });

  it("ignore les entrées undefined de la liste des origines autorisées", () => {
    expect(resolveAppOrigin(undefined as unknown as string, allowed, fallback)).toBe(fallback);
  });
});
