import { describe, it, expect } from "vitest";
import { isTokenRevoked, revokeToken } from "./tokenRevocation.ts";

function makeFakeSb() {
  const rows: { jti: string; expires_at: string }[] = [];
  return {
    _rows: rows,
    from(table: string) {
      if (table !== "revoked_tokens") throw new Error("table inattendue : " + table);
      return {
        select: () => ({
          eq: (_col: string, val: string) => ({
            maybeSingle: async () => ({ data: rows.find((r) => r.jti === val) || null, error: null }),
          }),
        }),
        upsert: async (row: { jti: string; expires_at: string }) => {
          const i = rows.findIndex((r) => r.jti === row.jti);
          if (i >= 0) rows[i] = row; else rows.push(row);
          return { error: null };
        },
      };
    },
  } as any;
}

describe("isTokenRevoked / revokeToken", () => {
  it("un jeton jamais révoqué n'est pas trouvé", async () => {
    expect(await isTokenRevoked(makeFakeSb(), "jti-1")).toBe(false);
  });

  it("révoquer un jeton le rend détectable ensuite", async () => {
    const sb = makeFakeSb();
    await revokeToken(sb, "jti-1", Math.floor(Date.now() / 1000) + 3600);
    expect(await isTokenRevoked(sb, "jti-1")).toBe(true);
    expect(await isTokenRevoked(sb, "jti-autre")).toBe(false);
  });

  it("sans jti, ne fait rien et ne lève jamais", async () => {
    const sb = makeFakeSb();
    await expect(revokeToken(sb, null, 123)).resolves.toBeUndefined();
    expect(await isTokenRevoked(sb, null)).toBe(false);
  });
});
