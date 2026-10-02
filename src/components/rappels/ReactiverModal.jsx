// Réactivation d'un rappel terminé — extrait de RappelsSection.jsx
// (02/10/2026, découpage).
// (07/09/2026) — repart sur le même patient (nom/téléphone/consentement déjà
// recueillis) plutôt que d'obliger à recréer un rappel depuis zéro. Même
// choix de date par défaut que la validation (J+28 de renouvellement, soit
// J+21 d'envoi).
import { useState } from "react";
import { defaultDateRenouvellement, todayDateInputValue, renouvellementVersEnvoi } from "./rappelsDateUtils.js";

export function ReactiverModal({ rappel, onCancel, onConfirm, submitting, serverError }) {
  const [dateRappel, setDateRappel] = useState(defaultDateRenouvellement);
  const [consentement, setConsentement] = useState(false);
  const [error, setError] = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!dateRappel || dateRappel < todayDateInputValue()) {
      setError("La date de renouvellement ne peut pas être dans le passé.");
      return;
    }
    // Consentement reconfirmé (01/10/2026, audit RGPD) — le serveur l'exige
    // désormais à chaque réactivation, pas seulement à la création : un
    // consentement recueilli des cycles plus tôt ne doit pas être présumé
    // valide indéfiniment.
    if (!consentement) {
      setError("Confirmez que le patient consent toujours à être recontacté.");
      return;
    }
    onConfirm(renouvellementVersEnvoi(dateRappel), consentement);
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,47,0.55)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onCancel}>
      <form onSubmit={handleSubmit} onClick={e => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 400, boxShadow: "0 12px 40px rgba(0,0,0,0.25)" }}>
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>🔄 Réactiver ce rappel ?</div>
        <div style={{ fontSize: 12.5, color: "#64748b", marginBottom: 16 }}>
          Reprend le suivi de <strong>{rappel.patient_prenom} {rappel.patient_nom}</strong> sans recréer un rappel — mêmes coordonnées, nouveau cycle.
        </div>

        <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 4 }}>Prochaine date de renouvellement</label>
        <input type="date" value={dateRappel} min={todayDateInputValue()} onChange={e => setDateRappel(e.target.value)}
          style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", marginBottom: 4, fontFamily: "inherit", fontSize: 14, boxSizing: "border-box" }} />
        <div style={{ fontSize: 11.5, color: "#94a3b8", marginBottom: 16 }}>Le SMS part 7 jours avant cette date — pré-remplie à J+28, modifiable si besoin.</div>

        <label style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 16, cursor: "pointer" }}>
          <input type="checkbox" checked={consentement} onChange={e => setConsentement(e.target.checked)} style={{ marginTop: 3 }} />
          <span style={{ fontSize: 12.5, color: "#475569", lineHeight: 1.4 }}>Le patient consent toujours à être recontacté au sujet du renouvellement de son ordonnance.</span>
        </label>

        {(error || serverError) && <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 12 }}>{error || serverError}</div>}

        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={onCancel} disabled={submitting}
            style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1.5px solid #e2e8f0", background: "#fff", color: "#475569", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
            Annuler
          </button>
          <button type="submit" disabled={submitting}
            style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: "#1a3a6e", color: "#fff", fontWeight: 700, fontSize: 14, cursor: submitting ? "default" : "pointer", fontFamily: "inherit", opacity: submitting ? 0.7 : 1 }}>
            {submitting ? "Réactivation…" : "Réactiver"}
          </button>
        </div>
      </form>
    </div>
  );
}
