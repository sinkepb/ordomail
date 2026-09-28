// OrdoMail — message d'erreur générique pour le client, détail réel loggé côté serveur
// @fix 24/09/2026 (audit) — évite de renvoyer au client des messages d'exception bruts
// (Postgres, Stripe...) qui peuvent révéler des détails d'implémentation.
export function safeErrorMessage(e: unknown, context: string): string {
  console.error(`[${context}]`, e instanceof Error ? e.message : e);
  return "Une erreur interne est survenue — réessayez dans quelques instants ou contactez le support si le problème persiste.";
}
