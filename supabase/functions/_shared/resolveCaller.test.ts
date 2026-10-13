// Tests de resolveCaller — en particulier la révocation serveur des jetons
// internes (13/10/2026, audit sécurité). Faux client Supabase minimal, sur le
// même principe que rappelHandlers.test.ts.
import { describe, it, expect } from "vitest";
import { signToken } from "./jwt.ts";
import { resolveCaller } from "./resolveCaller.ts";

const SECRET = "test-secret-do-not-use-in-prod";

function decodePayload(token: string) {
  const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), "=");
  return JSON.parse(atob(padded));
}

function makeFakeSb(revoked: string[] = []) {
  return {
    from(table: string) {
      if (table === "revoked_tokens") {
        return {
          select: () => ({
            eq: (_col: string, val: string) => ({
              maybeSingle: async () => ({ data: revoked.includes(val) ? { jti: val } : null, error: null }),
            }),
          }),
        };
      }
      if (table === "pharmacie_users") {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
      }
      throw new Error("table inattendue dans le faux client : " + table);
    },
    auth: { getUser: async () => ({ data: { user: null } }) },
  } as any;
}

describe("resolveCaller", () => {
  it("un jeton vendeur valide et non révoqué résout pharmacieId/vendeurSub avec son jti", async () => {
    const token = await signToken({ role: "vendeur", pharmacie_id: "ph1", sub: "poste1" }, SECRET, 3600);
    const caller = await resolveCaller(token, SECRET, makeFakeSb());
    expect(caller.pharmacieId).toBe("ph1");
    expect(caller.vendeurSub).toBe("poste1");
    expect(caller.isAdmin).toBe(false);
    expect(caller.jti).toBeTruthy();
    expect(caller.exp).toBeTypeOf("number");
  });

  it("un jeton vendeur révoqué est traité comme invalide, même signature/expiration correctes", async () => {
    const token = await signToken({ role: "vendeur", pharmacie_id: "ph1" }, SECRET, 3600);
    const decoded = decodePayload(token);
    const caller = await resolveCaller(token, SECRET, makeFakeSb([decoded.jti]));
    expect(caller.pharmacieId).toBeNull();
    expect(caller.jti).toBeNull();
  });

  it("un jeton admin valide et non révoqué résout isAdmin avec son jti", async () => {
    const token = await signToken({ role: "admin" }, SECRET, 3600);
    const caller = await resolveCaller(token, SECRET, makeFakeSb());
    expect(caller.isAdmin).toBe(true);
    expect(caller.jti).toBeTruthy();
  });

  it("un jeton admin révoqué perd ses droits admin", async () => {
    const token = await signToken({ role: "admin" }, SECRET, 3600);
    const decoded = decodePayload(token);
    const caller = await resolveCaller(token, SECRET, makeFakeSb([decoded.jti]));
    expect(caller.isAdmin).toBe(false);
  });

  it("sans jeton, renvoie un appelant anonyme sans jti", async () => {
    const caller = await resolveCaller("", SECRET, makeFakeSb());
    expect(caller.pharmacieId).toBeNull();
    expect(caller.isAdmin).toBe(false);
    expect(caller.jti).toBeNull();
  });
});
