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
    const m = txt.match(/(?:Dr\.?|Docteur)\s+([A-ZÁÀÂÉÈÊËÎÏÔÙÛÜÇ][a-záàâéèêëîïôùûüç\s-]{2,30})/i)
           || txt.match(/Prescripteur\s*[:]\s*(.+)/i);
    return m ? ('Dr ' + m[1].trim().slice(0, 40)) : null;
  },
  nom(txt) {
    const m = txt.match(/(?:Patient|Nom|Assuré)\s*[:]\s*([A-ZÁÀÂÉÈÊËÎÏÔÙÛÜÇ][A-Za-záàâéèêëîïôùûüç\s-]{2,40})/i)
           || txt.match(/^([A-ZÁÀÂÉÈÊËÎÏÔÙÛÜÇ]{2,}(?:\s+[A-ZÁÀÂÉÈÊËÎÏÔÙÛÜÇ][a-z]{1,20}){1,2})/m);
    if (!m) return null;
    const excluded = ['ORDONNANCE','MEDICALE','PRESCRIPTION','REPUBLIQUE','CABINET','MEDECIN'];
    return excluded.includes(m[1].trim().toUpperCase()) ? null : m[1].trim().slice(0, 50);
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

    // OCR simplifié : extraire uniquement nom + prénom du patient
    const nomExtrait = OCR_PARSERS.nom(text) || fallbackName || null;
    const result = {
      nom:          nomExtrait,
      carteVitale:  null,  // non extrait (conformité RGPD)
      medecin:      null,
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

export { getTesseractWorker, preprocessImage, pdfToImage, extractFromFile, prewarmTesseract };
