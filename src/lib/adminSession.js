// OrdoMail — jeton de session admin backoffice, partagé entre App.jsx (pour
// savoir sur quelle route revenir après un refresh) et AdminPage.jsx (pour
// restaurer sa propre session). Auparavant dupliqué dans AdminPage.jsx
// seul — App.jsx n'avait aucun moyen de savoir qu'un admin était connecté,
// donc un refresh de la page backoffice repartait de "landing" et pouvait
// être détourné vers "finish-subscription" par l'effet de restauration de
// session Supabase (pharmacie), qui ne vérifiait pas l'existence d'une
// session admin avant de s'exécuter.
export const ADMIN_TOKEN_KEY = "ordomail_admin_token";

function base64UrlDecode(str) {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/").padEnd(str.length + ((4 - (str.length % 4)) % 4), "=");
  return atob(padded);
}

// Vérifie uniquement l'expiration côté client, pour l'UX (éviter d'afficher
// des panneaux cassés avec un jeton déjà expiré) — la vérification qui
// compte reste côté serveur (resolveCaller/verifyToken dans secure-data-admin).
export function readStoredAdminToken() {
  try {
    const token = sessionStorage.getItem(ADMIN_TOKEN_KEY);
    if (!token) return null;
    const payload = JSON.parse(base64UrlDecode(token.split(".")[1]));
    if (payload.exp && Date.now() / 1000 >= payload.exp) {
      sessionStorage.removeItem(ADMIN_TOKEN_KEY);
      return null;
    }
    return token;
  } catch {
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    return null;
  }
}
