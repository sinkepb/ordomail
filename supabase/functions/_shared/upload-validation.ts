// Validation serveur des ordonnances déposées par QR code (submit-ordonnance).
// Extrait en module pur pour être testable sous Vitest sans dépendances Deno.

export const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 Mo
export const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf"]);
export const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "pdf"]);

export function isValidPatientCode(s: string): boolean {
  return s.length === 4 && (s.match(/[0-9]/g)?.length === 3) && (s.match(/[A-Za-z]/g)?.length === 1);
}

export function validateFile(file: { name: string; type: string; size: number }): { ok: true } | { ok: false; error: string } {
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { ok: false, error: "Fichier trop volumineux (15 Mo maximum)" };
  }
  if (!ALLOWED_MIME_TYPES.has(file.type) || !ALLOWED_EXTENSIONS.has(ext)) {
    return { ok: false, error: "Type de fichier non autorisé (jpg, png, webp ou pdf uniquement)" };
  }
  return { ok: true };
}
