// ─── Persistance du jeton vendeur (16/09/2026) ─────────────────────────────
// Jusqu'ici, le jeton vendeur (connexion par code pharmacie + PIN, voir
// verify-pin/index.ts) n'était gardé qu'en mémoire (client.js) : un simple
// rechargement de page déconnectait le poste, qui devait resaisir son PIN —
// volontaire à l'origine, mais gênant en usage réel signalé par le titulaire.
// Même schéma que lib/adminSession.js (sessionStorage, pas localStorage :
// survit à un rechargement dans le même onglet, jamais persisté au-delà de
// la fermeture du navigateur/onglet — cohérent avec un poste sur un
// ordinateur de comptoir potentiellement partagé). Le jeton porte déjà
// pharmacie_id/sub/poste_nom (voir verify-pin), donc la restauration se fait
// sans appel réseau supplémentaire — juste un décodage local, la vérification
// qui compte reste côté serveur (resolveCaller/verifyToken dans secure-data).
export const VENDEUR_TOKEN_KEY = "ordomail_vendeur_token";

function base64UrlDecode(str) {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/").padEnd(str.length + ((4 - (str.length % 4)) % 4), "=");
  return atob(padded);
}

/** Lit et décode le jeton vendeur persisté, en vérifiant son expiration côté client (UX). */
export function readStoredVendeurToken() {
  try {
    const token = sessionStorage.getItem(VENDEUR_TOKEN_KEY);
    if (!token) return null;
    const payload = JSON.parse(base64UrlDecode(token.split(".")[1]));
    if (payload.exp && Date.now() / 1000 >= payload.exp) {
      sessionStorage.removeItem(VENDEUR_TOKEN_KEY);
      return null;
    }
    return { token, payload };
  } catch {
    sessionStorage.removeItem(VENDEUR_TOKEN_KEY);
    return null;
  }
}

export function storeVendeurToken(token) {
  try {
    if (token) sessionStorage.setItem(VENDEUR_TOKEN_KEY, token);
    else sessionStorage.removeItem(VENDEUR_TOKEN_KEY);
  } catch { /* stockage indisponible (navigation privée stricte…) — tant pis, comportement pré-16/09/2026 */ }
}
