// OrdoMail — helper JWT interne (HMAC-SHA256), sans dépendance externe.
//
// Utilisé pour émettre et vérifier des jetons de courte durée pour deux flux qui
// n'ont pas de session Supabase Auth réelle :
//   - le vendeur connecté par code PIN (verify-pin → secure-data)
//   - l'admin OrdoMail Business connecté par mot de passe (verify-admin → secure-data)
//
// Ce n'est PAS un jeton Supabase Auth (RLS/auth.uid() ne le voient pas) : il est
// vérifié explicitement, côté serveur, par les edge functions qui en ont besoin.
// Le secret doit être défini comme secret de fonction Supabase (jamais côté client) :
//   supabase secrets set ORDOMAIL_JWT_SECRET=<valeur aléatoire longue>

function base64url(input: Uint8Array): string {
  let str = "";
  for (const b of input) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(input: string): Uint8Array {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/").padEnd(input.length + ((4 - (input.length % 4)) % 4), "=");
  const str = atob(padded);
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i);
  return bytes;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** Signe un payload arbitraire (objet JSON-sérialisable) avec une expiration en secondes. */
export async function signToken(
  payload: Record<string, unknown>,
  secret: string,
  expiresInSeconds: number,
): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + expiresInSeconds };

  const encHeader = base64url(new TextEncoder().encode(JSON.stringify(header)));
  const encBody   = base64url(new TextEncoder().encode(JSON.stringify(body)));
  const signingInput = `${encHeader}.${encBody}`;

  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signingInput));
  const encSig = base64url(new Uint8Array(sig));

  return `${signingInput}.${encSig}`;
}

export type VerifyResult =
  | { valid: true; payload: Record<string, unknown> }
  | { valid: false; error: string };

/** Vérifie la signature et l'expiration d'un jeton émis par signToken(). */
export async function verifyToken(token: string, secret: string): Promise<VerifyResult> {
  if (!token || typeof token !== "string") return { valid: false, error: "Jeton manquant" };
  const parts = token.split(".");
  if (parts.length !== 3) return { valid: false, error: "Format de jeton invalide" };
  const [encHeader, encBody, encSig] = parts;

  try {
    const key = await hmacKey(secret);
    const signingInput = `${encHeader}.${encBody}`;
    const validSig = await crypto.subtle.verify(
      "HMAC",
      key,
      base64urlDecode(encSig),
      new TextEncoder().encode(signingInput),
    );
    if (!validSig) return { valid: false, error: "Signature invalide" };

    const payload = JSON.parse(new TextDecoder().decode(base64urlDecode(encBody)));
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp === "number" && now >= payload.exp) {
      return { valid: false, error: "Jeton expiré" };
    }
    return { valid: true, payload };
  } catch (_e) {
    return { valid: false, error: "Jeton illisible" };
  }
}
