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

export type Caller = { pharmacieId: string | null; isAdmin: boolean };

/** Identifie l'appelant à partir de l'en-tête Authorization. Ne lève jamais —
 * renvoie { pharmacieId: null, isAdmin: false } si rien n'est reconnu ; c'est
 * à l'appelant de cette fonction de renvoyer 401/403 selon la ressource demandée. */
export async function resolveCaller(
  bearer: string,
  jwtSecret: string,
  sb: SupabaseClient,
): Promise<Caller> {
  const internal = bearer ? await verifyToken(bearer, jwtSecret) : { valid: false as const, error: "" };
  if (internal.valid && internal.payload.role === "vendeur") {
    return { pharmacieId: String(internal.payload.pharmacie_id), isAdmin: false };
  }
  if (internal.valid && internal.payload.role === "admin") {
    return { pharmacieId: null, isAdmin: true };
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
      if (link) return { pharmacieId: link.pharmacie_id, isAdmin: false };
    }
  }
  return { pharmacieId: null, isAdmin: false };
}
