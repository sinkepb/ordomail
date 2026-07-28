// ─── Monitoring d'erreurs (Sentry) — désactivé par défaut ────────────────────
// @phase3 24/07/2026
//
// No-op tant que VITE_SENTRY_DSN n'est pas défini : ce fichier ne fait rien de
// visible sans configuration, mais permet de l'activer sans toucher au reste du
// code (juste ajouter la variable d'environnement puis redéployer).
// Ne couvre que le frontend — les edge functions Deno nécessiteraient un SDK
// séparé (@sentry/deno), non ajouté ici sans DSN réel pour le tester.

import * as Sentry from '@sentry/react';

let _initialized = false;

export function initMonitoring() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return; // pas de DSN → pas d'appel Sentry.init, aucun effet de bord
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
  });
  _initialized = true;
}

export function reportError(error, context) {
  if (_initialized) Sentry.captureException(error, context ? { extra: context } : undefined);
}
