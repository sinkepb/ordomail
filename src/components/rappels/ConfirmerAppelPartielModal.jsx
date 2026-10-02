// Confirmer l'appel de clarification d'un renouvellement partiel — extrait
// de RappelsSection.jsx (02/10/2026, découpage).
// (01/10/2026) — le choix est déjà connu (répondu "partiel" via le lien
// SMS), seul l'appel de clarification (quels médicaments renouveler) reste
// à confirmer pour passer à "à traiter".
import { useState } from "react";

export function ConfirmerAppelPartielModal({ rappel, onCancel, onConfirm, submitting, error }) {
  const [detailPartiel, setDetailPartiel] = useState("");
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,47,0.55)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onCancel}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 380, boxShadow: "0 12px 40px rgba(0,0,0,0.25)" }}>
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 8 }}>☎️ Appel effectué ?</div>
        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 12, lineHeight: 1.5 }}>
          Confirmez avoir appelé <strong>{rappel.patient_prenom} {rappel.patient_nom}</strong> pour préciser son renouvellement partiel — le rappel passera à "À traiter".
        </div>
        {/* Détail du renouvellement partiel (01/10/2026) — même exigence que
            EnregistrerAppelModal : sans ce champ, l'info précisée pendant
            l'appel ne finit nulle part. */}
        <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 4 }}>Quels médicaments renouveler ?</label>
        <textarea value={detailPartiel} onChange={e => setDetailPartiel(e.target.value)} rows={3} autoFocus
          placeholder="Ex : seulement le Doliprane, pas l'antibiotique"
          style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", marginBottom: 16, fontFamily: "inherit", fontSize: 14, boxSizing: "border-box", resize: "vertical" }} />
        {error && <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 12 }}>{error}</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onCancel} disabled={submitting}
            style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1.5px solid #e2e8f0", background: "#fff", color: "#475569", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
            Annuler
          </button>
          <button onClick={() => onConfirm(detailPartiel)} disabled={submitting || !detailPartiel.trim()}
            style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: "#a16207", color: "#fff", fontWeight: 700, fontSize: 14, cursor: (submitting || !detailPartiel.trim()) ? "default" : "pointer", fontFamily: "inherit", opacity: (submitting || !detailPartiel.trim()) ? 0.6 : 1 }}>
            {submitting ? "…" : "☎️ Oui, appel effectué"}
          </button>
        </div>
      </div>
    </div>
  );
}
