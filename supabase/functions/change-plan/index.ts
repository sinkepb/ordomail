import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.0.0";
const PRICE_IDS: Record<string,Record<string,string>> = {
  starter:  { monthly:"price_starter_monthly",  annual:"price_starter_annual"  },
  standard: { monthly:"price_standard_monthly", annual:"price_standard_annual" },
  pro:      { monthly:"price_pro_monthly",       annual:"price_pro_annual"      },
};
serve(async (req) => {
  const { pharmacieId, newPlan, billing } = await req.json();
  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion:"2023-10-16" });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data:ph } = await supabase.from("pharmacies").select("stripe_subscription_id").eq("id",pharmacieId).single();
  if (!ph?.stripe_subscription_id) return new Response(JSON.stringify({ error:"Pas d'abonnement" }), { status:400 });
  const sub = await stripe.subscriptions.retrieve(ph.stripe_subscription_id);
  const priceId = PRICE_IDS[newPlan]?.[billing];
  await stripe.subscriptions.update(ph.stripe_subscription_id, { items:[{ id:sub.items.data[0].id, price:priceId }], proration_behavior:"create_prorations" });
  await supabase.from("pharmacies").update({ plan:newPlan }).eq("id",pharmacieId);
  return new Response(JSON.stringify({ success:true, newPlan }));
});
