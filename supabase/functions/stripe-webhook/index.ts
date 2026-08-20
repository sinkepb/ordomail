import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.0.0";
import { resolvePlan } from "../_shared/webhook-plan.ts";
import { reportAlert } from "../_shared/alert.ts";
const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion:"2023-10-16" });
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
serve(async (req) => {
  const sig = req.headers.get("stripe-signature")!;
  const body = await req.text();
  let event: Stripe.Event;
  try { event = stripe.webhooks.constructEvent(body, sig, Deno.env.get("STRIPE_WEBHOOK_SECRET")!); }
  catch(e) {
    // Signature invalide : secret désynchronisé (rotation Stripe) ou tentative
    // de forger un événement — dans les deux cas, la facturation peut être
    // impactée silencieusement si ça se répète. Alerte critique.
    await reportAlert(supabase, {
      source: "stripe-webhook", severity: "critical",
      message: `Signature invalide — ${e.message}`,
    });
    return new Response(`Signature invalide: ${e.message}`, { status:400 });
  }
  const { data:obj } = event.data;
  try {
    if (["customer.subscription.created","customer.subscription.updated"].includes(event.type)) {
      const sub = obj as Stripe.Subscription;
      const { data:ph } = await supabase.from("pharmacies").select("id").eq("stripe_customer_id",sub.customer).single();
      if (ph) {
        const lookupKey = sub.items.data[0]?.price.lookup_key;
        const { plan, known } = resolvePlan(lookupKey);
        if (!known) {
          console.error(`[stripe-webhook] lookup_key inconnu ou absent pour sub ${sub.id} — repli sur "${plan}"`);
          await reportAlert(supabase, {
            source: "stripe-webhook", severity: "warning",
            message: `lookup_key inconnu pour l'abonnement ${sub.id} — plan "${plan}" appliqué par défaut, à vérifier`,
            meta: { subId: sub.id, lookupKey },
          });
        }
        // ⚠️ Ré-audit du 19/08/2026 : stripe_subscription_id n'était JAMAIS écrit nulle
        // part (grep sur tout le repo) — App.jsx s'en sert désormais comme signal
        // "abonnement Stripe actif ?" pour décider dashboard vs reprise de paiement
        // (voir l'effet "Restaurer la session"), donc cette colonne restant toujours
        // NULL renvoyait TOUT LE MONDE, y compris un client déjà abonné, vers l'écran
        // de paiement à chaque connexion. Un client réel (dr PATOGAN, sub_1TwZYJ...)
        // était concerné en production au moment de la découverte — corrigé manuellement
        // en base pour lui, ce correctif couvre tous les abonnements à venir.
        await supabase.from("pharmacies").update({ plan, plan_status:sub.status, stripe_subscription_id:sub.id }).eq("id",ph.id);
        await supabase.from("abonnements").upsert({ pharmacie_id:ph.id, stripe_sub_id:sub.id, plan, status:sub.status, current_period_end:new Date(sub.current_period_end*1000).toISOString(), mrr:Math.round((sub.items.data[0]?.price.unit_amount||0)/100), updated_at:new Date().toISOString() }, { onConflict:"stripe_sub_id" });
      }
    }
    if (event.type === "invoice.payment_succeeded") {
      const inv = obj as Stripe.Invoice;
      const { data:ph } = await supabase.from("pharmacies").select("id").eq("stripe_customer_id",inv.customer).single();
      if (ph) await supabase.from("factures").upsert({ pharmacie_id:ph.id, stripe_invoice_id:inv.id, montant_ttc:inv.amount_paid, statut:"paid", pdf_url:inv.invoice_pdf, created_at:new Date(inv.created*1000).toISOString() }, { onConflict:"stripe_invoice_id" });
    }
    // Échec de prélèvement automatique (carte refusée, fonds insuffisants…) — jusqu'ici
    // aucun événement Stripe lié à un échec de paiement n'était traité : le statut de
    // l'abonnement finissait par se mettre à jour via customer.subscription.updated
    // (Stripe le fait passer par past_due puis canceled après épuisement des relances),
    // mais rien ne rendait l'échec visible au moment où il se produit — ni dans
    // `factures`, ni en alerte. montant_ttc utilise amount_due (ce qui était dû) et non
    // amount_paid (qui vaut 0 pour une facture en échec) ; statut reflète l'état réel
    // renvoyé par Stripe (généralement "open" tant que les relances automatiques
    // continuent, "uncollectible" une fois épuisées).
    if (event.type === "invoice.payment_failed") {
      const inv = obj as Stripe.Invoice;
      const { data:ph } = await supabase.from("pharmacies").select("id").eq("stripe_customer_id",inv.customer).single();
      if (ph) {
        await supabase.from("factures").upsert({ pharmacie_id:ph.id, stripe_invoice_id:inv.id, montant_ttc:inv.amount_due, statut:inv.status || "open", pdf_url:inv.invoice_pdf, created_at:new Date(inv.created*1000).toISOString() }, { onConflict:"stripe_invoice_id" });
        await reportAlert(supabase, {
          source: "stripe-webhook", severity: "warning",
          message: `Échec de prélèvement — pharmacie ${ph.id}, facture ${inv.id}`,
          meta: { pharmacieId: ph.id, invoiceId: inv.id, amountDue: inv.amount_due },
        });
      }
    }
  } catch (e) {
    // Événement Stripe valide et signé, mais échec de son traitement côté
    // OrdoMail (DB indisponible, contrainte violée…) — la facturation peut
    // désynchroniser silencieusement si personne ne le voit. Alerte critique.
    await reportAlert(supabase, {
      source: "stripe-webhook", severity: "critical",
      message: `Échec traitement événement ${event.type} — ${(e as Error).message}`,
      meta: { eventType: event.type, eventId: event.id },
    });
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
  }
  return new Response(JSON.stringify({ received:true }));
});
