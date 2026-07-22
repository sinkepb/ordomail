import { useState, useEffect, useRef } from "react";
import { getSignedUrl } from "../supabase.js";
import { generateOrdoPDF } from "../lib/print.jsx";
import { escapeHtml } from "../lib/utils.js";

function ViewerModal({ att, onClose }) {
  if (!att) return null;

  const isPdf = att.type === "pdf";

  // Pour les PDF : ouvrir dans un nouvel onglet au montage
  useEffect(() => {
    if (!isPdf || !att.dataUrl) return;
    const win = window.open(att.dataUrl, "_blank", "noopener,noreferrer");
    // Si le navigateur bloque le popup, on reste dans la modale avec le message
    if (win) { win.focus(); onClose(); }
  }, []);

  // Pour les images : affichage inline dans la modale
  if (!isPdf) {
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
              <span style={{ fontWeight: 700, color: "#fff", fontSize: 14 }}>{att.name}</span>
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

  // PDF — modale avec bouton "Ouvrir" si window.open a été bloqué
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}
      onClick={onClose}
    >
      <div
        style={{ background: "#1e293b", borderRadius: 16, padding: 32, maxWidth: 420, width: "100%", textAlign: "center", boxShadow: "0 24px 60px rgba(0,0,0,0.5)" }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ fontSize: 52, marginBottom: 14 }}>📄</div>
        <div style={{ fontWeight: 800, fontSize: 18, color: "#fff", marginBottom: 6 }}>{att.name}</div>
        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 24 }}>
          Les PDF s'ouvrent dans un nouvel onglet pour un affichage optimal.
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <a
            href={att.dataUrl}
            target="_blank"
            rel="noreferrer"
            style={{ padding: "12px 24px", border: "none", borderRadius: 10, background: "#3b82f6", color: "#fff", fontWeight: 700, fontSize: 15, textDecoration: "none", display: "flex", alignItems: "center", gap: 8 }}
          >
            🔗 Ouvrir le PDF
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

function PrintConfirmModal({ ordo, couleur, onConfirm, onCancel }) {
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
    const receivedDate = new Date(ordo.receivedAt).toLocaleDateString("fr-FR");
    const receivedTime = new Date(ordo.receivedAt).toLocaleTimeString("fr-FR", {hour:"2-digit",minute:"2-digit"});
    const printedDate = new Date().toLocaleDateString("fr-FR");
    const printedTime = new Date().toLocaleTimeString("fr-FR", {hour:"2-digit",minute:"2-digit"});

    // Bandeau patient affiché dans tous les cas au-dessus du document
    // ⚠️ nom/email/medecin/date proviennent du formulaire patient (non authentifié) ou de l'OCR —
    // toujours échapper avant interpolation dans du HTML brut (anti-XSS).
    const safeNom     = escapeHtml(nom);
    const safeEmail   = escapeHtml(email);
    const safeMedecin = escapeHtml(medecin);
    const safeDate    = escapeHtml(date);

    const banner = `<div style="font-family:Arial,sans-serif;padding:10px 16px;background:#1a3a6e;color:#fff;display:flex;justify-content:space-between;align-items:center;page-break-after:avoid">
      <div style="display:flex;align-items:center;gap:14px">
        <div style="font-size:18px;font-weight:900;letter-spacing:0.5px">OrdoMail</div>
        <div style="width:1px;height:24px;background:rgba(255,255,255,0.3)"></div>
        <div>
          <div style="font-size:16px;font-weight:700">${safeNom || "—"}</div>
          ${safeEmail ? `<div style="font-size:12px;opacity:0.8">${safeEmail}</div>` : ""}
        </div>
      </div>
      <div style="text-align:right;font-size:11px;opacity:0.75">
        <div>${safeMedecin} ${safeDate ? "· " + safeDate : ""}</div>
        <div>Reçue le ${receivedDate} à ${receivedTime}</div>
        <div>Imprimé le ${printedDate} à ${printedTime}</div>
      </div>
    </div>`;

    if (hasFile && att.type === "image") {
      // ── Cas 1 : image JPEG/PNG — attendre le chargement avant print ──────────
      printArea.innerHTML = banner + `<div style="text-align:center;padding:8px">
        <img id="ordo-print-img" src="${att.dataUrl}" style="max-width:100%;max-height:calc(100vh - 80px);object-fit:contain;display:block;margin:0 auto" />
      </div>`;
      // Attendre que l'image soit chargée avant d'imprimer
      const imgEl = document.getElementById("ordo-print-img");
      await new Promise(resolve => {
        if (imgEl.complete) resolve();
        else { imgEl.onload = resolve; imgEl.onerror = resolve; }
        setTimeout(resolve, 3000); // timeout de sécurité
      });
      window.print();
      setTimeout(() => { printArea.innerHTML = ""; setStep("confirm"); }, 500);

    } else if (hasFile && att.type === "pdf") {
      // ── Cas 2 : PDF — ouvrir dans un nouvel onglet pour impression native ────
      // Le navigateur imprime le PDF dans son viewer natif
      printArea.innerHTML = banner + `<div style="font-family:Arial;padding:20px;text-align:center;color:#555;font-size:14px">
        <div style="font-size:32px;margin-bottom:10px">📄</div>
        <div style="font-weight:700;margin-bottom:6px">${escapeHtml(att.name)}</div>
        <div>Le PDF s'ouvre dans un nouvel onglet pour l'impression.</div>
      </div>`;
      // Ouvrir le PDF dans un nouvel onglet — le navigateur affiche sa boîte d'impression native
      // rel/features vides + pas de référence conservée : on évite le reverse-tabnabbing (window.opener)
      const pdfWin = window.open("", "_blank", "noopener,noreferrer");
      if (pdfWin) {
        pdfWin.document.write(
          '<html><head><title>' + escapeHtml(nom || "Ordonnance") + '</title>' +
          '<style>body{margin:0}embed{width:100vw;height:100vh}</style></head>' +
          '<body><embed src="' + att.dataUrl + '" type="application/pdf" /></body></html>'
        );
        pdfWin.document.close();
        pdfWin.onload = () => { pdfWin.focus(); pdfWin.print(); };
      }
      setTimeout(() => { printArea.innerHTML = ""; setStep("confirm"); }, 800);

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
      printArea.innerHTML = banner + `<div style="font-family:Arial,sans-serif;padding:20px 28px;max-width:620px;margin:0 auto">
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
