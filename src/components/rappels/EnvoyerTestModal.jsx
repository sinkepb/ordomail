// Confirmation avant envoi manuel du SMS — extrait de RappelsSection.jsx
// (02/10/2026, découpage).
// (06/09/2026) — envoyait auparavant le lien par email à une adresse de test
// tant que le SMS réel n'était pas branché (voir _shared/sms.ts) ; envoie
// désormais un vrai SMS, au tarif réel, directement au patient. Le canal
// email de secours (bouton retiré une fois le sender SMS OVH validé) reste
// géré côté serveur (rappels_envoyer_test) mais n'est plus accessible depuis
// cette interface.
export function EnvoyerTestModal({ rappel, onCancel, onSend, sending, error }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,47,0.55)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onCancel}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 380, boxShadow: "0 12px 40px rgba(0,0,0,0.25)" }}>
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 8 }}>📱 Envoyer le SMS maintenant</div>
        <div style={{ fontSize: 12.5, color: "#64748b", marginBottom: 16, lineHeight: 1.5 }}>
          Envoie immédiatement le lien de rappel par SMS à <strong>{rappel.patient_prenom}</strong> ({rappel.patient_telephone}), sans attendre la prochaine relance automatique. Consomme un crédit SMS réel.
        </div>
        {error && <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 12 }}>{error}</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={onCancel} disabled={sending}
            style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1.5px solid #e2e8f0", background: "#fff", color: "#475569", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
            Annuler
          </button>
          <button type="button" disabled={sending} onClick={() => onSend()}
            style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: "#1a3a6e", color: "#fff", fontWeight: 700, fontSize: 14, cursor: sending ? "default" : "pointer", fontFamily: "inherit", opacity: sending ? 0.5 : 1 }}>
            {sending ? "Envoi…" : "Envoyer"}
          </button>
        </div>
      </div>
    </div>
  );
}
