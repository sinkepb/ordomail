// Validation serveur des ordonnances déposées par QR code (submit-ordonnance).
// Extrait en module pur pour être testable sous Vitest sans dépendances Deno.

export const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 Mo
// TIFF (03/10/2026, retour pharmacien — LGO qui exporte en .tiff) accepté ici
// uniquement en entrée : converti en PNG au dépôt (voir _shared/tiffConvert.ts,
// appelé par secure-data:ordonnances_upload_file/ordonnances_create) avant
// d'atteindre le stockage — aucun fichier .tiff ne doit jamais s'y retrouver
// tel quel, aucun navigateur ne sachant l'afficher nativement.
export const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf", "image/tiff", "image/x-tiff"]);
export const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "pdf", "tiff", "tif"]);

export function isValidPatientCode(s: string): boolean {
  return s.length === 4 && (s.match(/[0-9]/g)?.length === 3) && (s.match(/[A-Za-z]/g)?.length === 1);
}

// Audit sécurité (13/10/2026) — l'extension et le Content-Type déclarés par le
// client ne prouvent rien : un fichier HTML/script renommé en .jpg avec un
// Content-Type falsifié passait la validation précédente telle quelle. Ici on
// vérifie les premiers octets réels du fichier (signature de format),
// indépendamment de ce que le client prétend. `bytes` est optionnel pour ne
// pas casser les appelants qui ne les ont pas encore sous la main ; chaque
// appelant doit les fournir dès qu'il les a lus (voir submit-ordonnance et
// les ressources secure-data qui décodent déjà le base64 avant cet appel).
const SIGNATURES: { ext: string[]; check: (b: Uint8Array) => boolean }[] = [
  { ext: ["jpg", "jpeg"], check: (b) => b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF },
  { ext: ["png"], check: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47 },
  { ext: ["webp"], check: (b) => asciiAt(b, 0) === "RIFF" && asciiAt(b, 8) === "WEBP" },
  { ext: ["pdf"], check: (b) => asciiAt(b, 0) === "%PDF" },
  { ext: ["tiff", "tif"], check: (b) => asciiAt(b, 0, 2) === "II" || asciiAt(b, 0, 2) === "MM" },
];

function asciiAt(bytes: Uint8Array, offset: number, length = 4): string {
  if (bytes.length < offset + length) return "";
  let s = "";
  for (let i = 0; i < length; i++) s += String.fromCharCode(bytes[offset + i]);
  return s;
}

/** true si les premiers octets correspondent à une signature de format connue
 * pour cette extension. Ne garantit pas que le fichier est un document valide
 * (un PDF aux octets corrects peut encore contenir du JavaScript malveillant),
 * seulement que son type n'est pas intégralement falsifié. */
export function magicBytesMatch(bytes: Uint8Array, ext: string): boolean {
  const regle = SIGNATURES.find((s) => s.ext.includes(ext));
  if (!regle) return false; // extension sans signature connue : rejeter plutôt que faire confiance
  return regle.check(bytes);
}

export function validateFile(file: { name: string; type: string; size: number }, bytes?: Uint8Array): { ok: true } | { ok: false; error: string } {
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { ok: false, error: "Fichier trop volumineux (15 Mo maximum)" };
  }
  if (!ALLOWED_MIME_TYPES.has(file.type) || !ALLOWED_EXTENSIONS.has(ext)) {
    return { ok: false, error: "Type de fichier non autorisé (jpg, png, webp, pdf ou tiff uniquement)" };
  }
  if (bytes && !magicBytesMatch(bytes, ext)) {
    return { ok: false, error: "Le contenu du fichier ne correspond pas à son type déclaré" };
  }
  return { ok: true };
}
