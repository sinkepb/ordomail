import { prepareScannedImage, fileToDataUrl, computeBlurScore, BLUR_VARIANCE_THRESHOLD, enhanceContrastAndSharpness } from "../lib/imageEnhance.js";
import { detecterCoins, redresserAvecCoins } from "../lib/documentScan.js";
import { extractFromFile } from "../lib/ocr.js";

// Analyse des photos d'ordonnance du parcours patient : recadrage (automatique
// puis validé par le patient), amélioration, lisibilité et OCR. Extrait de
// PatientPage.jsx sans changement de comportement.
export function usePhotoAnalysis({ files, setFiles, nom }) {
  const cadrageEnCours = files.find(f => f.cadrage);

  async function analyserItem(item, rawDataUrl, coins) {
    try {
      const redresse = coins ? await redresserAvecCoins(item.file, coins) : null;
      const scanFile = redresse ? await enhanceContrastAndSharpness(redresse) : await prepareScannedImage(item.file);
      const scanDataUrl = scanFile === item.file ? rawDataUrl : await fileToDataUrl(scanFile);
      const base64 = scanDataUrl?.split(",")[1] || "";
      const [blurScore, extracted] = await Promise.all([
        computeBlurScore(item.file),
        extractFromFile(base64, scanFile.type, { fallbackName: nom || null }),
      ]);
      const flou = blurScore !== null && blurScore < BLUR_VARIANCE_THRESHOLD;
      // _confidence === 0 avec _ocrSuccess=false peut aussi signifier "OCR
      // indisponible" (voir ocr.js), pas forcément une photo illisible —
      // on ne prévient le patient que si l'OCR a vraiment tourné et a eu
      // du mal (confidence > 0 mais insuffisante pour réussir).
      const confianceFaible = extracted && !extracted._ocrSuccess && (extracted._confidence || 0) > 0;
      const warning = flou ? "Cette photo semble floue."
        : confianceFaible ? "Le texte de cette photo semble difficile à lire."
        : null;
      setFiles(prev => prev.map(x => x.id === item.id
        ? { ...x, dataUrl: scanDataUrl, scanFile, extracted, checking: false, warning }
        : x));
    } catch (err) {
      console.error("[handleFiles] analyse lisibilité", err?.message || err);
      setFiles(prev => prev.map(x => x.id === item.id ? { ...x, checking: false } : x));
    }
  }

  function validerCadrage(item, coins) {
    setFiles(prev => prev.map(x => x.id === item.id ? { ...x, cadrage: null } : x));
    analyserItem(item, item.cadrage.dataUrl, coins);
  }

  function handleFiles(selectedFiles) {
    const arr = Array.from(selectedFiles);
    const newFiles = arr.map(f => ({
      id: `${Date.now()}-${Math.random()}`,
      file: f,
      name: f.name,
      type: f.type,
      dataUrl: null,
      preview: null,
      // Lisibilité (02/10/2026, retour pharmacien) — analysée dès l'ajout de
      // la photo, pas seulement à l'envoi : le patient peut reprendre une
      // photo avant de soumettre. scanFile/extracted mis en cache ici sont
      // réutilisés tels quels par sendOne (handleSubmit) pour ne jamais
      // relancer le recadrage/OCR une seconde fois.
      checking: true,
      warning: null,
      scanFile: null,
      extracted: null,
    }));
    setFiles(prev => [...prev, ...newFiles]);

    newFiles.forEach(item => {
      const r = new FileReader();
      r.onload = async e => {
        const rawDataUrl = e.target.result;
        setFiles(prev => prev.map(x => x.id === item.id ? { ...x, dataUrl: rawDataUrl } : x));

        if (!item.file.type.startsWith("image/")) {
          analyserItem(item, rawDataUrl, null);
          return;
        }
        const coins = await detecterCoins(item.file);
        setFiles(prev => prev.map(x => x.id === item.id ? { ...x, cadrage: { coins, dataUrl: rawDataUrl } } : x));
      };
      r.readAsDataURL(item.file);
    });
  }

  return { cadrageEnCours, handleFiles, validerCadrage };
}
