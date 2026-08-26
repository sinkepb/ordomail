// ─── Monitoring d'erreurs (Sentry) — désactivé par défaut ────────────────────
// @phase3 24/07/2026
//
// No-op tant que VITE_SENTRY_DSN n'est pas défini : ce fichier ne fait rien de
// visible sans configuration, mais permet de l'activer sans toucher au reste du
// code (juste ajouter la variable d'environnement puis redéployer).
// Ne couvre que le frontend — les edge functions Deno nécessiteraient un SDK
// séparé (@sentry/deno), non ajouté ici sans DSN réel pour le tester.
//
// @perf 25/08/2026 — import dynamique : DSN jamais configuré à ce jour (ni
// .env.local, ni vercel.json/netlify.toml — seulement un placeholder vide
// dans .env.example), donc @sentry/react partait dans le chunk initial de
// TOUT visiteur pour un bénéfice nul. Le SDK n'est désormais téléchargé que
// si VITE_SENTRY_DSN est réellement renseigné.

let _Sentry = null;

export async function initMonitoring() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return; // pas de DSN → pas de téléchargement du SDK, aucun effet de bord
  _Sentry = await import('@sentry/react');
  _Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
  });
}

export function reportError(error, context) {
  if (_Sentry) _Sentry.captureException(error, context ? { extra: context } : undefined);
}
