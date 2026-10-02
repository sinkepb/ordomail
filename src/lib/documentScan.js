// Détection et redressement automatique du contour d'une ordonnance
// photographiée (02/10/2026, retour pharmacien) — niveau 3 : recadrage +
// correction de perspective, le traitement le plus lourd de la chaîne.
//
// Charge OpenCV.js à la demande (~13 Mo de WASM) via import dynamique,
// jamais au chargement de la page ni dans le bundle principal — uniquement
// quand une photo est effectivement ajoutée (voir imageEnhance.js, seul
// point d'appel). Un patient qui n'envoie rien ne télécharge jamais ce code.
//
// Algorithme standard de "scanner de document" (même principe que les
// applis type CamScanner) : contours → plus grand quadrilatère plausible →
// transformation de perspective vers un rectangle. Conservateur par
// construction : si aucun contour assez net/grand n'est trouvé (fond trop
// proche de la couleur du papier, document coupé par le cadre, photo prise
// de travers au point de perdre un coin...), renvoie null plutôt que de
// risquer un recadrage qui ampute une partie de l'ordonnance — le fichier
// continue alors sa route inchangé dans imageEnhance.js.
const SCANNABLE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

// Le quadrilatère détecté doit couvrir au moins ce ratio de l'image pour
// être retenu — en dessous, trop probable que ce soit un contour parasite
// (ombre, reflet, bord d'une table) plutôt que le document lui-même.
const MIN_AREA_RATIO = 0.25;
const MAX_OUTPUT_DIMENSION = 2000;

let cvPromise = null;
function loadCv() {
  if (!cvPromise) {
    cvPromise = import("@techstark/opencv-js").then(async (mod) => {
      const cvModule = mod.default || mod;
      if (cvModule instanceof Promise) return await cvModule;
      if (cvModule.Mat) return cvModule;
      await new Promise((resolve) => { cvModule.onRuntimeInitialized = resolve; });
      return cvModule;
    });
  }
  return cvPromise;
}

function orderCorners(pts) {
  // pts : 4 points dans un ordre arbitraire -> [haut-gauche, haut-droite,
  // bas-droite, bas-gauche], seul ordre valide pour getPerspectiveTransform.
  const sums  = pts.map(p => p.x + p.y);
  const diffs = pts.map(p => p.x - p.y);
  const tl = pts[sums.indexOf(Math.min(...sums))];
  const br = pts[sums.indexOf(Math.max(...sums))];
  const tr = pts[diffs.indexOf(Math.max(...diffs))];
  const bl = pts[diffs.indexOf(Math.min(...diffs))];
  return [tl, tr, br, bl];
}

function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

/** Tente de recadrer et redresser le document photographié dans `file`.
 * Retourne un nouveau File en cas de succès, ou `null` si aucun contour
 * fiable n'a pu être trouvé (ne lève jamais). */
export async function autoCropDocument(file) {
  if (!file || !SCANNABLE_TYPES.has(file.type)) return null;

  let cv;
  try {
    cv = await loadCv();
  } catch (e) {
    console.error("[autoCropDocument] échec du chargement d'OpenCV.js", e?.message || e);
    return null;
  }

  let src, gray, blurred, edged, hierarchy, contours, best;
  try {
    const bitmap = await createImageBitmap(file);
    // Travailler sur une résolution bornée : la détection de contour n'a
    // besoin ni de la pleine résolution d'une photo de téléphone (12+ Mpx),
    // ni ne doit coûter plusieurs secondes de calcul sur un appareil modeste.
    const workScale = Math.min(1, MAX_OUTPUT_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const workW = Math.max(1, Math.round(bitmap.width * workScale));
    const workH = Math.max(1, Math.round(bitmap.height * workScale));
    const canvas = document.createElement("canvas");
    canvas.width = workW; canvas.height = workH;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0, workW, workH);
    bitmap.close?.();

    src = cv.imread(canvas);
    gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    blurred = new cv.Mat();
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
    edged = new cv.Mat();
    cv.Canny(blurred, edged, 50, 150);
    cv.dilate(edged, edged, cv.Mat.ones(3, 3, cv.CV_8U));

    contours = new cv.MatVector();
    hierarchy = new cv.Mat();
    cv.findContours(edged, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

    const imageArea = src.rows * src.cols;
    let bestArea = 0;
    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      const peri = cv.arcLength(cnt, true);
      const approx = new cv.Mat();
      cv.approxPolyDP(cnt, approx, 0.02 * peri, true);
      if (approx.rows === 4 && cv.isContourConvex(approx)) {
        const area = Math.abs(cv.contourArea(approx));
        if (area > bestArea) {
          bestArea = area;
          if (best) best.delete();
          best = approx;
        } else {
          approx.delete();
        }
      } else {
        approx.delete();
      }
      cnt.delete();
    }

    if (!best || bestArea / imageArea < MIN_AREA_RATIO) {
      return null;
    }

    const pts = [];
    for (let i = 0; i < 4; i++) pts.push({ x: best.data32S[i * 2], y: best.data32S[i * 2 + 1] });
    const [tl, tr, br, bl] = orderCorners(pts);

    const outWRaw = Math.max(dist(tl, tr), dist(bl, br));
    const outHRaw = Math.max(dist(tl, bl), dist(tr, br));
    if (outWRaw < 10 || outHRaw < 10) return null; // quadrilatère dégénéré

    const scale = Math.min(1, MAX_OUTPUT_DIMENSION / Math.max(outWRaw, outHRaw));
    const outW = Math.max(1, Math.round(outWRaw * scale));
    const outH = Math.max(1, Math.round(outHRaw * scale));

    const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y]);
    const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, outW, 0, outW, outH, 0, outH]);
    const M = cv.getPerspectiveTransform(srcTri, dstTri);
    const dst = new cv.Mat();
    cv.warpPerspective(src, dst, M, new cv.Size(outW, outH));

    const outCanvas = document.createElement("canvas");
    outCanvas.width = outW; outCanvas.height = outH;
    cv.imshow(outCanvas, dst);

    srcTri.delete(); dstTri.delete(); M.delete(); dst.delete();

    const blob = await new Promise(resolve => outCanvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob) return null;
    const newName = file.name.replace(/\.\w+$/, "") + "-redresse.jpg";
    return new File([blob], newName, { type: "image/jpeg", lastModified: Date.now() });
  } catch (e) {
    console.error("[autoCropDocument]", e?.message || e);
    return null;
  } finally {
    src?.delete(); gray?.delete(); blurred?.delete(); edged?.delete();
    hierarchy?.delete(); contours?.delete(); best?.delete();
  }
}
