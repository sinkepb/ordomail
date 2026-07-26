// Allowlist des origines autorisées à appeler les edge functions OrdoMail
// depuis un navigateur — remplace le "Access-Control-Allow-Origin: *" générique
// (n'importe quel site tiers pouvait auparavant appeler ces endpoints depuis le
// navigateur d'un utilisateur) par une origine reflétée uniquement si elle
// correspond à l'app OrdoMail (prod, ou localhost en dev).
const ALLOWED_ORIGINS = [
  Deno.env.get("APP_URL"),
  "https://ordomail.fr",
  "https://www.ordomail.fr",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
].filter((o): o is string => Boolean(o));

export function corsHeaders(req: Request, extra: Record<string, string> = {}): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Vary": "Origin",
    ...extra,
  };
}
