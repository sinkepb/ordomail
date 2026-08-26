// Logique de purge partagée entre purge-ordonnances (cron nocturne) et
// secure-data-admin:admin_purge_run (déclenchement manuel depuis le
// backoffice, 25/08/2026) — un seul endroit qui décide de ce qui est
// supprimé, pour ne jamais faire diverger les deux chemins.
import { reportAlert } from "./alert.ts";

const BATCH_SIZE = 200; // évite un IN(...) démesuré sur un premier run avec gros historique

export interface PurgeResult {
  skipped: boolean;
  reason?: string;
  deleted: number;
  retentionDays: number | null;
  errors: string[];
}

export async function runPurge(sb: any, triggeredBy: string): Promise<PurgeResult> {
  const { data: settings, error: settingsErr } = await sb
    .from("retention_settings")
    .select("ordonnances_retention_days")
    .eq("id", 1)
    .maybeSingle();
  if (settingsErr) throw new Error(settingsErr.message);

  const days = settings?.ordonnances_retention_days;
  if (!days) {
    return { skipped: true, reason: "Rétention non configurée", deleted: 0, retentionDays: null, errors: [] };
  }

  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
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

    const paths = batch.filter((o: any) => o.fichier_url).map((o: any) => o.fichier_url as string);
    if (paths.length) {
      const { error: rmErr } = await sb.storage.from("ordonnances-files").remove(paths);
      // Best effort : un fichier déjà absent ne doit pas bloquer la suppression
      // de la ligne DB correspondante — mais on le journalise pour audit.
      if (rmErr) errors.push(`storage: ${rmErr.message}`);
    }

    const ids = batch.map((o: any) => o.id);
    const { error: delErr } = await sb.from("ordonnances").delete().in("id", ids);
    if (delErr) throw new Error(delErr.message);

    totalDeleted += ids.length;
    if (batch.length < BATCH_SIZE) break; // dernier lot
  }

  if (totalDeleted > 0) {
    await reportAlert(sb, {
      source: "purge-ordonnances",
      severity: "info",
      message: `${totalDeleted} ordonnance(s) purgée(s) (rétention ${days} jours, déclenché par ${triggeredBy})`,
      meta: { count: totalDeleted, retentionDays: days, triggeredBy, storageErrors: errors },
    });
  }

  return { skipped: false, deleted: totalDeleted, retentionDays: days, errors };
}
