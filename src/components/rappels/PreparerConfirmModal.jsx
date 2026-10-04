// Confirmation avant de marquer préparé — extrait de RappelsSection.jsx
// (02/10/2026, découpage).
// (29/09/2026) — génère et consomme un code de casier (compteur incrémenté,
// jamais réutilisé), donc une confirmation explicite évite qu'un clic
// accidentel consomme un casier pour rien plutôt qu'une fois le médicament
// réellement préparé et rangé.
export function PreparerConfirmModal({ rappel, onCancel, onConfirm, submitting, error }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,47,0.55)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onCancel}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 380, boxShadow: "0 12px 40px rgba(0,0,0,0.25)" }}>
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 8 }}>📦 Marquer comme préparé ?</div>
        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 20, lineHeight: 1.5 }}>
          Un identifiant de casier sera généré pour <strong>{rappel.patient_prenom} {rappel.patient_nom}</strong> — à faire uniquement une fois le médicament réellement préparé et rangé.
        </div>
        {error && <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 12 }}>{error}</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onCancel} disabled={submitting}
            style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1.5px solid #e2e8f0", background: "#fff", color: "#475569", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
            Annuler
          </button>
          <button onClick={onConfirm} disabled={submitting}
            style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: "#c2410c", color: "#fff", fontWeight: 700, fontSize: 14, cursor: submitting ? "default" : "pointer", fontFamily: "inherit", opacity: submitting ? 0.7 : 1 }}>
            {submitting ? "…" : "Confirmer"}
          </button>
        </div>
      </div>
    </div>
  );
}
