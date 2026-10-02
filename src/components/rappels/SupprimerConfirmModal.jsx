// Confirmation avant suppression définitive d'un rappel (02/10/2026) —
// distincte de TerminerConfirmModal : sert à corriger une erreur de saisie
// (mauvais patient, doublon), pas à clore un suivi normal. Contrairement à
// "terminer", il ne reste aucune trace après (ligne + historique supprimés,
// voir secure-data:rappels_supprimer) — le ton de la confirmation doit
// refléter que c'est plus définitif qu'un simple arrêt de suivi.
export function SupprimerConfirmModal({ rappel, onCancel, onConfirm, submitting, error }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,47,0.55)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onCancel}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 380, boxShadow: "0 12px 40px rgba(0,0,0,0.25)" }}>
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 8 }}>🗑️ Supprimer ce rappel ?</div>
        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 12, lineHeight: 1.5 }}>
          Le rappel de <strong>{rappel.patient_prenom} {rappel.patient_nom}</strong> et tout son historique (SMS, réponses, appels) seront supprimés <strong>définitivement</strong>.
        </div>
        <div style={{ fontSize: 12, color: "#b91c1c", background: "#fef2f2", border: "1.5px solid #fecaca", borderRadius: 8, padding: "8px 10px", marginBottom: 16 }}>
          Action irréversible — si le suivi est simplement terminé, préférez "Fin de traitement" plutôt que supprimer.
        </div>
        {error && <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 12 }}>{error}</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onCancel} disabled={submitting}
            style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1.5px solid #e2e8f0", background: "#fff", color: "#475569", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
            Annuler
          </button>
          <button onClick={onConfirm} disabled={submitting}
            style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: "#b91c1c", color: "#fff", fontWeight: 700, fontSize: 14, cursor: submitting ? "default" : "pointer", fontFamily: "inherit", opacity: submitting ? 0.7 : 1 }}>
            {submitting ? "…" : "Supprimer définitivement"}
          </button>
        </div>
      </div>
    </div>
  );
}
