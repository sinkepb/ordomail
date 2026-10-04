// Conversion TIFF → PNG côté serveur, au moment du dépôt (03/10/2026, retour
// pharmacien dont le LGO exporte les ordonnances en .tiff — format qu'aucun
// navigateur ne sait afficher nativement, forçant jusqu'ici un aller-retour
// manuel : télécharger depuis le LGO, ouvrir dans Adobe, convertir en PDF,
// déposer dans OrdoMail). Fait à l'entrée plutôt qu'à la consultation :
// l'OCR (extractFromFile côté client) et le visualiseur intégré
// (OrdonnanceViewerModal) ont besoin d'un format décodable immédiatement, et
// convertir une fois au dépôt coûte moins cher que reconvertir à chaque
// consultation d'une ordonnance vue plusieurs fois.
//
// UTIF.js (décodage) + UPNG.js (encodage) : pur JS, sans dépendance native,
// mêmes librairies utilisables côté navigateur et côté Deno. Logique
// validée par un aller-retour pixel-exact (image de test encodée en TIFF
// puis redécodée/réencodée en PNG, comparaison visuelle) avant intégration,
// en l'absence d'environnement Deno local pour un test automatisé direct.
import UTIF from "https://esm.sh/utif2@4.1.0";
import UPNG from "https://esm.sh/upng-js@2.1.0";
import { dimensionsTiffAcceptables } from "./tiffLimits.ts";

export const TIFF_MIME_TYPES = new Set(["image/tiff", "image/x-tiff"]);
export const TIFF_EXTENSIONS = new Set(["tiff", "tif"]);

export function isTiff(fileName: string, fileType: string): boolean {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  return TIFF_MIME_TYPES.has(fileType) || TIFF_EXTENSIONS.has(ext);
}

/** Décode un TIFF et le réencode en PNG. Lève une erreur explicite si le
 * fichier est illisible (corrompu, variante TIFF non supportée par UTIF) —
 * jamais un échec silencieux sur un document de santé : l'appelant doit
 * renvoyer une erreur claire au pharmacien plutôt que de stocker un fichier
 * cassé. */
export function convertTiffToPng(bytes: Uint8Array): Uint8Array {
  let ifds;
  try {
    ifds = UTIF.decode(bytes.buffer);
  } catch (e) {
    throw new Error(`Fichier TIFF illisible : ${(e as Error).message}`);
  }
  if (!ifds || ifds.length === 0) {
    throw new Error("Fichier TIFF illisible (aucune image trouvée)");
  }
  const page = ifds[0];
  // Contrôle AVANT décodage : les dimensions viennent de l'en-tête, l'allocation
  // RGBA suit immédiatement (voir tiffLimits.ts).
  if (!dimensionsTiffAcceptables(page.width, page.height)) {
    throw new Error("Image TIFF trop grande (dimensions au-delà de la limite autorisée)");
  }
  UTIF.decodeImage(bytes.buffer, page);
  const rgba = UTIF.toRGBA8(page);
  const png = UPNG.encode([rgba.buffer], page.width, page.height, 0);
  return new Uint8Array(png);
}
