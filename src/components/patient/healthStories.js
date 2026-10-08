

export const HEALTH_STORIES = [
  {
    id: 1,
    emoji: "✅",
    bg: ["#1a6e3a", "#15803d"],
    title: "Ordonnance reçue !",
    text: "Votre pharmacien a bien reçu votre ordonnance. Veuillez rester dans la file et attendre votre tour.",
    type: "info",
  },
  {
    id: 2,
    emoji: "💊",
    bg: ["#1a3a6e", "#1e40af"],
    title: "Le saviez-vous ?",
    text: "1 patient sur 3 arrête son traitement trop tôt. Même si vous vous sentez mieux, terminez toujours votre prescription.",
    type: "info",
  },
  {
    id: 3,
    emoji: "🧠",
    bg: ["#4c1d95", "#6d28d9"],
    title: "Quiz santé",
    text: null,
    type: "quiz",
    question: "Que faire avec les médicaments non utilisés ?",
    answers: [
      { text: "Les jeter à la poubelle", correct: false, emoji: "🗑️" },
      { text: "Les rapporter en pharmacie", correct: true, emoji: "✅" },
      { text: "Les garder pour plus tard", correct: false, emoji: "📦" },
    ],
    explanation: "Les pharmacies collectent gratuitement vos médicaments non utilisés via le programme Cyclamed.",
  },
  {
    id: 4,
    emoji: "💬",
    bg: ["#92400e", "#b45309"],
    title: "À demander au pharmacien",
    text: "Puis-je prendre ce médicament avec mon traitement habituel ? Y a-t-il un générique disponible ?",
    type: "info",
  },
  {
    id: 5,
    emoji: "🎁",
    bg: ["#065f46", "#047857"],
    title: "Le saviez-vous ?",
    text: "Votre pharmacie propose souvent la vaccination sans RDV, des bilans de médication gratuits et la livraison à domicile.",
    type: "info",
  },
  {
    id: 6, emoji: "🔔",
    bg: ["#1a3a6e", "#0f2347"],
    title: "Restez ici !",
    text: "Gardez cette page ouverte. Votre pharmacien vous appellera et votre téléphone vibrera quand ce sera votre tour.",
    type: "info",
  },
];

// Génère le code email (même algo que sessionCode)
// Code à 3 chiffres + 1 lettre (insérée à une position aléatoire) utilisé dans
// l'adresse email dynamique (pharmacie-24K7@in.ordomail.fr) — doit être généré
// côté client car il est intégré à l'adresse AVANT tout appel serveur.
// ⚠️ Avant le 24/07/2026, ce code était dérivé de l'heure système (minutes/secondes),
// donc prévisible par quiconque lisait le code source — remplacé par un tirage
// cryptographique. La lettre insérée (25/07/2026) élargit l'espace de valeurs
// (900 → 23 400 combinaisons) sans changer le principe : le format reste une
// contrainte partagée avec le parsing regex côté send-email/receive-email
// (voir ces fichiers si ce format doit encore évoluer).
// Hissée au niveau module (28/07/2026) : PatientStories en a aussi besoin pour
// afficher les instructions email dans la feuille "Ajouter une ordonnance" sans
// jamais régénérer le code du patient déjà en cours.
