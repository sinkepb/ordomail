// Postes actifs > limite du plan en cours : jamais autorisé, quel que soit le
// chemin par lequel le plan a changé (self-service via change-plan, webhook
// Stripe suite à une action côté client Stripe, ou changement manuel depuis
// le backoffice admin) — jusqu'ici seul le flux self-service désactivait les
// postes excédentaires (UpgradeModal.jsx, côté client, contournable), les deux
// autres chemins laissaient la base dans un état incohérent (25/08/2026).
//
// Dupliqué depuis src/lib/plans.js:PLAN_LIMITS (même limitation déjà en place
// pour AdminPage.jsx — pas d'import cross-runtime possible entre le bundle
// Vite et les Edge Functions Deno).
const MAX_POSTES: Record<string, number> = { starter: 2, standard: 5, pro: 15 };

export async function trimExcessPostes(sb: any, pharmacieId: string, plan: string): Promise<void> {
  const limit = MAX_POSTES[plan] ?? 2;
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
