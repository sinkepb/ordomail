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

// @fix 24/09/2026 (audit RGPD) — l'app manipule des données de santé (nom
// patient, ordonnances) qui peuvent apparaître dans une URL (?patient=...),
// un cookie de session ou un message d'erreur. Sans DSN configuré ce code ne
// s'exécute jamais (voir initMonitoring), mais doit être prêt AVANT toute
// activation réelle plutôt que découvert après coup dans des événements déjà
// capturés.
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

function stripQueryString(url) {
  if (typeof url !== 'string') return url;
  const i = url.indexOf('?');
  return i === -1 ? url : url.slice(0, i);
}

function redactEmails(value) {
  return typeof value === 'string' ? value.replace(EMAIL_RE, '[email masqué]') : value;
}

function scrubEvent(event) {
  if (event.request) {
    if (event.request.url) event.request.url = stripQueryString(event.request.url);
    delete event.request.cookies;
    delete event.request.headers;
  }
  if (Array.isArray(event.breadcrumbs)) {
    event.breadcrumbs = event.breadcrumbs.map((b) => ({
      ...b,
      message: redactEmails(b.message),
      data: b.data?.url ? { ...b.data, url: stripQueryString(b.data.url) } : b.data,
    }));
  }
  if (event.exception?.values) {
    event.exception.values = event.exception.values.map((v) => ({
      ...v,
      value: redactEmails(v.value),
    }));
  }
  if (event.message) event.message = redactEmails(event.message);
  return event;
}

export async function initMonitoring() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return; // pas de DSN → pas de téléchargement du SDK, aucun effet de bord
  _Sentry = await import('@sentry/react');
  _Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
    beforeSend: scrubEvent,
    beforeBreadcrumb: (breadcrumb) => ({
      ...breadcrumb,
      message: redactEmails(breadcrumb.message),
    }),
  });
}

export function reportError(error, context) {
  if (_Sentry) _Sentry.captureException(error, context ? { extra: context } : undefined);
}
