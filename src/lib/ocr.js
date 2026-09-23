// ─── OCR Tesseract — traitement local ─────────────────────────────────────────
// Traitement 100% navigateur : l'extraction de texte ne transite par aucun
// service tiers. Ça réduit l'exposition, mais ne suffit pas à rendre l'app
// "conforme HDS" à soi seul — voir DEPLOIEMENT_CHECKLIST.md § évolutions produit.
//
// @phase3 24/07/2026 — tesseract.js et pdfjs-dist sont désormais de vraies
// dépendances npm (package-lock.json), bundlées par Vite au lieu d'être chargées
// à l'exécution depuis esm.sh/jsdelivr (code tiers non pinné, exécuté dans le
// tableau de bord où transitent des images d'ordonnances).
// @fix 24/07/2026 — cœur WASM (tesseract-core-*-lstm.wasm(.js)) et worker script
// vendorisés dans public/ (copiés depuis node_modules à l'installation, voir
// public/tesseract-core/ et public/tesseract-worker.min.js) et servis en local via
// corePath/workerPath ci-dessous — plus de chargement CDN pour le code exécuté.
// ⚠️ Résiduel : les données de langue (fra.traineddata, ~10-15 Mo) restent
// chargées depuis le CDN jsdelivr @tesseract.js-data — fichier de données statique
// (pas de code exécuté), self-host possible mais nécessite de vendoriser et
// maintenir à jour ce binaire séparément ; pas traité ici.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

let _tesseractWorker  = null;
let _tesseractLoading = false;
let _tesseractReady   = false;

async function getTesseractWorker() {
  if (_tesseractReady && _tesseractWorker) return _tesseractWorker;
  if (_tesseractLoading) {
    await new Promise(resolve => {
      const iv = setInterval(() => { if (_tesseractReady || !_tesseractLoading) { clearInterval(iv); resolve(); } }, 200);
    });
    return _tesseractWorker;
  }
  _tesseractLoading = true;
  try {
    // Import du paquet npm local (bundlé par Vite) — plus de CDN pour le module JS.
    const { createWorker } = await import('tesseract.js');
    // URLs absolues obligatoires : le worker tesseract.js tourne dans un contexte
    // blob: (workerBlobURL, par défaut) où un chemin relatif à la racine ("/...")
    // ne se résout pas via importScripts (SyntaxError "URL invalide").
    _tesseractWorker = await createWorker('fra', 1, {
      corePath: new URL('/tesseract-core', window.location.origin).href,
      workerPath: new URL('/tesseract-worker.min.js', window.location.origin).href,
      logger: () => {}, // silencieux
    });
    await _tesseractWorker.setParameters({
      preserve_interword_spaces: '1',
      tessedit_pageseg_mode: '6', // assume un bloc de texte uniforme
    });
    _tesseractReady = true;
    return _tesseractWorker;
  } catch(e) {
    console.warn('[Tesseract] Échec chargement:', e.message);
    _tesseractLoading = false;
    return null;
  } finally {
    _tesseractLoading = false;
  }
}


async function preprocessImage(base64, mimeType) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = Math.max(1, Math.min(3, 2400 / Math.max(img.width, img.height)));
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const id = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = id.data;
      for (let i = 0; i < d.length; i += 4) {
        const g = 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2];
        const v = g < 128 ? Math.max(0, g - 20) : Math.min(255, g + 30);
        d[i] = d[i+1] = d[i+2] = v;
      }
      ctx.putImageData(id, 0, 0);
      resolve(canvas.toDataURL('image/png').split(',')[1]);
    };
    img.src = `data:${mimeType};base64,${base64}`;
  });
}

// Conversion PDF page 1 → image PNG via pdf.js
async function pdfToImage(base64) {
  try {
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
    const pdf    = await (await pdfjsLib.getDocument({ data: atob(base64) }).promise);
    const page   = await pdf.getPage(1);
    const vp     = page.getViewport({ scale: 2.5 });
    const canvas = document.createElement('canvas');
    canvas.width = vp.width; canvas.height = vp.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    return canvas.toDataURL('image/png').split(',')[1];
  } catch { return null; }
}

// Conversion PDF → image UNIQUEMENT si mono-page — sert à l'impression
// (PrintModal.jsx) : imprimer une ordonnance PDF ouvrait un onglet séparé
// (3 actions : imprimer, imprimer dans l'onglet, confirmer) contre 2 pour une
// image (imprimer, confirmer). Un PDF multi-page garde l'onglet séparé — pas
// de perte de pages, la conversion ne concerne que le cas mono-page.
async function pdfFirstPageIfSinglePage(base64) {
  try {
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
    const pdf = await pdfjsLib.getDocument({ data: atob(base64) }).promise;
    if (pdf.numPages !== 1) return null;
    const page = await pdf.getPage(1);
    const vp = page.getViewport({ scale: 2.5 });
    const canvas = document.createElement('canvas');
    canvas.width = vp.width; canvas.height = vp.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    return canvas.toDataURL('image/jpeg', 0.92);
  } catch { return null; }
}

// Convertit TOUTES les pages d'un PDF en images — variante multi-page de
// pdfFirstPageIfSinglePage, utilisée uniquement si PDF_MULTIPAGE_TO_IMAGE
// est activé (voir PrintModal.jsx). Le temps de conversion grandit avec le
// nombre de pages (chaque page est rendue individuellement avant que
// l'impression puisse démarrer) — pdfFirstPageIfSinglePage reste le
// comportement par défaut pour cette raison.
async function pdfAllPagesAsImages(base64) {
  try {
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
    const pdf = await pdfjsLib.getDocument({ data: atob(base64) }).promise;
    const images = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const vp = page.getViewport({ scale: 2.5 });
      const canvas = document.createElement('canvas');
      canvas.width = vp.width; canvas.height = vp.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
      images.push(canvas.toDataURL('image/jpeg', 0.92));
    }
    return images;
  } catch { return null; }
}

// Parsers regex ordonnances françaises
const OCR_PARSERS = {
  carteVitale(txt) {
    const clean = txt.replace(/[^0-9]/g, '');
    const m = clean.match(/([12][0-9]{12,14})/);
    if (!m) return null;
    const r = m[1].slice(0, 15);
    return r.replace(/^(\d)(\d{2})(\d{2})(\d{2})(\d{3})(\d{3})(\d{2})$/, '$1 $2 $3 $4 $5 $6 $7') || null;
  },
  medecin(txt) {
    // @fix 18/09/2026 — jamais réellement testée avant ce jour (fonction
    // définie mais jamais appelée par extractFromFile, voir plus bas) :
    // utilisait \s comme le motif nom() avant son propre correctif du
    // 16/09/2026, avec le même bug — "Dr Panagiota BOUGATSOU\nOphtalmologiste"
    // capturait "Panagiota BOUGATSOU\nOphtalmolog" (tronqué à 30 caractères),
    // le saut de ligne étant avalé par \s. Même correctif : [^\S\n] pour
    // rester sur la ligne du médecin.
    const m = txt.match(/(?:Dr\.?|Docteur)[^\S\n]+([A-ZÁÀÂÉÈÊËÎÏÔÙÛÜÇ][A-Za-zÁÀÂÉÈÊËÎÏÔÙÛÜÇáàâéèêëîïôùûüç -]{2,30})/i)
           || txt.match(/Prescripteur[^\S\n]*[:][^\S\n]*(.+)/i);
    return m ? ('Dr ' + m[1].trim().slice(0, 40)) : null;
  },
  nom(txt) {
    // @fix 16/09/2026 — "MEDICAL Ancien Interne" extrait comme nom patient sur
    // une vraie ordonnance Doctolib (bloc de titres du médecin en en-tête,
    // ex. "GYNECOLOGUE OBSTETRICIEN ET\nMEDICAL\nAncien Interne et Chef de
    // clinique..."). Deux causes : (1) tous les motifs utilisaient \s, qui
    // matche aussi le saut de ligne — "MEDICAL" (majuscules, fin d'une ligne)
    // se retrouvait donc concaténé avec "Ancien Interne" (ligne suivante,
    // Capitalisée) comme s'ils appartenaient à la même ligne ; remplacé
    // partout par [^\S\n] (espace/tabulation, jamais \n) pour rester sur UNE
    // seule ligne réelle, aussi bien entre le libellé et sa valeur qu'à
    // l'intérieur de la valeur elle-même (sinon "Rosy NGAMENI TCHOKOTEU"
    // continuait de capturer le début de la ligne suivante, "Né(e) le…").
    // (2) le libellé réel de cette ordonnance est "Nom de naissance :"
    // (variante Doctolib courante), pas juste "Nom :" — le motif explicite ne
    // le reconnaissait pas et retombait donc sur le motif de repli fautif
    // avant même d'atteindre la vraie ligne du patient, plus bas dans le texte.
    // @fix 18/09/2026 — certaines ordonnances de spécialiste (ex. ophtalmologue)
    // n'ont aucun label "Nom :"/"Patient :" : le nom apparaît en formule
    // d'adresse ("Madame Gloria NGO"), sans deux-points. Sans ce motif, ça
    // retombait directement sur le repli générique (dernier recours), qui
    // accroche plus volontiers un fragment de tampon/cachet en bas de page
    // (lui aussi en MAJUSCULES + mot Capitalisé) que le vrai nom du patient.
    // Une seule ligne comme les autres motifs (voir plus haut) — un nom qui
    // continue sur la ligne suivante (repli à la marge) reste tronqué plutôt
    // que de risquer de capturer une ligne sans rapport.
    const m = txt.match(/(?:Patient|Assuré)[^\S\n]*[:][^\S\n]*([A-ZÁÀÂÉÈÊËÎÏÔÙÛÜÇ][A-Za-zÁÀÂÉÈÊËÎÏÔÙÛÜÇáàâéèêëîïôùûüç -]{2,40})/i)
           || txt.match(/Nom(?:[^\S\n]+de[^\S\n]+naissance|[^\S\n]+du[^\S\n]+patient|[^\S\n]+et[^\S\n]+pr[ée]nom)?[^\S\n]*[:][^\S\n]*([A-ZÁÀÂÉÈÊËÎÏÔÙÛÜÇ][A-Za-zÁÀÂÉÈÊËÎÏÔÙÛÜÇáàâéèêëîïôùûüç -]{2,40})/i)
           || txt.match(/(?:Madame|Monsieur|Mme)[^\S\n]+([A-ZÁÀÂÉÈÊËÎÏÔÙÛÜÇ][A-Za-zÁÀÂÉÈÊËÎÏÔÙÛÜÇáàâéèêëîïôùûüç -]{2,40})/i)
           || txt.match(/^([A-ZÁÀÂÉÈÊËÎÏÔÙÛÜÇ]{2,}(?:[^\S\n]+[A-ZÁÀÂÉÈÊËÎÏÔÙÛÜÇ][a-z]{1,20}){1,2})/m);
    if (!m) return null;
    // Vérifié mot par mot (pas seulement la correspondance entière) : un
    // faux positif composite comme "MEDICAL Ancien Interne" ne matchait
    // aucune entrée de l'ancienne liste testée en égalité stricte, puisque
    // celle-ci ne contenait que des mots isolés.
    const excluded = new Set(['ORDONNANCE','MEDICALE','PRESCRIPTION','REPUBLIQUE','CABINET','MEDECIN',
      'ANCIEN','INTERNE','CHEF','CLINIQUE','HOPITAUX','HÔPITAUX','PRATICIEN','HOSPITALIER',
      'COORDINATEUR','MEMBRE','GROUPE','ETUDE','INSTITUT','CENTRE','FERTILITE','MATERNITE']);
    const mots = m[1].trim().toUpperCase().split(/\s+/);
    if (mots.some(w => excluded.has(w))) return null;
    return m[1].trim().slice(0, 50);
  },
  date(txt) {
    const m = txt.match(/(\d{1,2})[/\-.·](\d{1,2})[/\-.·](\d{2,4})/);
    if (!m) return null;
    const y = m[3].length === 2 ? '20' + m[3] : m[3];
    return `${m[1].padStart(2,'0')}/${m[2].padStart(2,'0')}/${y}`;
  },
  medicaments(txt) {
    const meds = [];
    const lines = txt.split("\n").map(function(l){ return l.trim(); }).filter(function(l){ return l.length > 3; });
    const doseRx = new RegExp("\\d+[,.]?\\d*\\s*(?:mg|g|ml|UI|mcg|%)", "i");
    const formRx = new RegExp("(?:cp|gel|comp|supp|amp|sachet|flacon|patch|tube|pom)", "i");
    for (var j = 0; j < lines.length; j++) {
      var line = lines[j];
      if ((doseRx.test(line) || formRx.test(line)) && line.length < 80) {
        var clean = line.replace(/^[-*.\d]\s+/, "").trim();
        if (clean.length > 3 && meds.indexOf(clean) === -1 && meds.length < 10) meds.push(clean);
      }
    }
    return meds;
  },
};

// Fonction principale — appelée à chaque réception d'image
async function extractFromFile(base64, mimeType, { fallbackName = null } = {}) {
  try {
    let imgB64 = base64;

    // PDF → image (page 1)
    if (mimeType === 'application/pdf') {
      const converted = await pdfToImage(base64);
      if (!converted) return { nom: fallbackName, carteVitale: null, medecin: null, date: null, medicaments: [], _ocrSuccess: false };
      imgB64 = converted; mimeType = 'image/png';
    }

    // Pré-traitement
    const processed = await preprocessImage(imgB64, mimeType);

    // OCR Tesseract
    const worker = await getTesseractWorker();
    if (!worker) {
      // OCR non disponible — utiliser le fallback nom
      return { nom: fallbackName, carteVitale: null, medecin: null, date: null, medicaments: [], _ocrSuccess: false, _confidence: 0 };
    }
    const { data: { text, confidence } } = await worker.recognize(`data:image/png;base64,${processed}`);

    // Confiance insuffisante → fallback nom
    if (!text || confidence < 15) {
      return { nom: fallbackName, carteVitale: null, medecin: null, date: null, medicaments: [], _ocrSuccess: false, _confidence: Math.round(confidence || 0) };
    }

    // Le médecin prescripteur est rebranché le 18/09/2026 — jusque-là,
    // OCR_PARSERS.medecin existait mais n'était jamais appelé ici ("OCR
    // simplifié : extraire uniquement nom + prénom du patient") : le champ
    // "Médecin prescripteur" du rappel de renouvellement (RappelsSection.jsx)
    // ne pouvait donc jamais se préremplir depuis l'OCR en usage réel, malgré
    // le mécanisme déjà en place côté rappel. La carte Vitale reste, elle,
    // volontairement non extraite (minimisation RGPD d'un numéro de sécurité
    // sociale) — le médecin prescripteur n'est pas une donnée de même
    // sensibilité et figure déjà, non masqué, sur l'ordonnance imprimée.
    const nomExtrait = OCR_PARSERS.nom(text) || fallbackName || null;
    const medecinExtrait = OCR_PARSERS.medecin(text);
    const result = {
      nom:          nomExtrait,
      carteVitale:  null,  // non extrait (conformité RGPD)
      medecin:      medecinExtrait,
      date:         null,
      medicaments:  [],
      _confidence:  Math.round(confidence),
      _ocrSuccess:  !!(nomExtrait && confidence >= 15),
    };

    return result;
  } catch(e) {
    console.warn('[OCR Tesseract]', e.message);
    return { nom: fallbackName, carteVitale: null, medecin: null, date: null, medicaments: [], _ocrSuccess: false };
  }
}

// Préchargement silencieux dès la connexion du pharmacien
function prewarmTesseract() { getTesseractWorker().catch(() => {}); }

// ─── UI primitives ────────────────────────────────────────────────────────────

// @fix 24/09/2026 (audit) — OCR_PARSERS exporté uniquement pour permettre des
// tests unitaires (ocr.test.js) sur la logique regex, historiquement la
// source de plusieurs bugs réels (voir les commentaires @fix ci-dessus) —
// jamais couverte jusqu'ici. N'affecte pas le comportement de extractFromFile,
// qui continue de l'utiliser en interne exactement comme avant.
export { getTesseractWorker, preprocessImage, pdfToImage, pdfFirstPageIfSinglePage, pdfAllPagesAsImages, extractFromFile, prewarmTesseract, OCR_PARSERS };
