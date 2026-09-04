// OrdoMail — limitation de débit générique pour endpoints publics anonymes
// (04/09/2026). Fenêtre glissante par (scope, key) dans `rate_limit_log`
// (clé de service, RLS deny-all — voir la migration) : même principe que
// submission_log dans submit-ordonnance, généralisé pour être réutilisable
// par plusieurs endpoints sans dupliquer la logique de comptage.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/** Retourne l'IP appelante depuis x-forwarded-for (posée par l'infra Supabase/
 * Deno Deploy) — premier élément de la liste (le client, pas les proxies
 * intermédiaires). Repli sur "unknown" plutôt que de planter si l'en-tête est
 * absent (ex. appel interne/test) : mieux vaut regrouper ces appels dans un
 * même compteur que de casser l'endpoint faute d'IP.
 */
export function getClientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return "unknown";
}

/** true si l'appel est autorisé (et l'enregistre) ; false si la limite pour
 * cette fenêtre est atteinte — l'appelant doit alors répondre 429 sans rien
 * exécuter d'autre. Ne lève jamais : une panne de rate-limiting ne doit pas
 * empêcher un patient réel de déposer son ordonnance ou de réserver une
 * offre, elle dégrade juste la protection anti-abus pour cette requête.
 */
export async function checkRateLimit(
  sb: SupabaseClient,
  scope: string,
  key: string,
  maxRequests: number,
  windowMinutes: number,
): Promise<boolean> {
  try {
    const since = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
    const { count } = await sb.from("rate_limit_log")
      .select("id", { count: "exact", head: true })
      .eq("scope", scope).eq("key", key).gte("created_at", since);
    if ((count || 0) >= maxRequests) return false;
    await sb.from("rate_limit_log").insert({ scope, key });
    return true;
  } catch (_e) {
    return true;
  }
}
