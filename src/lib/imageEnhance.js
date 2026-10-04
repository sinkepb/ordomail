// Amélioration de la qualité d'une ordonnance photographiée au téléphone
// (02/10/2026, retour pharmacien) — point d'entrée unique combinant les deux
// niveaux de traitement :
//   1. recadrage + redressement de perspective (documentScan.js, best-effort,
//      ignoré si aucun contour fiable n'est détecté)
//   2. contraste + netteté (ce fichier, pur Canvas, s'applique toujours)
//
// Volontairement appliqué AVANT l'OCR (contrairement à compressImageFile,
// qui lui doit impérativement passer APRÈS — voir son commentaire) : un
// étirement d'histogramme et un léger renforcement des contours sont des
// prétraitements classiques pour améliorer la reconnaissance de texte, pas
// une dégradation. Ne lève jamais — un échec à n'importe quelle étape
// renvoie le fichier précédent inchangé plutôt que de bloquer l'envoi.
import { autoCropDocument } from "./documentScan.js";

const ENHANCEABLE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
// Borne la résolution de travail du traitement pixel par pixel (netteté) —
// une photo de téléphone à 12+ Mpx coûterait plusieurs secondes de calcul en
// JS pur pour un gain invisible au-delà de cette taille.
const MAX_WORK_DIMENSION = 2000;

export async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = e => resolve(e.target.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// Étirement d'histogramme sur la luminance (percentile 1%/99% plutôt que
// min/max bruts, pour ignorer quelques pixels aberrants — reflet, poussière
// sur l'objectif) appliqué uniformément aux 3 canaux pour ne pas fausser les
// teintes.
function autoContrastStretch(data) {
  const hist = new Uint32Array(256);
  const n = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    const lum = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0;
    hist[lum]++;
  }
  const lowCut = n * 0.01;
  const highCut = n * 0.01;
  let cum = 0, lo = 0, hi = 255;
  for (let v = 0; v < 256; v++) { cum += hist[v]; if (cum >= lowCut) { lo = v; break; } }
  cum = 0;
  for (let v = 255; v >= 0; v--) { cum += hist[v]; if (cum >= highCut) { hi = v; break; } }
  if (hi <= lo) return; // image déjà plate/uniforme : rien à gagner, éviter une division par ~0
  const range = hi - lo;
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const v = ((data[i + c] - lo) / range) * 255;
      data[i + c] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
  }
}

// Renforcement léger des contours (texte plus net) — noyau de netteté 3x3
// à poids modéré, pour ne pas créer d'artefacts sur une photo déjà bruitée
// (capteur de téléphone en basse lumière).
function unsharpMask(imageData, width, height) {
  const src = imageData.data;
  const out = new Uint8ClampedArray(src.length);
  const kernel = [0, -0.5, 0, -0.5, 3, -0.5, 0, -0.5, 0];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
        out[idx] = src[idx]; out[idx + 1] = src[idx + 1]; out[idx + 2] = src[idx + 2]; out[idx + 3] = src[idx + 3];
        continue;
      }
      for (let c = 0; c < 3; c++) {
        let sum = 0, k = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            sum += src[((y + dy) * width + (x + dx)) * 4 + c] * kernel[k++];
          }
        }
        out[idx + c] = sum;
      }
      out[idx + 3] = src[idx + 3];
    }
  }
  imageData.data.set(out);
}

/** Contraste + netteté uniquement (niveau 1, sans recadrage). Retourne un
 * nouveau File, ou le fichier d'origine inchangé si le type n'est pas une
 * image bitmap ou si le traitement échoue. */
export async function enhanceContrastAndSharpness(file) {
  if (!file || !ENHANCEABLE_TYPES.has(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_WORK_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();

    const imageData = ctx.getImageData(0, 0, w, h);
    autoContrastStretch(imageData.data);
    unsharpMask(imageData, w, h);
    ctx.putImageData(imageData, 0, 0);

    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob) return file;
    const newName = file.name.replace(/\.\w+$/, "") + "-ameliore.jpg";
    return new File([blob], newName, { type: "image/jpeg", lastModified: Date.now() });
  } catch (e) {
    console.error("[enhanceContrastAndSharpness]", e?.message || e);
    return file;
  }
}

/** Point d'entrée combiné : recadrage best-effort puis contraste/netteté.
 * Toujours sûr à appeler sur n'importe quel fichier (PDF, HEIC, image) —
 * renvoie l'original inchangé si rien n'est applicable. */
export async function prepareScannedImage(file) {
  if (!file || !ENHANCEABLE_TYPES.has(file.type)) return file;
  const cropped = await autoCropDocument(file);
  return enhanceContrastAndSharpness(cropped || file);
}

// Détection de flou — variance du Laplacien (02/10/2026, retour pharmacien) :
// technique standard et rapide (quelques ms), ne nécessite aucune dépendance.
// Une image nette a des contours marqués (différences de luminance fortes
// entre pixels voisins, donc variance élevée) ; une image floue les a lissés
// (variance faible). Seuil choisi empiriquement, volontairement conservateur
// (ne flague que du flou net) — jamais bloquant en soi, voir PatientPage.jsx
// où ce score sert uniquement à proposer, pas à empêcher, de reprendre la photo.
const BLUR_WORK_DIMENSION = 600;
export const BLUR_VARIANCE_THRESHOLD = 60;

/** Variance du Laplacien de `file`, ou `null` si non applicable/échec. Plus
 * la valeur est basse, plus l'image est probablement floue. */
export async function computeBlurScore(file) {
  if (!file || !ENHANCEABLE_TYPES.has(file.type)) return null;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, BLUR_WORK_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();

    const data = ctx.getImageData(0, 0, w, h).data;
    const gray = new Float32Array(w * h);
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      gray[p] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    }
    let sum = 0, sumSq = 0, n = 0;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x;
        const lap = gray[idx - 1] + gray[idx + 1] + gray[idx - w] + gray[idx + w] - 4 * gray[idx];
        sum += lap; sumSq += lap * lap; n++;
      }
    }
    const mean = sum / n;
    return sumSq / n - mean * mean;
  } catch (e) {
    console.error("[computeBlurScore]", e?.message || e);
    return null;
  }
}
