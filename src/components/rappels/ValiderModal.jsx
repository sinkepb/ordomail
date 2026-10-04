// Popup de confirmation à la validation d'un rappel "à traiter" — extrait de
// RappelsSection.jsx (02/10/2026, découpage).
// (04/09/2026) — le contenu dépend du choix du patient : une confirmation de
// livraison est exigée pour un renouvellement (total ou partiel, formulée
// différemment selon le cas — un renouvellement partiel suppose d'avoir déjà
// appelé le patient pour préciser sa demande), mais pas pour "ne rien
// prendre" où seule la prochaine date compte.
import { useState } from "react";
import { todayDateInputValue, renouvellementVersEnvoi, defaultDateForChoix } from "./rappelsDateUtils.js";

export function ValiderModal({ rappel, onCancel, onConfirm, submitting, serverError }) {
  const [dateRappel, setDateRappel] = useState(() => defaultDateForChoix(rappel));
  const [livre, setLivre] = useState(false);
  const [error, setError] = useState("");
  const requiresLivraison = rappel.choix_patient === "tout_renouveler" || rappel.choix_patient === "partiel";

  function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!dateRappel || dateRappel < todayDateInputValue()) {
      setError("La date de renouvellement ne peut pas être dans le passé.");
      return;
    }
    if (requiresLivraison && !livre) {
      setError("Confirmez que le médicament a bien été livré avant de valider.");
      return;
    }
    onConfirm(renouvellementVersEnvoi(dateRappel));
  }

  const titre = rappel.choix_patient === "tout_renouveler" ? "✅ Confirmer le renouvellement"
    : rappel.choix_patient === "partiel" ? "🔶 Confirmer le renouvellement partiel"
    : "🚫 Confirmer";
  // @fix 01/10/2026 — l'appel de clarification d'un renouvellement partiel
  // est désormais une étape obligatoire distincte avant d'arriver ici (voir
  // statut "à appeler"), plus une simple case à cocher au moment de valider :
  // même consigne que tout_renouveler, il ne reste que la livraison à confirmer.
  const consigne = (rappel.choix_patient === "tout_renouveler" || rappel.choix_patient === "partiel")
    ? "Le médicament a bien été livré au patient."
    : null;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,47,0.55)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onCancel}>
      <form onSubmit={handleSubmit} onClick={e => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 400, boxShadow: "0 12px 40px rgba(0,0,0,0.25)" }}>
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>{titre}</div>
        <div style={{ fontSize: 12.5, color: "#64748b", marginBottom: 16 }}>{rappel.patient_prenom} {rappel.patient_nom}</div>

        {consigne && (
          <label style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 16, cursor: "pointer", background: "#f8fafc", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #e2e8f0" }}>
            <input type="checkbox" checked={livre} onChange={e => setLivre(e.target.checked)} style={{ marginTop: 3 }} />
            <span style={{ fontSize: 13, color: "#334155", lineHeight: 1.4, fontWeight: 600 }}>{consigne}</span>
          </label>
        )}

        <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 4 }}>Prochaine date de renouvellement</label>
        <input type="date" value={dateRappel} min={todayDateInputValue()} onChange={e => setDateRappel(e.target.value)}
          style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", marginBottom: 4, fontFamily: "inherit", fontSize: 14, boxSizing: "border-box" }} />
        <div style={{ fontSize: 11.5, color: "#94a3b8", marginBottom: 16 }}>
          Le SMS part 7 jours avant cette date{rappel.choix_patient === "rien" ? " — espacée automatiquement (le patient a décliné), modifiable si besoin." : " — pré-remplie à J+28, modifiable si besoin."}
        </div>

        {(error || serverError) && <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 12 }}>{error || serverError}</div>}

        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={onCancel} disabled={submitting}
            style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1.5px solid #e2e8f0", background: "#fff", color: "#475569", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
            Annuler
          </button>
          <button type="submit" disabled={submitting}
            style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: "#15803d", color: "#fff", fontWeight: 700, fontSize: 14, cursor: submitting ? "default" : "pointer", fontFamily: "inherit", opacity: submitting ? 0.7 : 1 }}>
            {submitting ? "Validation…" : "Valider"}
          </button>
        </div>
      </form>
    </div>
  );
}
