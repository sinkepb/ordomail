// Révocation serveur des jetons internes vendeur/admin (13/10/2026, audit
// sécurité) — voir jwt.ts (émission du jti) et resolveCaller.ts (vérification).
// Ne lève jamais : une panne de cette vérification ne doit ni bloquer une
// connexion légitime (côté revoke, best-effort) ni, surtout, ouvrir l'accès
// (côté lecture, voir le commentaire dans isTokenRevoked).
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/** true si ce jeton a été explicitement révoqué (déconnexion). En cas
 * d'erreur de lecture, renvoie true (refuse l'accès) plutôt que false :
 * une panne de cette table ne doit jamais se traduire par un jeton révoqué
 * accepté comme valide. */
export async function isTokenRevoked(sb: SupabaseClient, jti: string | null): Promise<boolean> {
  if (!jti) return false;
  try {
    const { data, error } = await sb.from("revoked_tokens").select("jti").eq("jti", jti).maybeSingle();
    if (error) return true;
    return !!data;
  } catch (_e) {
    return true;
  }
}

/** Révoque le jeton courant (déconnexion explicite). `exp` (secondes Unix,
 * depuis le payload du jeton) sert uniquement à purger la ligne une fois le
 * jeton expiré de toute façon (voir purgeLogic.ts) ; à défaut, 24h par défaut. */
export async function revokeToken(sb: SupabaseClient, jti: string | null, exp: number | null): Promise<void> {
  if (!jti) return;
  const expiresAt = typeof exp === "number" ? new Date(exp * 1000).toISOString() : new Date(Date.now() + 86400000).toISOString();
  try {
    await sb.from("revoked_tokens").upsert({ jti, expires_at: expiresAt });
  } catch (_e) {
    // Best-effort : un échec d'écriture ici ne doit pas empêcher la
    // déconnexion client (qui a de toute façon déjà effacé son jeton local).
  }
}
