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
      .select("id, label, icon, color, price, price_annual, max_postes, max_ordos, feature_offres_stories, feature_sonnette")
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);

    // Kit matériel — une règle par (plan, intervalle de facturation) depuis
    // la Phase 3 (§17 : Essentiel jamais offert, Fluidité offert seulement en
    // annuel, Performance a un kit "premium" distinct). Même logique
    // publique-sans-auth que pricing_plans, un seul aller-retour pour le
    // front (loadPlanLimits() au démarrage, voir src/lib/plans.js).
    const { data: kitRules, error: kitErr } = await sb.from("kit_materiel_rules")
      .select("plan_id, billing_interval, label, contenu, prix, offert");
    if (kitErr) throw new Error(kitErr.message);

    // Promotion active (Phase 4, §12) — les places restantes DOIVENT venir du
    // serveur (jamais calculées côté client à partir d'un total statique) :
    // slots_used est incrémenté atomiquement par claim_promotion_slot(),
    // appelé uniquement par le webhook Stripe après paiement confirmé.
    const now = new Date().toISOString();
    const { data: promoRows, error: promoErr } = await sb.from("promotions")
      .select("id, nom, plans, prix_promo_monthly, prix_promo_annual, duree_garantie_mois, max_pharmacies, slots_used")
      .eq("actif", true)
      .or(`date_debut.is.null,date_debut.lte.${now}`)
      .or(`date_fin.is.null,date_fin.gte.${now}`)
      .order("created_at", { ascending: false })
      .limit(1);
    if (promoErr) throw new Error(promoErr.message);
    const promoRow = promoRows?.[0];
    const promotion = promoRow ? {
      id: promoRow.id,
      nom: promoRow.nom,
      plans: promoRow.plans,
      prixPromoMonthly: promoRow.prix_promo_monthly,
      prixPromoAnnual: promoRow.prix_promo_annual,
      dureeGarantieMois: promoRow.duree_garantie_mois,
      placesRestantes: promoRow.max_pharmacies != null ? Math.max(0, promoRow.max_pharmacies - promoRow.slots_used) : null,
    } : null;

    return new Response(JSON.stringify({ data, kitRules, promotion }), { headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: CORS });
  }
});
