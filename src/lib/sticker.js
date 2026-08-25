// ─── Sticker de sol imprimable (QR codes pré-imprimés) ────────────────────────
// Design repris du projet Claude Design "Amélioration design pharmacie
// stickers" (Sticker Ordonnance.dc.html) : disque vert avec QR central et
// texte courbe haut/bas, pensé pour un sticker de sol Ø 300–400 mm.
//
// Redessiné ici directement au Canvas 2D plutôt que rejouer le runtime
// dc-page/x-dc du fichier source (un format d'édition live, pas un module
// exécutable hors de l'éditeur Claude Design) — même rendu visuel, mais
// produit un vrai PNG haute résolution téléchargeable, prêt à envoyer à
// l'imprimeur. Le texte courbe est tracé caractère par caractère (rotation
// cumulée autour du centre) faute d'un textPath natif au Canvas.

function sanitizeFilenamePart(s) {
  return String(s || "ordomail").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "ordomail";
}

const GREEN = "#1C4733";
const CREAM = "#EEE4C9";
const PALE_GREEN = "#C9DDC6";
const QR_INK = "#0d1f16";

let fontsReady = null;
function ensureStickerFonts() {
  if (typeof document === "undefined") return Promise.resolve();
  if (!fontsReady) {
    fontsReady = (async () => {
      if (!document.getElementById("sticker-fonts-link")) {
        const link = document.createElement("link");
        link.id = "sticker-fonts-link";
        link.rel = "stylesheet";
        link.href = "https://fonts.googleapis.com/css2?family=Jost:wght@400;500;600;700&display=swap";
        document.head.appendChild(link);
      }
      try {
        await Promise.all([
          document.fonts.load("600 100px Jost"),
          document.fonts.load("700 100px Jost"),
        ]);
      } catch {
        // Police non chargée à temps (offline, réseau lent) — le canvas
        // dessine avec le fallback sans-serif plutôt que d'échouer.
      }
    })();
  }
  return fontsReady;
}

function roundedRectPath(ctx, x, y, w, h, r) {
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Texte centré avec espacement de lettres manuel (letter-spacing Canvas 2D
// n'est pas fiable sur tous les navigateurs).
function fillLetterSpacedText(ctx, text, centerX, y, spacing) {
  const chars = text.split("");
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  let x = centerX - total / 2;
  const prevAlign = ctx.textAlign;
  ctx.textAlign = "left";
  for (let i = 0; i < chars.length; i++) {
    ctx.fillText(chars[i], x, y);
    x += widths[i] + spacing;
  }
  ctx.textAlign = prevAlign;
}

// Trace `text` le long d'un arc de cercle de rayon `radius`, centré en
// (cx, cy), lu de gauche à droite dans les deux cas.
//
// Géométrie (dérivée de la convention réelle de rotate()+translate() du
// Canvas 2D, pas recopiée d'un exemple générique — la première version de
// cette fonction utilisait un angle de départ et une inversion de caractères
// faux, ce qui chevauchait les lettres au lieu de les répartir sur l'arc) :
// avec x local = 0 et y local = ±radius, un point local (0,-radius) tourné
// de θ retombe en (radius·sinθ, -radius·cosθ) dans le repère du disque — à
// θ=0 c'est le sommet du cercle. Donc pour le texte du HAUT, translater vers
// (0,-radius) et balayer θ de -angle/2 à +angle/2 centre le texte en haut,
// lu normalement, capitales vers l'extérieur (comme un badge). Pour le texte
// du BAS, translater vers (0,+radius) avec le MÊME balayage (aucune
// inversion de lettres ni rotation supplémentaire) centre le texte en bas ;
// comme "haut de lettre" y pointe alors vers le centre du disque, le texte
// reste lisible à l'endroit — exactement la convention du fichier source
// ("bas : capitales vers l'intérieur").
//
// La taille de police n'est pas fixe : un texte plus long que prévu (nom de
// pharmacie, libellé personnalisé) doit rétrécir plutôt que déborder au-delà
// de `maxAngleDeg` degrés d'arc — sinon un texte trop long chevauche le QR
// central ou repart sous le disque. `fontMaxPx` plafonne la taille dans
// l'autre sens pour un texte court. Mesure à 100px de référence pour en
// déduire un ratio largeur/corps-de-police indépendant de la taille finale
// (comme measure() dans le fichier source Claude Design).
function drawArcText(ctx, text, cx, cy, radius, { top, fontMaxPx, maxAngleDeg, letterSpacingRatio = 0.1, color }) {
  const chars = text.split("");
  if (chars.length === 0) return;

  ctx.font = `600 100px Jost, sans-serif`;
  const refWidths = chars.map((ch) => ctx.measureText(ch).width + letterSpacingRatio * 100);
  const perEm = refWidths.reduce((a, b) => a + b, 0) / 100;
  const maxAngleRad = (maxAngleDeg * Math.PI) / 180;
  const fontPx = Math.min(fontMaxPx, (radius * maxAngleRad) / perEm);
  const letterSpacingPx = letterSpacingRatio * fontPx;

  ctx.save();
  ctx.font = `600 ${fontPx}px Jost, sans-serif`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillStyle = color;

  const widths = chars.map((ch) => ctx.measureText(ch).width + letterSpacingPx);
  const totalAngle = widths.reduce((a, b) => a + b, 0) / radius;
  const localY = top ? -radius : radius;

  // Le point local (0,-radius) [haut] et (0,+radius) [bas] ne se projettent
  // pas dans le même sens quand θ augmente — le repère du bas est le miroir
  // horizontal de celui du haut (vérifié à l'écran : sans cette inversion,
  // "ENVOYEZ VOTRE ORDONNANCE" ressortait "ECNANNODRO ERTOV ZEYOVNE", lettres
  // individuellement correctes mais séquence entière inversée). Parcourir les
  // caractères en ordre inverse pour le bas compense ce miroir et restitue un
  // texte lisible de gauche à droite, sans toucher à l'orientation de chaque
  // lettre (déjà correcte, capitales vers l'intérieur comme prévu).
  const seq = top ? chars : chars.slice().reverse();
  const seqWidths = top ? widths : widths.slice().reverse();

  ctx.translate(cx, cy);
  ctx.rotate(-totalAngle / 2);

  for (let i = 0; i < seq.length; i++) {
    const charAngle = seqWidths[i] / radius;
    ctx.rotate(charAngle / 2);
    ctx.save();
    ctx.translate(0, localY);
    ctx.fillText(seq[i], 0, 0);
    ctx.restore();
    ctx.rotate(charAngle / 2);
  }
  ctx.restore();
}

async function loadQrImage(url, sizePx) {
  const mod = await import("qrcode");
  const QR = mod.default || mod;
  const dataUrl = await QR.toDataURL(url, {
    errorCorrectionLevel: "H",
    margin: 0,
    width: Math.max(64, Math.round(sizePx)),
    color: { dark: QR_INK, light: "#ffffff" },
  });
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

// Dessine le sticker complet dans un canvas déjà dimensionné (canvas.width =
// canvas.height = un carré transparent contenant le disque + son fond perdu).
// `bleedPx` est l'épaisseur du fond perdu (anneau vert pâle) au-delà du
// disque — par défaut une fine bande proportionnelle (comme le fichier
// source : anneau de 155mm autour d'un disque de 150mm). Le fond perdu est
// lui-même un CERCLE (pas un carré plein) : au-delà de cet anneau, le canvas
// reste transparent — jamais de coins carrés vert pâle autour du sticker.
async function paintSticker(canvas, { url, topText, bottomText, bleedPx }) {
  await ensureStickerFonts();
  const size = canvas.width;
  const cx = size / 2;
  const cy = size / 2;
  const Router = size / 2;
  const ring = bleedPx != null ? bleedPx : Router * 0.0323;
  const R = Router - ring;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, size, size);

  // Fond perdu (anneau vert pâle, cerclé — pas un carré)
  ctx.beginPath();
  ctx.arc(cx, cy, Router, 0, Math.PI * 2);
  ctx.fillStyle = PALE_GREEN;
  ctx.fill();

  // Disque principal
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fillStyle = GREEN;
  ctx.fill();

  // Trait de coupe (pointillés) — vert du disque à 60% d'opacité sur le fond
  // perdu clair, comme le fichier source (jamais crème, qui se fondrait dans
  // le disque au lieu de marquer la limite de coupe).
  ctx.save();
  ctx.setLineDash([R * 0.012, R * 0.01]);
  ctx.lineWidth = Math.max(1, R * 0.004);
  ctx.strokeStyle = "rgba(28,71,51,0.6)";
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Texte courbe haut / bas — angle max 132°/190° comme le fichier source :
  // au-delà, la police rétrécit plutôt que le texte ne déborde vers le QR
  // ou ne reparte sous le disque.
  drawArcText(ctx, (topText || "").toUpperCase(), cx, cy, R * 0.80, {
    top: true, fontMaxPx: R * 0.22, maxAngleDeg: 132, color: CREAM,
  });
  drawArcText(ctx, (bottomText || "").toUpperCase(), cx, cy, R * 0.87, {
    top: false, fontMaxPx: R * 0.22, maxAngleDeg: 190, color: CREAM,
  });

  // QR + libellé, groupe centré verticalement sur le centre du disque
  const qrBoxSize = R * 0.85;
  const qrPad = qrBoxSize * 0.07;
  const gapPx = R * 0.05;
  const labelFontPx = R * 0.084;
  const groupHeight = qrBoxSize + gapPx + labelFontPx * 1.1;
  const boxX = cx - qrBoxSize / 2;
  const boxY = cy - groupHeight / 2;

  roundedRectPath(ctx, boxX, boxY, qrBoxSize, qrBoxSize, qrBoxSize * 0.06);
  ctx.fillStyle = "#ffffff";
  ctx.fill();

  const qrImg = await loadQrImage(url, qrBoxSize - qrPad * 2);
  ctx.drawImage(qrImg, boxX + qrPad, boxY + qrPad, qrBoxSize - qrPad * 2, qrBoxSize - qrPad * 2);

  ctx.font = `600 ${labelFontPx}px Jost, sans-serif`;
  ctx.fillStyle = CREAM;
  fillLetterSpacedText(ctx, "SCANNEZ-MOI", cx, boxY + qrBoxSize + gapPx + labelFontPx * 0.85, labelFontPx * 0.22);

  return canvas;
}

// Aperçu écran, léger — appeler dans un effet avec un <canvas> déjà monté.
async function renderStickerPreview(canvasEl, { url, topText, bottomText }, sizePx = 260) {
  canvasEl.width = sizePx;
  canvasEl.height = sizePx;
  await paintSticker(canvasEl, { url, topText, bottomText });
}

// Export imprimeur : disque exactement à `diameterMm`, + 10 mm de fond perdu
// de chaque côté, résolution `dpi` (300 par défaut, standard impression).
async function downloadStickerImage({ url, code, topText, bottomText, diameterMm = 350, dpi = 300 }) {
  const bleedMm = 10;
  const pxPerMm = dpi / 25.4;
  const discPx = diameterMm * pxPerMm;
  const bleedPx = bleedMm * pxPerMm;
  const canvasSize = Math.round(discPx + 2 * bleedPx);

  const canvas = document.createElement("canvas");
  canvas.width = canvasSize;
  canvas.height = canvasSize;
  await paintSticker(canvas, { url, topText, bottomText, bleedPx });

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  const dlUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = dlUrl;
  a.download = `sticker-sol-${sanitizeFilenamePart(code)}-${diameterMm}mm.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(dlUrl), 30000);
}

export { renderStickerPreview, downloadStickerImage };
