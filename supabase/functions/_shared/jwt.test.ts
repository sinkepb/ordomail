// Tests du helper JWT interne (verify-pin, verify-admin, secure-data — phase 1).
// N'utilise que Web Crypto/TextEncoder/btoa-atob (aucune API Deno-spécifique),
// donc exécutable directement sous Vitest/Node malgré l'emplacement du fichier
// dans supabase/functions/.
import { describe, it, expect } from "vitest";
import { signToken, verifyToken } from "./jwt.ts";

const SECRET = "test-secret-do-not-use-in-prod";

describe("signToken / verifyToken", () => {
  it("un jeton valide, signé avec le bon secret, doit être accepté", async () => {
    const token = await signToken({ role: "vendeur", pharmacie_id: "abc-123" }, SECRET, 3600);
    const result = await verifyToken(token, SECRET);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.payload.role).toBe("vendeur");
      expect(result.payload.pharmacie_id).toBe("abc-123");
    }
  });

  it("rejette un jeton signé avec un secret différent", async () => {
    const token = await signToken({ role: "admin" }, SECRET, 3600);
    const result = await verifyToken(token, "un-autre-secret");
    expect(result.valid).toBe(false);
  });

  it("rejette un jeton expiré", async () => {
    const token = await signToken({ role: "vendeur" }, SECRET, -1); // déjà expiré
    const result = await verifyToken(token, SECRET);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toMatch(/expiré/i);
  });

  it("rejette un jeton dont le payload a été altéré (signature invalide)", async () => {
    const token = await signToken({ role: "vendeur", pharmacie_id: "abc-123" }, SECRET, 3600);
    const [header, body, sig] = token.split(".");
    // Rejouer avec un payload différent mais la même signature — doit échouer
    const tamperedBody = btoa(JSON.stringify({ role: "admin" })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const tampered = `${header}.${tamperedBody}.${sig}`;
    const result = await verifyToken(tampered, SECRET);
    expect(result.valid).toBe(false);
  });

  it("rejette un jeton malformé (pas 3 segments)", async () => {
    const result = await verifyToken("pas.un.jeton.valide.du.tout", SECRET);
    expect(result.valid).toBe(false);
  });

  it("rejette une chaîne vide ou absente", async () => {
    expect((await verifyToken("", SECRET)).valid).toBe(false);
    // @ts-expect-error test volontaire d'un appel sans argument
    expect((await verifyToken(undefined, SECRET)).valid).toBe(false);
  });
});
