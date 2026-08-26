// Edge Function : purge-ordonnances
// Appelée chaque nuit par pg_cron (fréquence paramétrable depuis le
// backoffice — voir secure-data-admin:admin_purge_schedule_set) et
// déclenchable manuellement depuis l'onglet Purge du backoffice
// (secure-data-admin:admin_purge_run, même logique partagée — voir
// _shared/purgeLogic.ts).
//
// RGPD art. 5.1.e (limitation de la conservation) — supprime les ordonnances
// (fichier storage + ligne DB) plus vieilles que la durée configurée dans
// retention_settings (paramétrable depuis le backoffice OrdoMail Business).
//
// ⚠️ Ne supprime RIEN tant que retention_settings.ordonnances_retention_days
// est NULL (valeur par défaut à la création de la table, 20260809) — un
// défaut silencieux sur des données de santé serait pire qu'une purge en
// retard. La désactivation par défaut est volontaire, pas un bug.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { reportAlert } from "../_shared/alert.ts";
import { runPurge } from "../_shared/purgeLogic.ts";

serve(async (req) => {
  const CORS = corsHeaders(req, {
    "Access-Control-Allow-Headers": "content-type, authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  });
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const cronSecret = Deno.env.get("PURGE_CRON_SECRET");
  if (cronSecret && req.headers.get("x-cron-secret") !== cronSecret) {
    return new Response(JSON.stringify({ error: "Non autorisé" }), { status: 401, headers: CORS });
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const result = await runPurge(sb, "cron");
    if (result.skipped) {
      console.log(`[purge] ${result.reason} — aucune suppression.`);
    } else {
      console.log(`[purge] Terminé — ${result.deleted} ordonnance(s) supprimée(s) (rétention ${result.retentionDays}j)`);
    }
    return new Response(JSON.stringify({ success: true, ...result }), { headers: CORS });
  } catch (e) {
    console.error("[purge] EXCEPTION:", (e as Error).message);
    await reportAlert(sb, {
      source: "purge-ordonnances",
      severity: "critical",
      message: `Exception — ${(e as Error).message}`,
    });
    return new Response(
      JSON.stringify({ success: false, error: (e as Error).message }),
      { status: 500, headers: CORS },
    );
  }
});
