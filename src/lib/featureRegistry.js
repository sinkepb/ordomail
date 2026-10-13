// Catalogue des fonctionnalités réglables par pharmacie depuis le
// back-office (06/10/2026). Chaque nouvelle fonctionnalité de ce type
// s'ajoute ici, sans migration ni nouvel écran : ClientDetail.jsx (back-
// office) lit ce même catalogue pour générer ses interrupteurs. Garder en
// synchronisation avec supabase/functions/_shared/featureRegistry.ts (les
// deux environnements ne partagent pas de bundler).
export const FONCTIONNALITES = [
  {
    cle: "cadrage_manuel",
    label: "Cadrage manuel de la photo",
    description: "Le patient ajuste les coins avant l'envoi. Désactivé : recadrage automatique uniquement, sans étape supplémentaire.",
    defaut: true,
  },
];

// Vrai/faux pour une pharmacie donnée : l'exception mémorisée sur la
// pharmacie (feature_overrides) l'emporte sur le défaut du catalogue.
export function fonctionnaliteActive(pharmacie, cle) {
  const entree = FONCTIONNALITES.find(f => f.cle === cle);
  const defaut = entree ? entree.defaut : false;
  const overrides = pharmacie?.feature_overrides;
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, cle)) return !!overrides[cle];
  return defaut;
}
