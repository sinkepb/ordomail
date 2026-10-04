// Bornes de dimensions d'un TIFF avant décodage (04/10/2026, audit sécurité).
// Les dimensions sont déclarées dans l'en-tête du fichier : un TIFF compressé
// de 15 Mo peut annoncer des dimensions énormes, et l'allocation RGBA
// (largeur × hauteur × 4) se fait avant tout autre contrôle. Module sans
// dépendance pour rester testable sous Vitest.
export const MAX_TIFF_COTE_PX = 10000;
export const MAX_TIFF_PIXELS = 40_000_000;

export function dimensionsTiffAcceptables(width: number, height: number): boolean {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return false;
  if (width <= 0 || height <= 0) return false;
  if (width > MAX_TIFF_COTE_PX || height > MAX_TIFF_COTE_PX) return false;
  return width * height <= MAX_TIFF_PIXELS;
}
