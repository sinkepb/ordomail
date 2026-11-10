// Prolongation de l'essai gratuit d'une pharmacie (10/11/2026, demande du
// responsable : pouvoir offrir un mois d'essai supplémentaire à un client
// précis, sans toucher à la durée standard de 30 jours des autres).
//
// L'essai est porté par l'abonnement Stripe (trial_period_days à la création
// de la session de paiement, voir create-checkout-session) : c'est Stripe qui
// décide du jour du premier prélèvement. Prolonger l'essai = repousser le
// `trial_end` de l'abonnement ; ce module ne fait que CALCULER la nouvelle
// date et valider la demande — aucun appel externe ici, donc testable seul.
//
// Règles :
// - uniquement pendant un essai EN COURS (trial_end dans le futur). Une fois
//   l'essai terminé, le client a déjà été prélevé : offrir du temps gratuit
//   passerait alors par un avoir côté Stripe, pas par cette fonction ;
// - la prolongation s'AJOUTE à la fin d'essai actuelle (pas à "maintenant"),
//   sinon un clic au dixième jour ferait perdre vingt jours déjà acquis ;
// - bornée (1 à 90 jours par action, 1 an d'essai au total) : garde-fou contre
//   une faute de frappe (3000 jours) plutôt qu'une règle commerciale.

export const MAX_JOURS_PAR_PROLONGATION = 90;
export const MAX_JOURS_ESSAI_TOTAL = 365;
const JOUR_SEC = 86400;

export type ResultatProlongation =
  | { ok: true; nouvelleFinSec: number }
  | { ok: false; error: string };

/**
 * @param finEssaiActuelleSec fin d'essai actuelle (secondes Unix, `trial_end` Stripe)
 * @param jours               nombre de jours à offrir
 * @param maintenantSec       horloge (secondes Unix), injectée pour les tests
 */
export function calculerNouvelleFinEssai(
  finEssaiActuelleSec: number | null | undefined,
  jours: unknown,
  maintenantSec: number,
): ResultatProlongation {
  const n = typeof jours === "number" ? jours : Number(jours);
  if (!Number.isInteger(n) || n < 1) {
    return { ok: false, error: "Le nombre de jours doit être un entier d'au moins 1." };
  }
  if (n > MAX_JOURS_PAR_PROLONGATION) {
    return { ok: false, error: `Maximum ${MAX_JOURS_PAR_PROLONGATION} jours par prolongation.` };
  }
  if (!finEssaiActuelleSec || finEssaiActuelleSec <= maintenantSec) {
    return { ok: false, error: "L'essai n'est pas en cours : impossible de le prolonger." };
  }
  const nouvelleFinSec = finEssaiActuelleSec + n * JOUR_SEC;
  if (nouvelleFinSec - maintenantSec > MAX_JOURS_ESSAI_TOTAL * JOUR_SEC) {
    return { ok: false, error: `L'essai total ne peut pas dépasser ${MAX_JOURS_ESSAI_TOTAL} jours à partir d'aujourd'hui.` };
  }
  return { ok: true, nouvelleFinSec };
}
