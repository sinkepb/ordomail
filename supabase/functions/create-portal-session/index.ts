// OrdoMail — Edge Function create-portal-session (Phase 5 tarification, §16)
// Génère un lien vers le Portail client Stripe (hébergé par Stripe) — pour
// mettre à jour le moyen de paiement, voir les factures et annuler
// l'abonnement en toute sécurité, sans construire/maintenir ces flux
// sensibles nous-mêmes (numéro de carte, confirmation d'annulation…).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.0.0";
import { corsHeaders } from "../_shared/cors.ts";
import { resolveAppOrigin } from "../_shared/checkout.ts";

Deno.serve(async (req) => {
  const CORS = corsHeaders(req, {
    "Access-Control-Allow-Headers": "content-type, authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  });
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const callerToken = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!callerToken) {
      return new Response(JSON.stringify({ error: "Authentification requise" }), { status: 401, headers: CORS });
    }

    const { pharmacieId, appUrl } = await req.json();
    if (!pharmacieId) {
      return new Response(JSON.stringify({ error: "pharmacieId requis" }), { status: 400, headers: CORS });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: userData, error: userErr } = await supabase.auth.getUser(callerToken);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Session invalide ou expirée" }), { status: 401, headers: CORS });
    }
    const { data: link } = await supabase.from("pharmacie_users").select("pharmacie_id, role").eq("id", userData.user.id).maybeSingle();
    if (!link || link.pharmacie_id !== pharmacieId || link.role !== "admin") {
      return new Response(JSON.stringify({ error: "Vous n'êtes pas autorisé à gérer cet abonnement" }), { status: 403, headers: CORS });
    }

    const { data: ph } = await supabase.from("pharmacies").select("stripe_customer_id").eq("id", pharmacieId).maybeSingle();
    if (!ph?.stripe_customer_id) {
      return new Response(JSON.stringify({ error: "Pas de client Stripe associé à cette pharmacie" }), { status: 400, headers: CORS });
    }

    const ALLOWED_APP_ORIGINS = [Deno.env.get("APP_URL"), "https://ordomail.fr", "http://localhost:5173", "http://127.0.0.1:5173"];
    const base = resolveAppOrigin(appUrl, ALLOWED_APP_ORIGINS, Deno.env.get("APP_URL") || "https://ordomail.fr");

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2023-10-16" });
    const session = await stripe.billingPortal.sessions.create({
      customer: ph.stripe_customer_id,
      return_url: `${base}/?checkout=portal-return`,
    });

    return new Response(JSON.stringify({ url: session.url }), { headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS });
  }
});
