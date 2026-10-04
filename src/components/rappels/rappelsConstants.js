// Constantes et libellés du module Rappels — extrait de RappelsSection.jsx
// (02/10/2026, découpage) pour réduire la taille du fichier container.
// Voir supabase/migrations/20260904_rappels_ordonnance.sql pour le cycle de statut.

export const STATUT_INFO = {
  en_attente: { label: "En attente", bg: "#eef2ff", fg: "#4338ca" },
  sms_envoye: { label: "SMS envoyé", bg: "#eff6ff", fg: "#1d4ed8" },
  // Patient sans mobile (30/09/2026) — numéro fixe détecté à la création,
  // le pharmacien doit appeler lui-même plutôt qu'attendre une réponse SMS
  // qui ne viendra jamais (voir _shared/telephone.ts et rappelLogic.ts).
  a_appeler:  { label: "À appeler",  bg: "#fef9c3", fg: "#a16207" },
  a_traiter:  { label: "À traiter",  bg: "#fef2f2", fg: "#dc2626" },
  // @fix 26/09/2026 — étape "préparé" (médicament rangé en casier, en
  // attente de retrait patient), entre "à traiter" et la validation finale.
  prepare:    { label: "Préparé",    bg: "#fff7ed", fg: "#c2410c" },
  termine:    { label: "Terminé",    bg: "#f0fdf4", fg: "#15803d" },
};

// Spécialités proposées (15/09/2026) — liste fermée + repli "Autre" en texte
// libre : couvre les cas les plus fréquents de renouvellement en pharmacie
// sans prétendre à l'exhaustivité de toutes les spécialités médicales.
export const SPECIALITES = [
  "Médecin généraliste", "Dentiste", "Ophtalmologue", "Cardiologue", "Dermatologue",
  "Gynécologue", "Pédiatre", "Psychiatre", "Endocrinologue / Diabétologue", "Rhumatologue",
  "Pneumologue", "Gastro-entérologue", "Neurologue", "ORL", "Urologue", "Néphrologue", "Allergologue",
];

export const CHOIX_LABEL = {
  tout_renouveler: "✅ Tout renouveler",
  rien: "🚫 Ne rien prendre",
  partiel: "🔶 Renouvellement partiel",
  stop: "⛔ Ne plus être recontacté",
};

// Créneau de retrait choisi par le patient à la confirmation (08/09/2026) —
// voir RappelChoixPage.jsx et la migration 20260908_rappels_creneau_retrait.sql.
export const CRENEAU_LABEL = {
  ce_matin: "🌅 Ce matin",
  cet_apres_midi: "☀️ Cet après-midi",
  demain_matin: "🌤️ Demain matin",
  demain_apres_midi: "🌇 Demain après-midi",
};

// Historique détaillé d'un rappel (07/09/2026) — un événement par ligne de
// rappels_evenements (voir secure-data:rappels_journal). meta varie selon le
// type : {canal, mocked, to} pour sms_envoye, {choix} pour reponse_patient,
// {error} pour sms_echec.
export const JOURNAL_INFO = {
  cree:            { icon: "🆕", label: "Rappel créé" },
  sms_envoye:      { icon: "📱", label: "SMS envoyé" },
  sms_echec:       { icon: "⚠️", label: "Échec d'envoi" },
  a_appeler:       { icon: "📞", label: "Passé à appeler (patient sans mobile)" },
  appel_effectue:  { icon: "☎️", label: "Appel de clarification effectué — passé à traiter" },
  relance_envoyee: { icon: "🔁", label: "SMS de relance envoyé (sans réponse au premier)" },
  reponse_patient: { icon: "💬", label: "Patient a répondu" },
  prepare:         { icon: "📦", label: "Médicament préparé" },
  traite:          { icon: "✅", label: "Rappel validé — nouveau cycle lancé" },
  termine:         { icon: "🔚", label: "Rappel terminé" },
  reactive:        { icon: "🔄", label: "Rappel réactivé" },
};

export function journalLigne(evt) {
  const info = JOURNAL_INFO[evt.type] || { icon: "•", label: evt.type };
  if (evt.type === "sms_envoye" && evt.meta?.canal === "email_test") {
    return { ...info, icon: "✉️", label: `Email envoyé (test${evt.meta?.to ? " → " + evt.meta.to : ""})` };
  }
  if (evt.type === "reponse_patient" && evt.meta?.canal === "appel" && evt.meta?.choix) {
    return { ...info, icon: "📞", label: `Réponse enregistrée par téléphone : ${CHOIX_LABEL[evt.meta.choix] || evt.meta.choix}` };
  }
  if (evt.type === "reponse_patient" && evt.meta?.apres_escalade && evt.meta?.choix) {
    return { ...info, label: `Patient a répondu (après escalade "à appeler") : ${CHOIX_LABEL[evt.meta.choix] || evt.meta.choix} — appel devenu inutile` };
  }
  if (evt.type === "reponse_patient" && evt.meta?.choix) {
    return { ...info, label: `Patient a répondu : ${CHOIX_LABEL[evt.meta.choix] || evt.meta.choix}` };
  }
  if (evt.type === "sms_echec" && evt.meta?.error) {
    const compte = evt.meta?.echecs ? ` (échec n°${evt.meta.echecs})` : "";
    return { ...info, label: `Échec d'envoi${evt.meta?.relance ? " (relance)" : ""}${compte} — ${evt.meta.error}` };
  }
  if (evt.type === "a_appeler" && evt.meta?.motif === "sans_reponse") {
    return { ...info, label: "Passé à appeler — aucune réponse après relance" };
  }
  if (evt.type === "a_appeler" && evt.meta?.motif === "echec_envoi") {
    return { ...info, label: `Passé à appeler — le SMS n'a pas pu être envoyé (${evt.meta.echecs} échecs)` };
  }
  if (evt.type === "prepare" && evt.meta?.caseCode) {
    return { ...info, label: `Médicament préparé — casier ${evt.meta.caseCode}` };
  }
  return info;
}

export const FILTRES = [
  ["tous", "Tous"],
  ["en_attente", "En attente"],
  ["a_appeler", "À appeler"],
  ["a_traiter", "À traiter"],
  ["prepare", "Préparés"],
  ["termine", "Terminés"],
];
