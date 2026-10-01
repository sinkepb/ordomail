// Edge Function : send-rappel-sms
// Appelée chaque matin par pg_cron (voir migration 20260904_rappels_ordonnance.sql
// pour la syntaxe du job à créer, même principe que purge-ordonnances) — trouve
// les rappels de renouvellement d'ordonnance échus (J+21) et envoie le SMS
// (adaptateur mock pour l'instant, voir _shared/sms.ts).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { reportAlert } from "../_shared/alert.ts";
import { runRappelScan, runRelanceEtEscaladeScan } from "../_shared/rappelLogic.ts";
import { verifyCronSecret } from "../_shared/webhook-secret.ts";

serve(async (req) => {
  const CORS = corsHeaders(req, {
    "Access-Control-Allow-Headers": "content-type, authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  });
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  // Fail-closed (01/10/2026, audit) — l'ancien `if (cronSecret && header !==
  // cronSecret)` laissait passer tous les appels si RAPPEL_CRON_SECRET
  // n'était pas configuré côté serveur : n'importe qui pouvait déclencher
  // l'envoi de vrais SMS à tous les patients dus, sans authentification.
  if (!verifyCronSecret(req, "RAPPEL_CRON_SECRET")) {
    return new Response(JSON.stringify({ error: "Non autorisé" }), { status: 401, headers: CORS });
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const appUrl = Deno.env.get("APP_URL") || "https://ordomail.fr";
    const result = await runRappelScan(sb, appUrl);
    const relanceResult = await runRelanceEtEscaladeScan(sb, appUrl);
    console.log(`[rappel] ${result.scanned} échu(s) — ${result.sent} envoyé(s), ${result.appeler} à appeler, ${result.failed} échec(s) — ${relanceResult.relances} relance(s), ${relanceResult.escalades} escalade(s) sans réponse`);
    return new Response(JSON.stringify({ success: true, ...result, ...relanceResult }), { headers: CORS });
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
