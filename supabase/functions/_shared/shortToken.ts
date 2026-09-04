// ─── Token court pour les liens de rappel ──────────────────────────────────
// 04/09/2026 — un UUID (36 caractères) rend le lien SMS inutilement long : un
// SMS contenant un accent (é, è…) bascule en encodage UCS-2, qui réduit la
// limite d'un segment à 70 caractères au lieu de 160 — un lien court n'est
// donc pas cosmétique ici, il évite de couper le SMS en plusieurs segments
// (coût, et risque d'affichage désordonné selon l'opérateur/le téléphone).
//
// Alphabet sans caractères ambigus (0/O, 1/l/I) — même si le lien n'est
// normalement jamais retapé à la main (toujours cliqué), ça reste gratuit à
// éviter. 8 caractères sur 58 valeurs ≈ 58^8 ≈ 1.3×10^14 combinaisons :
// largement suffisant pour un lien à usage unique, rotaté à chaque envoi et
// déjà protégé par le rate limiting de resolve-rappel (30 req/5min/IP) —
// un brute-force reste totalement impraticable.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

export function generateShortToken(length = 8): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}
