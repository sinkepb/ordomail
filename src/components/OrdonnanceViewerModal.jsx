// Popup "Voir l'ordonnance" partagée (28/09/2026) — utilisée par RappelsSection
// et Dashboard. Remplace ViewerModal (PrintModal.jsx), qui ouvrait un PDF/HEIC
// dans un NOUVEL ONGLET : ici, un PDF est toujours converti en image(s) via
// pdf.js (déjà chargé pour l'OCR, voir lib/ocr.js) et affiché inline dans la
// popup, jamais de nouvelle fenêtre — même conversion que l'impression
// (PrintModal.jsx, PDF_MULTIPAGE_TO_IMAGE déjà activé en production), page
// par page si le PDF en a plusieurs. HEIC (photo iPhone) reste un cas résiduel
// non convertible côté navigateur : message clair plutôt qu'un repli vers un
// nouvel onglet.
//
// `att` attend { name, type: "image"|"pdf"|"heic", dataUrl } — dataUrl est
// l'URL utilisable (signée ou déjà data:), jamais un chemin de storage brut :
// à la charge de l'appelant de résoudre l'URL signée côté serveur au préalable
// (jamais côté client — voir le commentaire de rappels_ordonnance_fichier,
// secure-data/index.ts, sur le bug RLS storage pour les sessions vendeur).
import { useState, useEffect } from "react";
import { pdfAllPagesAsImages } from "../lib/ocr.js";
import { fileToBase64 } from "../lib/utils.js";

function OrdonnanceViewerModal({ att, onClose }) {
  const [images, setImages] = useState(null); // tableau de data URLs, ou null pendant le chargement
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!att?.dataUrl) return;
      if (att.type === "image") {
        setImages([att.dataUrl]);
        return;
      }
      if (att.type === "pdf") {
        try {
          const resp = await fetch(att.dataUrl);
          const blob = await resp.blob();
          const base64 = await fileToBase64(blob);
          const pages = await pdfAllPagesAsImages(base64);
          if (cancelled) return;
          if (pages && pages.length) setImages(pages);
          else setError("Impossible de convertir ce PDF en image.");
        } catch (e) {
          console.error("[OrdonnanceViewerModal]", e.message);
          if (!cancelled) setError("Impossible d'afficher ce fichier.");
        }
        return;
      }
      setError("Aperçu non disponible pour ce format (photo iPhone/HEIC) — téléchargez le fichier depuis l'onglet Ordonnances.");
    }
    load();
    return () => { cancelled = true; };
  }, [att]);

  // Même mécanisme que OrdoCard.jsx:handleDownload — passe par un blob local
  // plutôt qu'un lien direct vers l'URL signée, qui ouvrirait un nouvel onglet
  // au lieu de déclencher un téléchargement (comportement cross-origin).
  async function handleDownload() {
    if (!att?.dataUrl || downloading) return;
    setDownloading(true);
    try {
      const res = await fetch(att.dataUrl);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = att.name || "ordonnance";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (e) {
      console.error("[OrdonnanceViewerModal:handleDownload]", e.message);
    }
    setDownloading(false);
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20, overflowY: "auto" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ maxWidth: "90vw", display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
        {error && (
          <div style={{ background: "#fff", borderRadius: 12, padding: "20px 24px", color: "#dc2626", fontSize: 14, maxWidth: 360, textAlign: "center" }}>
            {error}
          </div>
        )}
        {!error && !images && <div style={{ color: "#fff", fontSize: 14 }}>Chargement…</div>}
        {!error && images && images.map((src, i) => (
          <img key={i} src={src} alt="" style={{ maxWidth: "100%", maxHeight: "80vh", objectFit: "contain", borderRadius: 6, background: "#fff" }} />
        ))}
        <div style={{ display: "flex", gap: 10 }}>
          {att?.dataUrl && (
            <button type="button" onClick={handleDownload} disabled={downloading}
              style={{ padding: "10px 20px", borderRadius: 10, border: "1.5px solid #fff", background: "transparent", color: "#fff", fontWeight: 700, fontSize: 14, cursor: downloading ? "default" : "pointer", opacity: downloading ? 0.6 : 1, fontFamily: "inherit" }}>
              {downloading ? "…" : "⬇️ Télécharger"}
            </button>
          )}
          <button type="button" onClick={onClose}
            style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: "#fff", color: "#1a3a6e", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

export { OrdonnanceViewerModal };
