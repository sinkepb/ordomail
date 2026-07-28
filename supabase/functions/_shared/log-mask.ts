// Masquage des logs (données sensibles) — à utiliser dans tout console.log/
// error/warn qui référence un email, un identifiant de pharmacie ou un code
// patient. Ces logs finissent dans le dashboard Supabase (Edge Function Logs)
// et ne doivent pas exposer de données personnelles en clair.

export function maskEmail(email: string | null | undefined): string {
  if (!email) return String(email);
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  return `${email[0]}***@${email.slice(at + 1)}`;
}

export function maskId(id: string | null | undefined): string {
  if (!id) return String(id);
  return id.length <= 8 ? "***" : `${id.slice(0, 8)}…`;
}

export function maskCode(code: string | null | undefined): string {
  if (!code) return String(code);
  return code.length <= 1 ? "***" : `${code[0]}***`;
}
