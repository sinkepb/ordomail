import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.0.0";
const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion:"2023-10-16" });
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const PRICE_TO_PLAN: Record<string,string> = { price_starter_monthly:"starter", price_starter_annual:"starter", price_standard_monthly:"standard", price_standard_annual:"standard", price_pro_monthly:"pro", price_pro_annual:"pro" };
serve(async (req) => {
  const sig = req.headers.get("stripe-signature")!;
  const body = await req.text();
  let event: Stripe.Event;
  try { event = stripe.webhooks.constructEvent(body, sig, Deno.env.get("STRIPE_WEBHOOK_SECRET")!); }
  catch(e) { return new Response(`Signature invalide: ${e.message}`, { status:400 }); }
  const { data:obj } = event.data;
  if (["customer.subscription.created","customer.subscription.updated"].includes(event.type)) {
    const sub = obj as Stripe.Subscription;
    const { data:ph } = await supabase.from("pharmacies").select("id").eq("stripe_customer_id",sub.customer).single();
    if (ph) {
      const plan = PRICE_TO_PLAN[sub.items.data[0]?.price.id] || "starter";
      await supabase.from("pharmacies").update({ plan, plan_status:sub.status }).eq("id",ph.id);
      await supabase.from("abonnements").upsert({ pharmacie_id:ph.id, stripe_sub_id:sub.id, plan, status:sub.status, current_period_end:new Date(sub.current_period_end*1000).toISOString(), mrr:Math.round((sub.items.data[0]?.price.unit_amount||0)/100), updated_at:new Date().toISOString() }, { onConflict:"stripe_sub_id" });
    }
  }
  if (event.type === "invoice.payment_succeeded") {
    const inv = obj as Stripe.Invoice;
    const { data:ph } = await supabase.from("pharmacies").select("id").eq("stripe_customer_id",inv.customer).single();
    if (ph) await supabase.from("factures").upsert({ pharmacie_id:ph.id, stripe_invoice_id:inv.id, montant_ttc:inv.amount_paid, statut:"paid", pdf_url:inv.invoice_pdf, created_at:new Date(inv.created*1000).toISOString() }, { onConflict:"stripe_invoice_id" });
  }
  return new Response(JSON.stringify({ received:true }));
});
