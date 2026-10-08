// Regroupement de dates en séries pour un graphique en barres (backoffice).
// Granularité "jour" : 30 derniers jours. "mois" : 12 derniers mois.
// "annee" : une barre par année présente dans les données (au moins l'année en cours).
const JOURS_FENETRE = 30;
const MOIS_FENETRE = 12;

function cleJour(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function cleMois(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function cleAnnee(d) {
  return String(d.getFullYear());
}

export function grouperParPeriode(dates, granularite, maintenant = new Date()) {
  const valides = (dates || []).map((d) => new Date(d)).filter((d) => !Number.isNaN(d.getTime()));
  const compte = new Map();
  const cleDe = granularite === "jour" ? cleJour : granularite === "mois" ? cleMois : cleAnnee;
  for (const d of valides) {
    const cle = cleDe(d);
    compte.set(cle, (compte.get(cle) || 0) + 1);
  }

  if (granularite === "jour") {
    const buckets = [];
    for (let i = JOURS_FENETRE - 1; i >= 0; i--) {
      const d = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate() - i);
      buckets.push({ cle: cleJour(d), label: d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }), value: compte.get(cleJour(d)) || 0 });
    }
    return buckets;
  }
  if (granularite === "mois") {
    const buckets = [];
    for (let i = MOIS_FENETRE - 1; i >= 0; i--) {
      const d = new Date(maintenant.getFullYear(), maintenant.getMonth() - i, 1);
      buckets.push({ cle: cleMois(d), label: d.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" }), value: compte.get(cleMois(d)) || 0 });
    }
    return buckets;
  }
  const anneeActuelle = cleAnnee(maintenant);
  const annees = new Set(compte.keys());
  annees.add(anneeActuelle);
  return [...annees].sort().map((cle) => ({ cle, label: cle, value: compte.get(cle) || 0 }));
}
