// OrdoMail — échappement HTML pour les emails construits à partir de champs
// utilisateur (patient, question support...).
// @fix 24/09/2026 (audit) — plusieurs emails transactionnels interpolaient des
// champs (nom patient, question posée...) directement dans un corps HTML sans
// échappement, permettant une injection de balises dans le rendu de l'email.
export function escapeHtml(input: string): string {
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
