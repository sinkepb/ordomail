// @phase3 24/07/2026 — corrections :
//  - les Price Stripe sont retrouvés par lookup_key, pas par un ID littéral choisi
//    à la main (Stripe génère toujours des ID aléatoires — voir create-checkout-session)
//  - exige désormais la session du titulaire de la pharmacie concernée : avant ce
//    correctif, n'importe qui pouvait changer l'abonnement Stripe de n'importe
//    quelle pharmacie sans être authentifié
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.0.0";
import { corsHeaders } from "../_shared/cors.ts";
import { trimExcessPostes } from "../_shared/trimPostes.ts";
import { planHasFeature } from "../_shared/planFeatures.ts";

// Ordre des plans — sert uniquement à détecter upgrade vs downgrade (§13),
// pas les limites/fonctionnalités elles-mêmes (voir planFeatures.ts).
const PLAN_ORDER = ["starter", "standard", "pro"];

serve(async (req) => {
  const CORS = corsHeaders(req, {
    "Access-Control-Allow-Headers": "content-type, authorization, x-client-info, apikey",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  });
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const authHeader = req.headers.get("authorization") || "";
    const callerToken = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!callerToken) {
      return new Response(JSON.stringify({ error: "Authentification requise" }), { status: 401, headers: CORS });
    }

    const { pharmacieId, newPlan, billing = "monthly" } = await req.json();
    if (!pharmacieId || !newPlan) {
      return new Response(JSON.stringify({ error: "pharmacieId, newPlan requis" }), { status: 400, headers: CORS });
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2023-10-16" });
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Vérifier que l'appelant est bien titulaire de CETTE pharmacie
    const { data: userData, error: userErr } = await supabase.auth.getUser(callerToken);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Session invalide ou expirée" }), { status: 401, headers: CORS });
    }
    const { data: link } = await supabase.from("pharmacie_users").select("pharmacie_id, role").eq("id", userData.user.id).maybeSingle();
    if (!link || link.pharmacie_id !== pharmacieId || link.role !== "admin") {
      return new Response(JSON.stringify({ error: "Vous n'êtes pas autorisé à modifier cet abonnement" }), { status: 403, headers: CORS });
    }

    const { data: ph } = await supabase.from("pharmacies").select("plan, stripe_subscription_id").eq("id", pharmacieId).maybeSingle();
    if (!ph?.stripe_subscription_id) {
      return new Response(JSON.stringify({ error: "Pas d'abonnement Stripe actif" }), { status: 400, headers: CORS });
    }

    // Phase 6 tarification (§13) — un downgrade est programmé à la fin de la
    // période de facturation en cours, SANS perte immédiate de
    // fonctionnalités : rien n'est touché côté Stripe/plan/postes tout de
    // suite, juste enregistré comme "en attente". apply-pending-downgrades
    // (cron quotidien) applique le changement réel une fois la période
    // écoulée. Un changement d'intervalle de facturation sur le MÊME plan
    // (ex. "passer en annuel", Phase 5) n'est pas un downgrade — reste
    // immédiat, comme un upgrade.
    const isDowngrade = PLAN_ORDER.indexOf(newPlan) < PLAN_ORDER.indexOf(ph.plan);
    if (isDowngrade) {
      const sub = await stripe.subscriptions.retrieve(ph.stripe_subscription_id);
      const effectiveAt = new Date(sub.current_period_end * 1000).toISOString();
      await supabase.from("pharmacies").update({
        plan_pending: newPlan, plan_pending_billing: billing, plan_pending_effective_at: effectiveAt,
      }).eq("id", pharmacieId);
      return new Response(JSON.stringify({ success: true, scheduled: true, effectiveAt, newPlan }), { headers: CORS });
    }

    const lookupKey = `price_${newPlan}_${billing === "annual" ? "annual" : "monthly"}`;
    const prices = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
    const price = prices.data[0];
    if (!price) {
      return new Response(JSON.stringify({ error: `Tarif Stripe introuvable (lookup_key="${lookupKey}")` }), { status: 500, headers: CORS });
    }

    const sub = await stripe.subscriptions.retrieve(ph.stripe_subscription_id);
    await stripe.subscriptions.update(ph.stripe_subscription_id, {
      items: [{ id: sub.items.data[0].id, price: price.id }],
      proration_behavior: "create_prorations",
    });
    // @fix 29/08/2026 (Phase 2 tarification) — resynchronise sonnette_active
    // sur l'entitlement du nouveau plan (activée automatiquement en montant
    // vers Fluidité+, désactivée en redescendant vers Essentiel) — jusqu'ici
    // ce booléen restait figé à sa valeur de création, indépendant du plan.
    const sonnetteEnabled = await planHasFeature(supabase, newPlan, "sonnette");
    // Un upgrade (ou changement d'intervalle) annule un downgrade programmé
    // qui n'avait pas encore pris effet — cohérent avec "le client a changé
    // d'avis avant la fin de la période".
    await supabase.from("pharmacies").update({
      plan: newPlan, sonnette_active: sonnetteEnabled,
      plan_pending: null, plan_pending_billing: null, plan_pending_effective_at: null,
    }).eq("id", pharmacieId);
    await trimExcessPostes(supabase, pharmacieId, newPlan);

    return new Response(JSON.stringify({ success: true, newPlan }), { headers: CORS });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS });
  }
});
