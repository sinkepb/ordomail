// Allowlist des origines autorisées à appeler les edge functions OrdoMail
// depuis un navigateur. Liste explicite : prod, localhost en dev, et les
// URL de preview Vercel listées dans ALLOWED_ORIGINS (secret de fonction,
// séparé par des virgules). Décision pure dans corsOrigin.ts.
import { origineAutorisee, parseAllowlist } from "./corsOrigin.ts";

const ALLOWED_ORIGINS = [
  Deno.env.get("APP_URL"),
  "https://ordomail.fr",
  "https://www.ordomail.fr",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  ...parseAllowlist(Deno.env.get("ALLOWED_ORIGINS")),
].filter((o): o is string => Boolean(o));

export function corsHeaders(req: Request, extra: Record<string, string> = {}): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  const isAllowed = origineAutorisee(origin, ALLOWED_ORIGINS);
  const allowOrigin = isAllowed ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Vary": "Origin",
    ...extra,
  };
}
