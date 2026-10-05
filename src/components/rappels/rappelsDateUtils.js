import { normalizeTel, estNumeroFixe } from "../../lib/telephone.js";
import { toDateInputValue } from "../../lib/dates.js";
export { normalizeTel, estNumeroFixe, toDateInputValue };
// Téléphone + conversions de dates du module Rappels — extrait de
// RappelsSection.jsx (02/10/2026, découpage). Même règle de détection
// fixe/mobile que _shared/telephone.ts côté serveur (qui reste la source de
// vérité enregistrée en base) : ici uniquement pour préremplir l'UI.

export function telValide(v) {
  return /^(0|\+33)[1-9]\d{8}$/.test(normalizeTel(v));
}
// Format YYYY-MM-DD attendu par <input type="date">.
export function shiftDate(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
export function todayDateInputValue() {
  return toDateInputValue(new Date());
}

// Le pharmacien saisit la date de RENOUVELLEMENT de l'ordonnance (14/09/2026)
// — celle indiquée par le médecin/le traitement — pas la date d'envoi du SMS.
// L'app calcule elle-même l'envoi REMINDER_LEAD_DAYS avant cette échéance ;
// date_prochaine_relance en base reste la date d'envoi réelle (colonne et
// logique serveur inchangées), seule la conversion aller-retour change ici.
export const REMINDER_LEAD_DAYS = 7;
// J+21 pour la date d'envoi (comportement historique inchangé par défaut) =
// J+28 pour la date de renouvellement une fois qu'on retranche les 7 jours.
export function defaultDateRenouvellement() {
  return toDateInputValue(shiftDate(new Date(), 21 + REMINDER_LEAD_DAYS));
}
// Date de renouvellement -> date d'envoi du SMS (ce qui part au serveur).
export function renouvellementVersEnvoi(dateRenouvellement) {
  return toDateInputValue(shiftDate(new Date(dateRenouvellement), -REMINDER_LEAD_DAYS));
}
// Date d'envoi stockée -> date de renouvellement affichée (édition d'un rappel existant).
export function envoiVersRenouvellement(dateEnvoi) {
  return toDateInputValue(shiftDate(new Date(dateEnvoi), REMINDER_LEAD_DAYS));
}

// Prochaine date de RENOUVELLEMENT par défaut selon le choix du patient
// (04/09/2026, +7j de délai SMS le 14/09/2026) — J+28 pour un renouvellement
// (total ou partiel, soit J+21 d'envoi + 7 jours d'avance), ou un écart
// croissant pour "ne rien prendre" (numéro de cycle ACTUEL, avant
// incrémentation, ×31 jours + 21, +7) : un patient qui décline plusieurs
// fois de suite n'a pas besoin d'être rappelé aussi souvent. Même formule
// que côté serveur (secure-data:rappels_traiter) pour la date d'ENVOI —
// dupliquée ici pour pré-remplir le champ, le serveur reste la source de
// vérité qui valide la date finale envoyée (voir renouvellementVersEnvoi).
export function defaultDateForChoix(rappel) {
  const jours = (rappel.choix_patient === "rien" ? rappel.cycle_numero * 31 + 21 : 21) + REMINDER_LEAD_DAYS;
  return toDateInputValue(shiftDate(new Date(), jours));
}
