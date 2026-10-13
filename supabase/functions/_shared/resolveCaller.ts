// OrdoMail — résolution de l'appelant, partagée par secure-data et secure-data-admin.
//
// Extrait le 13/08/2026 lors de la séparation de secure-data en deux fonctions
// (une par pharmacie, une pour le backoffice OrdoMail Business) — objectif :
// une seule source de vérité pour "qui appelle ?", pour qu'un correctif de
// sécurité appliqué à l'une ne soit jamais oublié dans l'autre.
//
// Trois façons de s'authentifier auprès de ces fonctions :
//   - jeton vendeur émis par verify-pin (rôle "vendeur", scope = une pharmacie)
//   - jeton admin émis par verify-admin (rôle "admin", accès backoffice)
//   - session Supabase Auth du titulaire (email/mot de passe), résolue via
//     pharmacie_users

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyToken } from "./jwt.ts";
import { isTokenRevoked } from "./tokenRevocation.ts";

// vendeurSub (06/09/2026, PIN unique) : le "sub" brut du jeton vendeur — id du
// poste (pharmacie_postes) en mode multi-PIN, id de la ligne vendeur_sessions
// en mode PIN unique. Exposé ici (plutôt que redécodé ailleurs) pour rester
// la seule source de vérité sur le contenu du jeton — voir vendeur_heartbeat/
// vendeur_release_session (secure-data), seuls consommateurs pour l'instant.
// userId (24/09/2026, voir secure-data:audit_log_create) : l'id Supabase Auth
// du titulaire quand l'appelant est authentifié par session Auth — null pour
// un poste vendeur (utiliser vendeurSub) ou un admin backoffice.
// jti/exp (13/10/2026, audit sécurité) — portés par tout jeton vendeur/admin
// valide (jamais par une session Supabase Auth titulaire), pour que l'appelant
// de resolveCaller puisse révoquer CE jeton précis à la déconnexion (voir
// _shared/tokenRevocation.ts, secure-data:compte.ts:vendeur_release_session,
// secure-data-admin:admin_logout).
export type Caller = { pharmacieId: string | null; isAdmin: boolean; vendeurSub: string | null; userId: string | null; jti: string | null; exp: number | null };

/** Identifie l'appelant à partir de l'en-tête Authorization. Ne lève jamais —
 * renvoie { pharmacieId: null, isAdmin: false } si rien n'est reconnu ; c'est
 * à l'appelant de cette fonction de renvoyer 401/403 selon la ressource demandée. */
export async function resolveCaller(
  bearer: string,
  jwtSecret: string,
  sb: SupabaseClient,
): Promise<Caller> {
  const internal = bearer ? await verifyToken(bearer, jwtSecret) : { valid: false as const, error: "" };
  if (internal.valid && (internal.payload.role === "vendeur" || internal.payload.role === "admin")) {
    const jti = typeof internal.payload.jti === "string" ? internal.payload.jti : null;
    const exp = typeof internal.payload.exp === "number" ? internal.payload.exp : null;
    // Révoqué (déconnexion explicite) : traiter comme un jeton invalide, même
    // si signature et expiration restent par ailleurs valides.
    if (await isTokenRevoked(sb, jti)) {
      return { pharmacieId: null, isAdmin: false, vendeurSub: null, userId: null, jti: null, exp: null };
    }
    if (internal.payload.role === "vendeur") {
      return { pharmacieId: String(internal.payload.pharmacie_id), isAdmin: false, vendeurSub: String(internal.payload.sub || "") || null, userId: null, jti, exp };
    }
    return { pharmacieId: null, isAdmin: true, vendeurSub: null, userId: null, jti, exp };
  }
  if (bearer) {
    // Ni jeton vendeur ni jeton admin — tenter une session Supabase Auth (titulaire)
    const { data: userData } = await sb.auth.getUser(bearer);
    if (userData?.user) {
      const { data: link } = await sb
        .from("pharmacie_users")
        .select("pharmacie_id")
        .eq("id", userData.user.id)
        .maybeSingle();
      if (link) return { pharmacieId: link.pharmacie_id, isAdmin: false, vendeurSub: null, userId: userData.user.id, jti: null, exp: null };
    }
  }
  return { pharmacieId: null, isAdmin: false, vendeurSub: null, userId: null, jti: null, exp: null };
}
