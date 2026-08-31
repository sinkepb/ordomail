import { useState, useEffect } from "react";
import { getSignedUrl } from "../supabase.js";
import { generateOrdoPDF } from "../lib/print.jsx";
import { pdfFirstPageIfSinglePage, pdfAllPagesAsImages } from "../lib/ocr.js";
import { escapeHtml, truncateFilename } from "../lib/utils.js";

// @flag 29/08/2026 — false = comportement livré par défaut (seul un PDF
// mono-page est converti en image à l'impression, le multi-page garde
// l'onglet séparé). true = convertit aussi le multi-page (toutes les pages),
// au prix d'un délai de conversion croissant avec le nombre de pages. Un
// simple retour à false suffit à annuler ce changement sans toucher au reste
// du code.
const PDF_MULTIPAGE_TO_IMAGE = true;

function ViewerModal({ att, onClose }) {
  // Repéré par le linter (phase 2) : le useEffect ci-dessous était placé après un
  // retour anticipé (if (!att) return null) — un Hook appelé de façon conditionnelle
  // selon les rendus, en violation des Rules of Hooks (source d'erreurs React "fewer
  // hooks than expected"). Le retour anticipé est déplacé après tous les Hooks.
  const isPdf = att?.type === "pdf";
  // HEIC (photo iPhone) : aucun navigateur de bureau ne peut le décoder dans
  // une balise <img> — même traitement que le PDF (nouvel onglet / téléchargement)
  // plutôt qu'une tentative d'affichage inline qui échoue silencieusement.
  const isUnpreviewable = isPdf || att?.type === "heic";

  // Pour les PDF/HEIC : ouvrir dans un nouvel onglet au montage
  useEffect(() => {
    if (!att || !isUnpreviewable || !att.dataUrl) return;
    const win = window.open(att.dataUrl, "_blank", "noopener,noreferrer");
    // Si le navigateur bloque le popup, on reste dans la modale avec le message
    if (win) { win.focus(); onClose(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- comportement au montage uniquement, inchangé
  }, []);

  if (!att) return null;

  // Pour les images (JPEG/PNG) : affichage inline dans la modale
  if (!isUnpreviewable) {
    return (
      <div
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}
        onClick={onClose}
      >
        <div
          style={{ background: "#1e293b", borderRadius: 14, overflow: "hidden", maxWidth: "92vw", maxHeight: "92vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 60px rgba(0,0,0,0.6)" }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div style={{ padding: "12px 18px", borderBottom: "1px solid #334155", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 18 }}>🖼️</span>
              <span style={{ fontWeight: 700, color: "#fff", fontSize: 14 }}>{truncateFilename(att.name)}</span>
              <span style={{ fontSize: 11, color: "#64748b", background: "#0f172a", padding: "2px 8px", borderRadius: 6 }}>{att.size}</span>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <a href={att.dataUrl} download={att.name} style={{ padding: "6px 12px", border: "1.5px solid #475569", borderRadius: 8, color: "#94a3b8", fontWeight: 600, fontSize: 12, textDecoration: "none", display: "flex", alignItems: "center", gap: 5 }}>⬇️ Télécharger</a>
              <button onClick={onClose} style={{ width: 32, height: 32, border: "none", background: "#334155", borderRadius: 8, color: "#94a3b8", cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
            </div>
          </div>
          {/* Image */}
          <div style={{ flex: 1, overflow: "auto", background: "#0f172a", display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}>
            <img src={att.dataUrl} alt={att.name} style={{ maxWidth: "100%", maxHeight: "80vh", objectFit: "contain", borderRadius: 6 }} />
          </div>
        </div>
      </div>
    );
  }

  // PDF / HEIC — modale avec bouton "Ouvrir" si window.open a été bloqué
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}
      onClick={onClose}
    >
      <div
        style={{ background: "#1e293b", borderRadius: 16, padding: 32, maxWidth: 420, width: "100%", textAlign: "center", boxShadow: "0 24px 60px rgba(0,0,0,0.5)" }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ fontSize: 52, marginBottom: 14 }}>{isPdf ? "📄" : "📷"}</div>
        <div style={{ fontWeight: 800, fontSize: 18, color: "#fff", marginBottom: 6 }}>{truncateFilename(att.name)}</div>
        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 24 }}>
          {isPdf
            ? "Les PDF s'ouvrent dans un nouvel onglet pour un affichage optimal."
            : "Photo au format HEIC (iPhone) — non prévisualisable dans le navigateur. Téléchargez-la pour l'ouvrir avec la visionneuse de votre ordinateur."}
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <a
            href={att.dataUrl}
            target="_blank"
            rel="noreferrer"
            style={{ padding: "12px 24px", border: "none", borderRadius: 10, background: "#3b82f6", color: "#fff", fontWeight: 700, fontSize: 15, textDecoration: "none", display: "flex", alignItems: "center", gap: 8 }}
          >
            {isPdf ? "🔗 Ouvrir le PDF" : "🔗 Ouvrir"}
          </a>
          <a
            href={att.dataUrl}
            download={att.name}
            style={{ padding: "12px 20px", border: "1.5px solid #475569", borderRadius: 10, background: "transparent", color: "#94a3b8", fontWeight: 600, fontSize: 14, textDecoration: "none", display: "flex", alignItems: "center", gap: 6 }}
          >
            ⬇️ Télécharger
          </a>
        </div>
        <button onClick={onClose} style={{ marginTop: 18, background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 13 }}>Fermer</button>
      </div>
    </div>
  );
}

function PrintConfirmModal({ ordo, couleur, onConfirm }) {
  const nom    = ordo.extracted?.nom || ordo.fromName;
  const email  = ordo.fromEmail || "";
  const medecin = ordo.extracted?.medecin || "";
  const date    = ordo.extracted?.date    || "";
  const medicaments = ordo.extracted?.medicaments || [];
  const [step, setStep] = useState("ready");

  async function doPrint() {
    setStep("ready");
    const printArea = document.getElementById("ordomail-print-area");
    if (!printArea) { window.print(); setTimeout(() => setStep("confirm"), 500); return; }

    const att = ordo.attachments?.[0];
    // En prod : charger la signed URL si dataUrl absent mais path disponible
    if (att && !att.dataUrl && att.path) {
      att.dataUrl = await getSignedUrl(att.path, 300); // 5 minutes
    }
    const hasFile = att?.dataUrl;

    // ⚠️ medecin/date proviennent du formulaire patient (non authentifié) ou de
    // l'OCR — toujours échapper avant interpolation dans du HTML brut (anti-XSS).
    const safeMedecin = escapeHtml(medecin);
    const safeDate    = escapeHtml(date);

    // Impression inline (portail #ordomail-print-area) d'une ou plusieurs
    // images déjà prêtes — factorisé car utilisé par le Cas 1 (JPEG/PNG, un
    // seul élément) et le Cas 2 (PDF converti en image, un ou plusieurs
    // éléments selon PDF_MULTIPAGE_TO_IMAGE). page-break-after sur chaque
    // page sauf la dernière : une image = une feuille imprimée.
    async function printImagesInline(dataUrls) {
      printArea.innerHTML = dataUrls.map((url, i) => `<div style="text-align:center;padding:8px;${i < dataUrls.length - 1 ? "page-break-after:always;" : ""}">
        <img class="ordo-print-img" src="${url}" style="max-width:100%;max-height:calc(100vh - 80px);object-fit:contain;display:block;margin:0 auto" />
      </div>`).join("");
      const imgEls = Array.from(printArea.querySelectorAll(".ordo-print-img"));
      await Promise.all(imgEls.map(imgEl => new Promise(resolve => {
        if (imgEl.complete) resolve();
        else { imgEl.onload = resolve; imgEl.onerror = resolve; }
        setTimeout(resolve, 3000); // timeout de sécurité
      })));
      window.print();
      setTimeout(() => { printArea.innerHTML = ""; setStep("confirm"); }, 500);
    }

    if (hasFile && att.type === "image") {
      // ── Cas 1 : image JPEG/PNG ────────────────────────────────────────────
      await printImagesInline([att.dataUrl]);

    } else if (hasFile && att.type === "pdf") {
      // ── Cas 2 : PDF ───────────────────────────────────────────────────────
      // @fix 29/08/2026 — un PDF est converti en image(s) via pdf.js (déjà
      // chargé pour l'OCR, voir lib/ocr.js) et imprimé inline comme une image :
      // 2 actions (imprimer, confirmer) au lieu de 3 (imprimer, imprimer dans
      // l'onglet séparé, confirmer). Par défaut (PDF_MULTIPAGE_TO_IMAGE=false),
      // seul le mono-page est converti, sans perte ; le multi-page garde
      // l'onglet séparé (délai de conversion sinon croissant avec le nombre de
      // pages). Passer le flag à true convertit aussi le multi-page.
      let base64 = null;
      try {
        const resp = await fetch(att.dataUrl);
        const blob = await resp.blob();
        base64 = await new Promise(resolve => {
          const r = new FileReader();
          r.onload = () => resolve(r.result.split(",")[1]);
          r.readAsDataURL(blob);
        });
      } catch { base64 = null; }

      let pageImages = null;
      if (base64) {
        pageImages = PDF_MULTIPAGE_TO_IMAGE
          ? await pdfAllPagesAsImages(base64)
          : await pdfFirstPageIfSinglePage(base64).then(img => img ? [img] : null);
      }

      if (pageImages && pageImages.length) {
        await printImagesInline(pageImages);
      } else {
        // Échec de conversion (ou multi-page avec le flag désactivé) —
        // comportement de repli : ouvrir dans un nouvel onglet pour
        // impression native. @fix 27/08/2026 — remplace document.write()
        // d'une page wrapper avec <embed src="..."> (page blanche fréquente
        // sous Chrome : le lecteur PDF intégré n'accroche pas toujours sur un
        // <embed> inséré dans une popup about:blank via document.write) par
        // une navigation directe vers l'URL du fichier — le navigateur ouvre
        // alors son propre lecteur PDF natif.
        const pdfWin = window.open(att.dataUrl, "_blank", "noopener,noreferrer");
        if (pdfWin) { pdfWin.focus(); }
        setTimeout(() => setStep("confirm"), 800);
      }

    } else if (hasFile && att.type === "heic") {
      // ── Cas 2bis : photo HEIC (iPhone) — aucun navigateur de bureau ne peut la
      // décoder dans une <img>, donc pas d'impression inline possible ici (le
      // Cas 1 laisserait juste une icône brisée à l'impression). Même approche
      // que le PDF : nouvel onglet, le navigateur télécharge ou l'ouvre selon
      // son support HEIC — le titulaire imprime alors depuis son visualiseur.
      const heicWin = window.open(att.dataUrl, "_blank", "noopener,noreferrer");
      if (heicWin) { heicWin.focus(); }
      setTimeout(() => setStep("confirm"), 800);

    } else {
      // ── Cas 3 : pas de fichier — générer PDF via generateOrdoPDF si source email ──
      if (ordo.source === "email") {
        const pdfUrl = generateOrdoPDF(ordo);
        const pdfWin = window.open(pdfUrl, "_blank");
        if (pdfWin) { pdfWin.focus(); }
        setTimeout(() => {
          if (printArea) printArea.innerHTML = "";
          URL.revokeObjectURL(pdfUrl);
          setStep("confirm");
        }, 800);
        return;
      }
      // Fiche de synthèse simple si aucune source
      const medsHtml = medicaments.filter(Boolean).map(m =>
        `<li style="font-size:14px;margin-bottom:5px">${escapeHtml(m)}</li>`
      ).join("");
      printArea.innerHTML = `<div style="font-family:Arial,sans-serif;padding:20px 28px;max-width:620px;margin:0 auto">
        <div style="background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:12px 16px;margin-bottom:18px;font-size:13px;color:#856404">
          ⚠️ Aucun fichier d'ordonnance joint. Impression de la fiche de synthèse.
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:18px">
          <div style="background:#f8f9ff;padding:14px;border-radius:9px;border:1px solid #dde4f5">
            <div style="font-size:10px;font-weight:700;color:#888;text-transform:uppercase;margin-bottom:5px">Médecin</div>
            <div style="font-size:15px;font-weight:700">${safeMedecin || "—"}</div>
          </div>
          <div style="background:#f8f9ff;padding:14px;border-radius:9px;border:1px solid #dde4f5">
            <div style="font-size:10px;font-weight:700;color:#888;text-transform:uppercase;margin-bottom:5px">Date prescription</div>
            <div style="font-size:15px;font-weight:700">${safeDate || "—"}</div>
          </div>
        </div>
        ${medsHtml ? `<div><div style="font-size:10px;font-weight:700;color:#888;text-transform:uppercase;margin-bottom:8px">Médicaments</div><ul style="margin:0;padding-left:20px;line-height:1.8">${medsHtml}</ul></div>` : ""}
      </div>`;
      window.print();
      setTimeout(() => { printArea.innerHTML = ""; setStep("confirm"); }, 500);
    }
  }

  useEffect(() => {
    const t = setTimeout(doPrint, 150);
    return () => clearTimeout(t);
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000, padding: 24 }}>
      <div style={{ background: "#fff", borderRadius: 20, padding: 32, maxWidth: 420, width: "100%", boxShadow: "0 24px 60px rgba(0,0,0,0.35)", animation: "popIn 0.2s ease" }}>
        {step === "ready" ? (
          <div style={{ textAlign: "center", padding: "16px 0" }}>
            <div style={{ fontSize: 56, marginBottom: 16, display: "inline-block", animation: "pulse 0.7s ease infinite" }}>🖨️</div>
            <div style={{ fontWeight: 800, fontSize: 18, color: "#1a1a1a", marginBottom: 6 }}>Ouverture de l'impression…</div>
            <div style={{ fontSize: 14, color: "#888" }}>La boîte de sélection d'imprimante va s'ouvrir</div>
          </div>
        ) : (
          <>
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <div style={{ fontSize: 48, marginBottom: 10 }}>🖨️</div>
              <div style={{ fontWeight: 800, fontSize: 20, color: "#1a1a1a", marginBottom: 6 }}>L'impression est-elle réussie ?</div>
              <div style={{ fontSize: 13, color: "#888", lineHeight: 1.6 }}>Confirmez que l'ordonnance a bien été imprimée pour la marquer comme traitée.</div>
            </div>
            <div style={{ background: "#f8f9ff", border: `1.5px solid ${couleur}44`, borderRadius: 12, padding: "14px 18px", marginBottom: 24 }}>
              <div style={{ fontSize: 10, color: "#aaa", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>Ordonnance de</div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 46, height: 46, borderRadius: "50%", background: couleur, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 900, fontSize: 20, flexShrink: 0 }}>
                  {nom?.charAt(0) || "?"}
                </div>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 20, color: "#1a1a1a" }}>{nom}</div>
                  {email && <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>✉️ {email}</div>}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={doPrint} style={{ flex: 1, padding: "12px", border: "1.5px solid #e0e0e0", borderRadius: 10, background: "#fff", color: "#555", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                🔄 Réimprimer
              </button>
              <button onClick={onConfirm} style={{ flex: 2, padding: "12px", border: "none", borderRadius: 10, background: "#2e7d32", color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 3px 12px rgba(46,125,50,0.3)", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                ✅ Oui, bien imprimée
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}


export { ViewerModal, PrintConfirmModal };
