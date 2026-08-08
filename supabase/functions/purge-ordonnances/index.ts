// Edge Function : purge-ordonnances
// Appelée chaque nuit par pg_cron (même schéma que snapshot-metriques)
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

const BATCH_SIZE = 200; // évite un IN(...) démesuré sur un premier run avec gros historique

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
    const { data: settings, error: settingsErr } = await sb
      .from("retention_settings")
      .select("ordonnances_retention_days")
      .eq("id", 1)
      .maybeSingle();
    if (settingsErr) throw new Error(settingsErr.message);

    const days = settings?.ordonnances_retention_days;
    if (!days) {
      console.log("[purge] Rétention non configurée — aucune suppression.");
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "Rétention non configurée" }),
        { headers: CORS },
      );
    }

    const cutoff = new Date(Date.now() - days * 86400000).toISOString();
    console.log(`[purge] Seuil : ${days} jours — suppression avant ${cutoff}`);

    let totalDeleted = 0;
    const errors: string[] = [];

    // Boucle par lots — une ordonnance purgée sort du critère `lt(received_at)`
    // au tour suivant, donc reprendre depuis le début à chaque itération est
    // correct (pas de pagination par offset à gérer).
    for (;;) {
      const { data: batch, error: selErr } = await sb
        .from("ordonnances")
        .select("id, fichier_url")
        .lt("received_at", cutoff)
        .limit(BATCH_SIZE);
      if (selErr) throw new Error(selErr.message);
      if (!batch || batch.length === 0) break;

      const paths = batch.filter((o) => o.fichier_url).map((o) => o.fichier_url as string);
      if (paths.length) {
        const { error: rmErr } = await sb.storage.from("ordonnances-files").remove(paths);
        // Best effort : un fichier déjà absent ne doit pas bloquer la suppression
        // de la ligne DB correspondante — mais on le journalise pour audit.
        if (rmErr) {
          console.error("[purge] Échec suppression fichiers:", rmErr.message);
          errors.push(`storage: ${rmErr.message}`);
        }
      }

      const ids = batch.map((o) => o.id);
      const { error: delErr } = await sb.from("ordonnances").delete().in("id", ids);
      if (delErr) throw new Error(delErr.message);

      totalDeleted += ids.length;
      if (batch.length < BATCH_SIZE) break; // dernier lot
    }

    console.log(`[purge] Terminé — ${totalDeleted} ordonnance(s) supprimée(s)`);

    if (totalDeleted > 0) {
      await reportAlert(sb, {
        source: "purge-ordonnances",
        severity: "info",
        message: `${totalDeleted} ordonnance(s) purgée(s) automatiquement (rétention ${days} jours)`,
        meta: { count: totalDeleted, retentionDays: days, storageErrors: errors },
      });
    }

    return new Response(
      JSON.stringify({ success: true, deleted: totalDeleted, retentionDays: days }),
      { headers: CORS },
    );
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
