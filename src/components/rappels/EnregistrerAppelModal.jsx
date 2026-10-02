// Enregistrer le choix du patient après un appel téléphonique — extrait de
// RappelsSection.jsx (02/10/2026, découpage).
// (30/09/2026) — pendant du choix fait par le patient lui-même sur la page
// publique resolve-rappel (lien SMS), ici saisi par le pharmacien après
// avoir appelé un patient en mode "appel" (numéro fixe, sans mobile).
// Détail du renouvellement partiel (01/10/2026, retour titulaire) — "partiel"
// seul ne dit pas QUELS médicaments ; demandé ici car c'est le seul moment où
// cette info existe (le pharmacien vient de raccrocher), sinon elle ne finit
// nulle part sauf à rouvrir "Modifier" de soi-même en dehors du parcours guidé.
import { useState } from "react";

export function EnregistrerAppelModal({ rappel, onCancel, onChoix, submitting, error }) {
  const [choixPartiel, setChoixPartiel] = useState(false);
  const [detailPartiel, setDetailPartiel] = useState("");

  if (choixPartiel) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,47,0.55)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onCancel}>
        <div onClick={e => e.stopPropagation()}
          style={{ background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 400, boxShadow: "0 12px 40px rgba(0,0,0,0.25)" }}>
          <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>🔶 Quels médicaments renouveler ?</div>
          <div style={{ fontSize: 12.5, color: "#64748b", marginBottom: 12 }}>{rappel.patient_prenom} {rappel.patient_nom}</div>
          <textarea value={detailPartiel} onChange={e => setDetailPartiel(e.target.value)} rows={3} autoFocus
            placeholder="Ex : seulement le Doliprane, pas l'antibiotique"
            style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", marginBottom: 12, fontFamily: "inherit", fontSize: 14, boxSizing: "border-box", resize: "vertical" }} />
          {error && <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 12 }}>{error}</div>}
          <button type="button" disabled={submitting || !detailPartiel.trim()} onClick={() => onChoix("partiel", detailPartiel)}
            style={{ width: "100%", padding: "11px", borderRadius: 10, border: "none", background: "#92400e", color: "#fff", fontWeight: 700, fontSize: 14, cursor: (submitting || !detailPartiel.trim()) ? "default" : "pointer", fontFamily: "inherit", opacity: (submitting || !detailPartiel.trim()) ? 0.6 : 1, marginBottom: 8 }}>
            Confirmer
          </button>
          <button type="button" onClick={() => setChoixPartiel(false)} disabled={submitting}
            style={{ width: "100%", padding: "10px", borderRadius: 10, border: "1.5px solid #e2e8f0", background: "#fff", color: "#475569", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
            ← Retour
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,47,0.55)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onCancel}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 400, boxShadow: "0 12px 40px rgba(0,0,0,0.25)" }}>
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>📞 Quel est le choix du patient ?</div>
        <div style={{ fontSize: 12.5, color: "#64748b", marginBottom: 16 }}>{rappel.patient_prenom} {rappel.patient_nom} — après l'avoir appelé(e)</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
          <button type="button" disabled={submitting} onClick={() => onChoix("tout_renouveler")}
            style={{ padding: "11px", borderRadius: 10, border: "1.5px solid #86efac", background: "#f0fdf4", color: "#15803d", fontWeight: 700, fontSize: 14, cursor: submitting ? "default" : "pointer", fontFamily: "inherit", textAlign: "left" }}>
            ✅ Tout renouveler
          </button>
          <button type="button" disabled={submitting} onClick={() => setChoixPartiel(true)}
            style={{ padding: "11px", borderRadius: 10, border: "1.5px solid #fde68a", background: "#fffbeb", color: "#92400e", fontWeight: 700, fontSize: 14, cursor: submitting ? "default" : "pointer", fontFamily: "inherit", textAlign: "left" }}>
            🔶 Renouvellement partiel
          </button>
          <button type="button" disabled={submitting} onClick={() => onChoix("rien")}
            style={{ padding: "11px", borderRadius: 10, border: "1.5px solid #fecaca", background: "#fef2f2", color: "#b91c1c", fontWeight: 700, fontSize: 14, cursor: submitting ? "default" : "pointer", fontFamily: "inherit", textAlign: "left" }}>
            🚫 Ne rien prendre
          </button>
        </div>
        {error && <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 12 }}>{error}</div>}
        <button type="button" onClick={onCancel} disabled={submitting}
          style={{ width: "100%", padding: "10px", borderRadius: 10, border: "1.5px solid #e2e8f0", background: "#fff", color: "#475569", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
          Annuler
        </button>
        {/* Canal d'opposition (01/10/2026, audit RGPD) — même logique que
            RappelChoixPage.jsx, pour un patient qui le demande pendant
            l'appel plutôt que via le lien SMS. */}
        <button type="button" disabled={submitting} onClick={() => onChoix("stop")}
          style={{ width: "100%", marginTop: 10, background: "none", border: "none", color: "#94a3b8", fontSize: 12, cursor: submitting ? "default" : "pointer", fontFamily: "inherit", textDecoration: "underline" }}>
          Le patient demande à ne plus être recontacté
        </button>
      </div>
    </div>
  );
}
