

export function generateCode() {
  const arr = new Uint32Array(3);
  crypto.getRandomValues(arr);
  const digits = String(100 + (arr[0] % 900)).padStart(3, "0");
  const letter = String.fromCharCode(65 + (arr[1] % 26)); // A-Z
  const pos = arr[2] % 4; // position d'insertion parmi les 4 caractères finaux
  return digits.slice(0, pos) + letter + digits.slice(pos);
}

// Construit l'adresse email avec le code patient intégré
// Format : base@domain → base-247@domain
// Ex : ph1@in.ordomail.fr → ph1-247@in.ordomail.fr
export function buildEmailAvecCode(baseEmail, code) {
  const [local, domain] = baseEmail.split("@");
  return `${local}-${code}@${domain}`;
}

// Image zoomable — pincer pour zoomer, glisser pour déplacer une fois zoomé,
// double-tap pour basculer zoom (05/09/2026, page de catalogue groupement).
// stopPropagation dès qu'un geste concerne l'image (2 doigts, ou 1 doigt une
// fois zoomé) pour ne pas déclencher le swipe/tap de navigation entre stories
// du conteneur parent (handleTouchStart/handleTouchEnd de PatientStories) —
// un tap simple à l'échelle 1 continue lui de remonter normalement, pour
// garder "toucher pour continuer" fonctionnel sur l'image comme ailleurs.
