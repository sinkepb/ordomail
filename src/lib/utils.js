// ─── Utilitaires généraux OrdoMail ───────────────────────────────────────────

export function timeAgo(date) {
  if (!date) return "";
  const d = date instanceof Date ? date : new Date(date);
  const diff = (Date.now() - d) / 1000;
  if (diff < 60) return "À l'instant";
  if (diff < 3600) return `Il y a ${Math.floor(diff/60)} min`;
  if (diff < 86400) return `Il y a ${Math.floor(diff/3600)}h`;
  return `Il y a ${Math.floor(diff/86400)}j`;
}

export function isSameDay(a, b) {
  const da = a instanceof Date ? a : new Date(a);
  const db = b instanceof Date ? b : new Date(b);
  return da.toDateString() === db.toDateString();
}

export function toDateKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  return d.toISOString().split("T")[0];
}

export function formatDateLabel(key) {
  const d = new Date(key + "T00:00:00");
  return d.toLocaleDateString("fr-FR", { weekday:"short", day:"numeric", month:"short" });
}

export const ORDO_ACCENTS = [
  { bg:"#e8f5e9", border:"#a5d6a7", bandeau:"#2e7d32", avatar:"#1b5e20" },
  { bg:"#e3f2fd", border:"#90caf9", bandeau:"#1565c0", avatar:"#0d47a1" },
  { bg:"#fce4ec", border:"#f48fb1", bandeau:"#c62828", avatar:"#b71c1c" },
  { bg:"#fff8e1", border:"#ffe082", bandeau:"#f57f17", avatar:"#e65100" },
  { bg:"#f3e5f5", border:"#ce93d8", bandeau:"#6a1b9a", avatar:"#4a148c" },
  { bg:"#e0f7fa", border:"#80deea", bandeau:"#00695c", avatar:"#004d40" },
];

export function getOrdoAccent(id) {
  if (!id) return ORDO_ACCENTS[0];
  const hash = [...String(id)].reduce((a,c)=>a+c.charCodeAt(0),0);
  return ORDO_ACCENTS[hash % ORDO_ACCENTS.length];
}
