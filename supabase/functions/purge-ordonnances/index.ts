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
import { runPurge, runRappelsPurge } from "../_shared/purgeLogic.ts";
import { verifyCronSecret } from "../_shared/webhook-secret.ts";

serve(async (req) => {
  const CORS = corsHeaders(req, {
    "Access-Control-Allow-Headers": "content-type, authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  });
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  // Fail-closed (01/10/2026, audit) — l'ancien `if (cronSecret && header !==
  // cronSecret)` laissait passer tous les appels si PURGE_CRON_SECRET
  // n'était pas configuré côté serveur : n'importe qui pouvait déclencher la
  // purge RGPD des ordonnances sans authentification. Le déclenchement
  // backoffice (secure-data-admin:admin_purge_run) appelle runPurge()
  // directement, jamais cet endpoint HTTP — aucun impact sur ce chemin.
  if (!verifyCronSecret(req, "PURGE_CRON_SECRET")) {
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
    // Purge des rappels de renouvellement terminés (01/10/2026, audit RGPD)
    // — endpoint séparé de celui des ordonnances ci-dessus, résultat imbriqué
    // sous `rappels` plutôt que fusionné au niveau racine (rien ne consomme
    // ce JSON côté applicatif — réponse HTTP d'un cron fire-and-forget —
    // mais éviter toute collision de clé avec `result` reste plus sûr).
    const rappelsResult = await runRappelsPurge(sb, "cron");
    if (rappelsResult.skipped) {
      console.log(`[purge-rappels] ${rappelsResult.reason} — aucune suppression.`);
    } else {
      console.log(`[purge-rappels] Terminé — ${rappelsResult.deleted} rappel(s) terminé(s) supprimé(s) (rétention ${rappelsResult.retentionDays}j)`);
    }
    return new Response(JSON.stringify({ success: true, ...result, rappels: rappelsResult }), { headers: CORS });
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
