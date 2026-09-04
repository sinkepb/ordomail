// Edge Function : send-rappel-sms
// Appelée chaque matin par pg_cron (voir migration 20260904_rappels_ordonnance.sql
// pour la syntaxe du job à créer, même principe que purge-ordonnances) — trouve
// les rappels de renouvellement d'ordonnance échus (J+21) et envoie le SMS
// (adaptateur mock pour l'instant, voir _shared/sms.ts).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { reportAlert } from "../_shared/alert.ts";
import { runRappelScan } from "../_shared/rappelLogic.ts";

serve(async (req) => {
  const CORS = corsHeaders(req, {
    "Access-Control-Allow-Headers": "content-type, authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  });
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const cronSecret = Deno.env.get("RAPPEL_CRON_SECRET");
  if (cronSecret && req.headers.get("x-cron-secret") !== cronSecret) {
    return new Response(JSON.stringify({ error: "Non autorisé" }), { status: 401, headers: CORS });
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const appUrl = Deno.env.get("APP_URL") || "https://ordomail.fr";
    const result = await runRappelScan(sb, appUrl);
    console.log(`[rappel] ${result.scanned} échu(s) — ${result.sent} envoyé(s), ${result.failed} échec(s)`);
    return new Response(JSON.stringify({ success: true, ...result }), { headers: CORS });
  } catch (e) {
    console.error("[rappel] EXCEPTION:", (e as Error).message);
    await reportAlert(sb, {
      source: "send-rappel-sms",
      severity: "critical",
      message: `Exception — ${(e as Error).message}`,
    });
    return new Response(
      JSON.stringify({ success: false, error: (e as Error).message }),
      { status: 500, headers: CORS },
    );
  }
});
