// OrdoMail — compression client-side avant upload (04/09/2026).
// Concerne le stockage réel (Supabase Storage), JAMAIS l'OCR : chaque site
// d'appel doit passer le fichier ORIGINAL à extractFromFile() en premier, et
// ne compresser qu'ensuite, juste avant l'upload — compresser avant l'OCR
// dégraderait la reconnaissance de texte sur l'ordonnance.
//
// PDF et HEIC volontairement exclus et renvoyés inchangés : aucun navigateur
// ne peut décoder un HEIC dans un canvas (voir Dashboard.jsx/OrdoCard.jsx/
// PrintModal.jsx, traité partout comme un blob opaque), et un PDF n'est pas
// une image à recompresser ici (voir lib/print.jsx pour sa propre conversion
// mono-page → image, un besoin différent).
const COMPRESSIBLE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
const MAX_DIMENSION = 1600; // px sur le plus grand côté — largement suffisant pour lecture/impression
const JPEG_QUALITY = 0.82;

/** Retourne un File compressé (JPEG) si ça a un sens, sinon le fichier original
 * inchangé. Ne lève jamais — un échec de compression (navigateur incompatible,
 * image corrompue…) ne doit jamais bloquer un envoi réel. */
export async function compressImageFile(file) {
  if (!file || !COMPRESSIBLE_TYPES.has(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    // Déjà à la bonne taille et déjà dans un format compact : rien à gagner.
    if (scale >= 1 && file.type !== "image/png") {
      bitmap.close?.();
      return file;
    }
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    if (!blob || blob.size >= file.size) return file; // la compression n'a pas aidé
    const newName = file.name.replace(/\.\w+$/, "") + ".jpg";
    return new File([blob], newName, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  }
}
