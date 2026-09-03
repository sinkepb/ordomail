// Postes actifs > limite du plan en cours : jamais autorisé, quel que soit le
// chemin par lequel le plan a changé (self-service via change-plan, webhook
// Stripe suite à une action côté client Stripe, ou changement manuel depuis
// le backoffice admin) — jusqu'ici seul le flux self-service désactivait les
// postes excédentaires (UpgradeModal.jsx, côté client, contournable), les deux
// autres chemins laissaient la base dans un état incohérent (25/08/2026).
//
// @fix 29/08/2026 (Phase 2 tarification) — la limite était codée en dur ici
// (une troisième copie désynchronisable, en plus de PLAN_LIMITS côté client
// et du trigger check_poste_limit() côté DB) : lit maintenant pricing_plans
// via getPlanLimit(), source unique partagée avec le trigger SQL.
import { getPlanLimit } from "./planFeatures.ts";

export async function trimExcessPostes(sb: any, pharmacieId: string, plan: string): Promise<void> {
  const limit = await getPlanLimit(sb, plan, "maxPostes");
  const { data: postes } = await sb
    .from("pharmacie_postes")
    .select("id, created_at")
    .eq("pharmacie_id", pharmacieId)
    .eq("actif", true)
    .order("created_at", { ascending: true });
  if (!postes || postes.length <= limit) return;
  const excessIds = postes.slice(limit).map((p: { id: string }) => p.id);
  await sb.from("pharmacie_postes").update({ actif: false }).in("id", excessIds);
}
