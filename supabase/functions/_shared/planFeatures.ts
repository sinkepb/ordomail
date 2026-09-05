// Source de vérité unique côté serveur pour les limites/fonctionnalités par
// plan — lit pricing_plans (éditable en backoffice, onglet Tarifs), plus de
// valeurs dupliquées/codées en dur à travers les edge functions. Équivalent
// Deno de hasFeature()/getLimit() côté client (src/lib/plans.js) et de
// plan_has_feature() côté SQL (policies RLS, voir migration
// 20260829_phase2_feature_gating.sql).

const FEATURE_COLUMNS: Record<string, string> = {
  offresStories: "feature_offres_stories",
  sonnette: "feature_sonnette",
  rappels: "feature_rappels",
};

export async function getPlanLimit(sb: any, plan: string, limit: "maxPostes"): Promise<number> {
  if (limit !== "maxPostes") throw new Error(`Limite inconnue: ${limit}`);
  const { data } = await sb.from("pricing_plans").select("max_postes").eq("id", plan).maybeSingle();
  return data?.max_postes ?? 3; // repli = limite du plan le plus restrictif (Essentiel)
}

export async function planHasFeature(sb: any, plan: string, feature: keyof typeof FEATURE_COLUMNS): Promise<boolean> {
  const column = FEATURE_COLUMNS[feature];
  if (!column) return false;
  const { data } = await sb.from("pricing_plans").select(column).eq("id", plan).maybeSingle();
  return !!(data as any)?.[column];
}
