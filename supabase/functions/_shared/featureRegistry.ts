// Catalogue des fonctionnalités réglables par pharmacie depuis le
// back-office (06/10/2026) — voir src/lib/featureRegistry.js (même
// catalogue, à garder synchronisé) et la migration 20261013_feature_overrides.
export interface FonctionnaliteDef {
  cle: string;
  label: string;
  description: string;
  defaut: boolean;
}

export const FONCTIONNALITES: FonctionnaliteDef[] = [
  {
    cle: "cadrage_manuel",
    label: "Cadrage manuel de la photo",
    description: "Le patient ajuste les coins avant l'envoi. Désactivé : recadrage automatique uniquement, sans étape supplémentaire.",
    defaut: true,
  },
];

export const CLES_FONCTIONNALITES: string[] = FONCTIONNALITES.map((f) => f.cle);

export function fonctionnaliteActive(overrides: Record<string, boolean> | null | undefined, cle: string): boolean {
  const entree = FONCTIONNALITES.find((f) => f.cle === cle);
  const defaut = entree ? entree.defaut : false;
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, cle)) return !!overrides[cle];
  return defaut;
}
