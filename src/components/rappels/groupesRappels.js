// Regroupement d'affichage des rappels : même logique que le serveur
// (rappelLogic.ts:cleGroupeEnvoi). Un rappel déjà envoyé porte son groupe_id ;
// un rappel en attente est regroupé avec ceux du même patient (même pharmacie,
// même numéro, même jour de relance). Calculé à partir des lignes chargées,
// donc applicable aux rappels déjà créés sans migration.

const PALETTE = ["#7c3aed", "#0891b2", "#c2410c", "#be185d", "#4d7c0f", "#1d4ed8"];

function numeroCanonique(v) {
  const digits = (v || "").replace(/[\s.-]/g, "");
  return digits.startsWith("+33") ? "0" + digits.slice(3) : digits;
}

function jourRelance(iso) {
  return iso ? new Date(iso).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" }) : "";
}

export function cleGroupeAffichage(r) {
  if (r.groupe_id) return `g:${r.groupe_id}`;
  if (r.statut !== "en_attente" || r.mode_contact === "appel") return null;
  return `c:${r.pharmacie_id}::${numeroCanonique(r.patient_telephone)}::${jourRelance(r.date_prochaine_relance)}`;
}

// Retourne Map(id -> { taille, couleur }) pour les rappels appartenant à un groupe de 2+.
export function calculerGroupesAffichage(rappels) {
  const parCle = new Map();
  for (const r of rappels) {
    const cle = cleGroupeAffichage(r);
    if (!cle) continue;
    if (!parCle.has(cle)) parCle.set(cle, []);
    parCle.get(cle).push(r);
  }
  const resultat = new Map();
  let index = 0;
  for (const membres of parCle.values()) {
    if (membres.length < 2) continue;
    const couleur = PALETTE[index % PALETTE.length];
    index += 1;
    for (const m of membres) resultat.set(m.id, { taille: membres.length, couleur });
  }
  return resultat;
}
