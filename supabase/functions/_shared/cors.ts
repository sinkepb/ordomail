// Allowlist des origines autorisées à appeler les edge functions OrdoMail
// depuis un navigateur — remplace le "Access-Control-Allow-Origin: *" générique
// (n'importe quel site tiers pouvait auparavant appeler ces endpoints depuis le
// navigateur d'un utilisateur) par une origine reflétée uniquement si elle
// correspond à l'app OrdoMail (prod, preview Vercel de ce projet, ou localhost
// en dev).
//
// ⚠️ Régression du 27/07/2026 : la liste statique d'origines ne couvrait QUE le
// domaine de prod — tout déploiement preview (Vercel génère une URL unique par
// branche/commit, ex. https://ordomail-git-develop-<team>.vercel.app) se
// retrouvait avec CHAQUE appel à une edge function (secure-data, etc.) rejeté
// par le navigateur en amont côté CORS, avant même d'atteindre le code métier —
// cassant silencieusement toute lecture (ordonnances, intérêts patients) sur
// ces environnements. Détecté en reproduisant en direct sur le preview develop
// (erreur console explicite : "Access-Control-Allow-Origin ... not equal to
// the supplied origin"). Le pattern ci-dessous couvre les previews Vercel de
// CE projet spécifiquement (préfixe "ordomail-"), pas *.vercel.app en général.
const ALLOWED_ORIGINS = [
  Deno.env.get("APP_URL"),
  "https://ordomail.fr",
  "https://www.ordomail.fr",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
].filter((o): o is string => Boolean(o));

const VERCEL_PREVIEW_PATTERN = /^https:\/\/ordomail(-[a-z0-9-]+)?\.vercel\.app$/;

export function corsHeaders(req: Request, extra: Record<string, string> = {}): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  const isAllowed = ALLOWED_ORIGINS.includes(origin) || VERCEL_PREVIEW_PATTERN.test(origin);
  const allowOrigin = isAllowed ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Vary": "Origin",
    ...extra,
  };
}
