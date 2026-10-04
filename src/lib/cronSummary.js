// Résumé de l'état d'un cron job à partir de ses dernières exécutions
// (05/10/2026, suivi backoffice). Pure, sans dépendance, testée.
const FENETRE_MS = 24 * 3600 * 1000;

export function resumerJob(job, maintenant = Date.now()) {
  const runs = Array.isArray(job?.runs) ? job.runs : [];
  const derniere = runs[0] || null;
  const echecs24h = runs.filter((r) => r.status !== "succeeded" && new Date(r.start_time).getTime() >= maintenant - FENETRE_MS).length;
  let statut;
  if (!job?.active) statut = "inactif";
  else if (!derniere) statut = "jamais";
  else if (derniere.status === "succeeded") statut = "ok";
  else statut = "erreur";
  return { statut, derniereExecution: derniere?.start_time || null, derniereErreur: derniere && derniere.status !== "succeeded" ? derniere.message : null, echecs24h };
}
