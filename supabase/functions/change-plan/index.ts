// @phase3 24/07/2026 — corrections :
//  - les Price Stripe sont retrouvés par lookup_key, pas par un ID littéral choisi
//    à la main (Stripe génère toujours des ID aléatoires — voir create-checkout-session)
//  - exige désormais la session du titulaire de la pharmacie concernée : avant ce
//    correctif, n'importe qui pouvait changer l'abonnement Stripe de n'importe
//    quelle pharmacie sans être authentifié
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.0.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

serve(async (req) => {
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

    const { data: ph } = await supabase.from("pharmacies").select("stripe_subscription_id").eq("id", pharmacieId).maybeSingle();
    if (!ph?.stripe_subscription_id) {
      return new Response(JSON.stringify({ error: "Pas d'abonnement Stripe actif" }), { status: 400, headers: CORS });
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
    await supabase.from("pharmacies").update({ plan: newPlan }).eq("id", pharmacieId);

    return new Response(JSON.stringify({ success: true, newPlan }), { headers: CORS });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS });
  }
});
