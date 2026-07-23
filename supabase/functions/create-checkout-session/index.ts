// OrdoMail — Edge Function create-checkout-session
// @phase3 24/07/2026
//
// Remplace le formulaire de carte factice de BillingModule (numéro/expiration/CVC
// saisis en state React, jamais envoyés nulle part malgré la mention "Données
// chiffrées par Stripe") par une vraie session Stripe Checkout hébergée : le
// numéro de carte ne transite jamais par le code OrdoMail, uniquement par les
// pages Stripe (hors périmètre PCI-DSS pour nous).
//
// Les Price Stripe sont retrouvés par "lookup_key" (price_starter_monthly, etc.)
// et non par un ID littéral : Stripe génère toujours des ID aléatoires
// (price_1AbC2D...), on ne peut pas choisir l'ID directement. Voir
// DEPLOIEMENT_PHASE3_STRIPE.md pour créer ces Price avec la bonne lookup_key.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.0.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const TRIAL_DAYS = 30;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const { pharmacieId, plan, billing, email, appUrl } = await req.json();
    if (!pharmacieId || !plan || !billing || !email) {
      return new Response(JSON.stringify({ error: "pharmacieId, plan, billing, email requis" }),
        { status: 400, headers: CORS });
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2023-10-16" });
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. Vérifier que la pharmacie existe
    const { data: ph, error: phErr } = await supabase
      .from("pharmacies")
      .select("id, stripe_customer_id")
      .eq("id", pharmacieId)
      .maybeSingle();
    if (phErr || !ph) {
      return new Response(JSON.stringify({ error: "Pharmacie introuvable" }),
        { status: 404, headers: CORS });
    }

    // 2. Retrouver le Price Stripe par lookup_key (voir note en tête de fichier)
    const lookupKey = `price_${plan}_${billing === "annual" ? "annual" : "monthly"}`;
    const prices = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
    const price = prices.data[0];
    if (!price) {
      return new Response(
        JSON.stringify({ error: `Tarif Stripe introuvable (lookup_key="${lookupKey}") — voir DEPLOIEMENT_PHASE3_STRIPE.md` }),
        { status: 500, headers: CORS },
      );
    }

    // 3. Créer (ou réutiliser) le Customer Stripe, et le mémoriser tout de suite sur la
    // pharmacie — stripe-webhook en a besoin pour retrouver la pharmacie au retour du
    // paiement (customer.subscription.created cherche par stripe_customer_id).
    let customerId = ph.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({ email, metadata: { pharmacie_id: pharmacieId } });
      customerId = customer.id;
      await supabase.from("pharmacies").update({ stripe_customer_id: customerId }).eq("id", pharmacieId);
    }

    // 4. Créer la session Checkout — essai gratuit 30 jours, carte requise dès
    // maintenant, premier prélèvement automatique à l'issue de l'essai.
    const base = appUrl || Deno.env.get("APP_URL") || "https://ordomail.fr";
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: pharmacieId,
      line_items: [{ price: price.id, quantity: 1 }],
      subscription_data: { trial_period_days: TRIAL_DAYS, metadata: { pharmacie_id: pharmacieId } },
      success_url: `${base}/?checkout=success`,
      cancel_url: `${base}/?checkout=cancelled`,
    });

    return new Response(JSON.stringify({ url: session.url }), { headers: CORS });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS });
  }
});
