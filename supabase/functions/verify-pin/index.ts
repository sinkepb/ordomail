// Supabase Edge Function : verify-pin
// Vérifie le PIN d'un vendeur et retourne un jeton de session vendeur (courte durée).
//
// @phase1-security 23/07/2026 — durcissement :
//  - comparaison via pin_hash (bcrypt), plus jamais de PIN en clair côté serveur
//  - limitation de débit par pharmacie (fenêtre glissante) avant même de tester le PIN
//  - émission d'un jeton signé (voir _shared/jwt.ts) consommé par l'edge function
//    secure-data — la clé anon seule ne permet plus de lire les ordonnances d'une
//    pharmacie (voir migration phase1_security.sql)
//
// Nécessite le secret de fonction ORDOMAIL_JWT_SECRET (supabase secrets set).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
import { signToken } from "../_shared/jwt.ts";
import { corsHeaders } from "../_shared/cors.ts";

const MAX_ATTEMPTS_PER_WINDOW = 10;
const WINDOW_MINUTES = 15;
const VENDEUR_TOKEN_TTL_SECONDS = 8 * 3600; // 8h — durée d'un poste de travail

Deno.serve(async (req) => {
  const CORS = corsHeaders(req, {
    "Access-Control-Allow-Headers": "content-type, authorization, x-client-info, apikey",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  });
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: CORS });
  }

  try {
    const { pin, pharmacieId } = await req.json();

    if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      return new Response(JSON.stringify({ error: "PIN invalide" }),
        { status: 400, headers: CORS });
    }
    if (!pharmacieId) {
      return new Response(JSON.stringify({ error: "pharmacieId requis" }),
        { status: 400, headers: CORS });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const jwtSecret   = Deno.env.get("ORDOMAIL_JWT_SECRET")!;
    const sb = createClient(supabaseUrl, serviceKey);

    // ── 1. Limitation de débit — fenêtre glissante par pharmacie ────────────────
    // Compte les échecs récents avant même de tester le PIN : un PIN à 4 chiffres
    // (10 000 combinaisons) doit être protégé indépendamment du poste ciblé.
    const since = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();
    const { count: recentFails } = await sb
      .from("pin_verification_attempts")
      .select("id", { count: "exact", head: true })
      .eq("pharmacie_id", pharmacieId)
      .gte("created_at", since);

    if ((recentFails || 0) >= MAX_ATTEMPTS_PER_WINDOW) {
      return new Response(
        JSON.stringify({ error: "Trop de tentatives — réessayez dans quelques minutes" }),
        { status: 429, headers: CORS },
      );
    }

    // ── 2. Comparer le PIN aux postes actifs de la pharmacie (hash bcrypt) ──────
    const { data: postes, error: fetchErr } = await sb
      .from("pharmacie_postes")
      .select("id, nom, pin_hash, actif, pharmacie_id, pharmacies(id,nom,couleur,plan,stripe_subscription_id)")
      .eq("pharmacie_id", pharmacieId)
      .eq("actif", true);

    if (fetchErr) throw new Error(fetchErr.message);

    let matched: any = null;
    for (const poste of postes || []) {
      if (!poste.pin_hash) continue; // poste pas encore migré vers pin_hash — ignoré, pas de repli en clair
      // compareSync (pas compare async) : la version async spawn un Worker, indisponible
      // dans le runtime des Edge Functions Supabase ("Worker is not defined").
      if (bcrypt.compareSync(pin, poste.pin_hash)) { matched = poste; break; }
    }

    if (!matched) {
      // Toujours logger l'échec — même si la pharmacie/poste n'existe pas — pour que
      // la limitation de débit s'applique aussi aux tentatives d'énumération.
      await sb.from("pin_verification_attempts").insert({ pharmacie_id: pharmacieId });
      return new Response(JSON.stringify({ error: "PIN incorrect ou poste inactif" }),
        { status: 401, headers: CORS });
    }

    const pharmacie = matched.pharmacies;

    // Compte confirmé mais jamais passé par un paiement Stripe abouti (checkout
    // abandonné/expiré) : un vendeur n'a pas la main pour payer (voir le titulaire
    // via authSignInEmail, redirigé lui vers l'écran de reprise d'abonnement),
    // donc on bloque simplement la connexion plutôt que de l'exposer à un écran
    // de facturation qui n'est pas le sien.
    if (!pharmacie.stripe_subscription_id) {
      return new Response(JSON.stringify({ error: "Abonnement de la pharmacie non finalisé — contactez le titulaire" }),
        { status: 403, headers: CORS });
    }

    const token = await signToken(
      { sub: matched.id, pharmacie_id: pharmacieId, poste_nom: matched.nom, role: "vendeur" },
      jwtSecret,
      VENDEUR_TOKEN_TTL_SECONDS,
    );

    return new Response(JSON.stringify({
      success: true,
      token, // à envoyer en "Authorization: Bearer <token>" aux appels secure-data
      poste: { id: matched.id, nom: matched.nom },
      pharmacie: { id: pharmacie.id, nom: pharmacie.nom, couleur: pharmacie.couleur, plan: pharmacie.plan },
    }), { headers: CORS });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }),
      { status: 500, headers: CORS });
  }
});
