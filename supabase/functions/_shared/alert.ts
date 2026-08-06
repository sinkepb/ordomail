// ─── Alerting edge functions ───────────────────────────────────────────────
// 07/08/2026 — jusqu'ici Sentry (voir src/lib/monitoring.js) ne couvre que le
// frontend : une panne serveur (webhook Stripe qui échoue, dépôt d'ordonnance
// en erreur, cron snapshot-metriques cassé) était invisible tant que personne
// n'allait lire les logs Supabase manuellement. reportAlert() persiste
// l'événement dans la table `alerts` (lu par le panneau Monitoring du
// backoffice) et, pour les alertes critiques, pousse une notification
// immédiate vers ALERT_WEBHOOK_URL si ce secret est configuré (webhook
// entrant Slack/Discord/Teams — format générique, compatible avec les trois).
//
// ⚠️ Ne doit JAMAIS faire échouer l'appelant : toute erreur ici est avalée et
// journalée en console — un problème d'alerting ne doit pas empêcher
// submit-ordonnance de répondre au patient, même si l'alerte elle-même échoue.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type AlertSeverity = "critical" | "warning" | "info";

export interface AlertOptions {
  source: string; // ex: 'stripe-webhook', 'submit-ordonnance', 'snapshot-metriques'
  severity: AlertSeverity;
  message: string;
  meta?: Record<string, unknown>;
}

export async function reportAlert(sb: SupabaseClient, opts: AlertOptions): Promise<void> {
  try {
    await sb.from("alerts").insert({
      source: opts.source,
      severity: opts.severity,
      message: opts.message,
      meta: opts.meta ?? null,
    });
  } catch (e) {
    console.error("[alert] insertion échouée:", (e as Error).message);
  }

  if (opts.severity !== "critical") return;

  const webhookUrl = Deno.env.get("ALERT_WEBHOOK_URL");
  if (!webhookUrl) return;

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // "text" (Slack/Discord) — format minimal compris par les trois cibles
      // courantes sans configuration supplémentaire de notre côté.
      body: JSON.stringify({ text: `🚨 OrdoMail [${opts.source}] ${opts.message}` }),
    });
  } catch (e) {
    console.error("[alert] webhook échoué:", (e as Error).message);
  }
}
