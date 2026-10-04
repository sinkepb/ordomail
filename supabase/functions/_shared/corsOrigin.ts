// Décision d'origine CORS (04/10/2026, audit sécurité) — module pur, testable.
// Une origine n'est reflétée que si elle figure explicitement dans la liste
// autorisée. Plus de motif générique sur *.vercel.app : n'importe qui pouvait
// créer un projet Vercel de ce nom et lire les réponses des endpoints anonymes.
export function origineAutorisee(origin: string, allowlist: string[]): boolean {
  return origin !== "" && allowlist.includes(origin);
}

export function parseAllowlist(valeurEnv: string | undefined): string[] {
  return (valeurEnv || "").split(",").map((o) => o.trim()).filter(Boolean);
}
