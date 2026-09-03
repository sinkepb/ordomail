// OrdoMail — Edge Function get-pricing (25/08/2026)
//
// Lecture publique des tarifs (pricing_plans) — jusqu'ici, cette table
// n'était lue que par le backoffice (secure-data-admin:admin_pricing, jeton
// admin requis). Résultat : un admin qui modifiait un prix voyait la
// sauvegarde persister en base, mais le reste du site (landing page,
// écran de tarifs, checkout, limites du dashboard pharmacie) continuait à
// lire les valeurs codées en dur dans src/lib/plans.js:PLAN_LIMITS, qui
// n'était jamais rechargé ailleurs que dans l'onglet ouvert de
// PricingEditor. Pas de données sensibles ici (tarifs publics affichés à
// tout visiteur) — fonction volontairement sans authentification, comme
// resolve-qr-code pour le même type de besoin (donnée publique, appelant
// anonyme).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const CORS = corsHeaders(req, {
    "Access-Control-Allow-Headers": "content-type, apikey",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Content-Type": "application/json",
  });
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: CORS });

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data, error } = await sb.from("pricing_plans")
      .select("id, label, icon, color, price, price_annual, max_postes, max_ordos")
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);

    // Kit matériel (stickers/présentoir envoyés à l'inscription) — même
    // logique publique-sans-auth que pricing_plans, un seul aller-retour
    // pour le front (loadPlanLimits() au démarrage, voir src/lib/plans.js).
    const { data: kit, error: kitErr } = await sb.from("kit_materiel_settings")
      .select("prix, offert_si_annuel, actif")
      .eq("id", "00000000-0000-0000-0000-000000000001")
      .maybeSingle();
    if (kitErr) throw new Error(kitErr.message);

    return new Response(JSON.stringify({ data, kit }), { headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: CORS });
  }
});
