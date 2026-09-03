// OrdoMail — Edge Function apply-pending-downgrades (Phase 6 tarification, §13)
// Applique les downgrades programmés (change-plan les a enregistrés dans
// pharmacies.plan_pending sans rien toucher tout de suite — voir ce
// fichier) une fois leur période de facturation en cours réellement
// écoulée. Déclenchée par pg_cron, quotidienne (même schéma que
// purge-ordonnances) — pas de vérification de session : appelée uniquement
// par le planificateur interne, jamais par un client.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.0.0";
import { corsHeaders } from "../_shared/cors.ts";
import { trimExcessPostes } from "../_shared/trimPostes.ts";
import { planHasFeature } from "../_shared/planFeatures.ts";
import { reportAlert } from "../_shared/alert.ts";

Deno.serve(async (req) => {
  const CORS = corsHeaders(req, { "Content-Type": "application/json" });
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const cronSecret = req.headers.get("x-cron-secret") || new URL(req.url).searchParams.get("secret");
  if (cronSecret !== Deno.env.get("PURGE_CRON_SECRET")) {
    return new Response(JSON.stringify({ error: "Non autorisé" }), { status: 401, headers: CORS });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2023-10-16" });

  const { data: pending, error } = await supabase.from("pharmacies")
    .select("id, plan_pending, plan_pending_billing, stripe_subscription_id")
    .not("plan_pending", "is", null)
    .lte("plan_pending_effective_at", new Date().toISOString());
  if (error) {
    await reportAlert(supabase, { source: "apply-pending-downgrades", severity: "critical", message: `Lecture des downgrades en attente échouée — ${error.message}` });
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: CORS });
  }

  let applied = 0;
  const errors: string[] = [];
  for (const ph of pending || []) {
    try {
      const newPlan = ph.plan_pending!;
      const lookupKey = `price_${newPlan}_${ph.plan_pending_billing === "annual" ? "annual" : "monthly"}`;
      const prices = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
      if (!prices.data[0]) throw new Error(`Tarif Stripe introuvable (lookup_key="${lookupKey}")`);
      if (ph.stripe_subscription_id) {
        const sub = await stripe.subscriptions.retrieve(ph.stripe_subscription_id);
        // proration_behavior "none" : le prix a déjà été facturé au tarif
        // précédent jusqu'à cette date, pas de double-décompte à la bascule.
        await stripe.subscriptions.update(ph.stripe_subscription_id, {
          items: [{ id: sub.items.data[0].id, price: prices.data[0].id }],
          proration_behavior: "none",
        });
      }
      const sonnetteEnabled = await planHasFeature(supabase, newPlan, "sonnette");
      await supabase.from("pharmacies").update({
        plan: newPlan, sonnette_active: sonnetteEnabled,
        plan_pending: null, plan_pending_billing: null, plan_pending_effective_at: null,
      }).eq("id", ph.id);
      await trimExcessPostes(supabase, ph.id, newPlan);
      applied++;
    } catch (e) {
      errors.push(`${ph.id}: ${(e as Error).message}`);
    }
  }

  if (errors.length) {
    await reportAlert(supabase, {
      source: "apply-pending-downgrades", severity: "warning",
      message: `${errors.length} downgrade(s) en échec sur ${(pending || []).length}`,
      meta: { errors },
    });
  }

  return new Response(JSON.stringify({ applied, errors, total: (pending || []).length }), { headers: CORS });
});
