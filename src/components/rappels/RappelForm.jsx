// Formulaire de création/édition d'un rappel — extrait de RappelsSection.jsx
// (02/10/2026, découpage).
// Exporté — réutilisé depuis Dashboard.jsx pour créer un rappel directement
// depuis une carte d'ordonnance (nom/prénom pré-remplis à partir du patient
// de l'ordonnance), pas seulement depuis l'onglet Rappels lui-même.
// editingRappel (04/09/2026) : passer le rappel existant bascule le formulaire
// en mode édition (nom/prénom/téléphone/commentaire toujours modifiables ;
// la date de rappel seulement si le cycle est encore "en_attente" — voir
// secure-data:rappels_update, même contrainte appliquée côté serveur). Le
// consentement n'est PAS ré-éditable ici : c'est une donnée recueillie une
// fois à la création, pas un champ de formulaire ordinaire.
import { useState } from "react";
import { SPECIALITES } from "./rappelsConstants.js";
import { normalizeTel, telValide, estNumeroFixe, todayDateInputValue, defaultDateRenouvellement, renouvellementVersEnvoi, envoiVersRenouvellement } from "./rappelsDateUtils.js";

export function RappelForm({ onCancel, onCreated, creating, setCreating, initialNom = "", initialPrenom = "", initialMedecin = "", editingRappel = null }) {
  const isEdit = !!editingRappel;
  const [nom, setNom] = useState(editingRappel?.patient_nom || initialNom);
  const [prenom, setPrenom] = useState(editingRappel?.patient_prenom || initialPrenom);
  const [telephone, setTelephone] = useState(editingRappel?.patient_telephone || "");
  const [dateRappel, setDateRappel] = useState(() => editingRappel?.date_prochaine_relance
    ? envoiVersRenouvellement(editingRappel.date_prochaine_relance)
    : defaultDateRenouvellement());
  const [commentaire, setCommentaire] = useState(editingRappel?.commentaire || "");
  // Préremplissage depuis l'OCR de l'ordonnance (17/09/2026, retour titulaire)
  // — depuis une carte ordonnance, initialMedecin porte ordo.extracted.medecin
  // (voir Dashboard.jsx, setRappelDraft) : gagne du temps quand l'OCR l'a
  // déjà détecté, reste modifiable/effaçable si faux ou absent.
  const [medecinPrescripteur, setMedecinPrescripteur] = useState(editingRappel?.medecin_prescripteur || initialMedecin || "");
  // "Autre" en repli texte libre (15/09/2026) — si la spécialité existante
  // n'est pas dans la liste fermée (donnée saisie avant l'ajout de cette
  // liste, ou via une future valeur non prévue), elle reste éditable au lieu
  // d'être silencieusement perdue.
  const specialiteExistanteConnue = editingRappel?.specialite && SPECIALITES.includes(editingRappel.specialite);
  const [specialiteChoix, setSpecialiteChoix] = useState(() => {
    if (!editingRappel?.specialite) return "";
    return specialiteExistanteConnue ? editingRappel.specialite : "__autre__";
  });
  const [specialiteAutre, setSpecialiteAutre] = useState(() => specialiteExistanteConnue ? "" : (editingRappel?.specialite || ""));
  const [consentement, setConsentement] = useState(false);
  const [error, setError] = useState("");
  const canEditDate = !isEdit || editingRappel.statut === "en_attente";
  // Mode de contact (01/10/2026, retour titulaire) — plus de choix manuel à
  // la création : entièrement déduit du préfixe du numéro saisi (numéro fixe
  // = appel, mobile = SMS), même règle que secure-data:rappels_create qui
  // reste la seule source de vérité enregistrée en base.
  const modeContact = estNumeroFixe(telephone) ? "appel" : "sms";

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!nom.trim() || !prenom.trim() || !telephone.trim()) {
      setError("Nom, prénom et téléphone sont requis.");
      return;
    }
    if (!telValide(telephone)) {
      setError("Numéro de téléphone invalide (format français attendu).");
      return;
    }
    if (canEditDate && (!dateRappel || dateRappel < todayDateInputValue())) {
      setError("La date de renouvellement ne peut pas être dans le passé.");
      return;
    }
    if (!isEdit && !consentement) {
      setError("Le patient doit avoir consenti à être recontacté.");
      return;
    }
    setCreating(true);
    try {
      const specialite = specialiteChoix === "__autre__" ? specialiteAutre.trim() : specialiteChoix;
      const payload = { nom: nom.trim(), prenom: prenom.trim(), telephone: normalizeTel(telephone), commentaire: commentaire.trim(), medecinPrescripteur: medecinPrescripteur.trim(), specialite };
      if (canEditDate) payload.dateRappel = renouvellementVersEnvoi(dateRappel);
      if (!isEdit) payload.consentement = consentement;
      await onCreated(payload);
    } catch (e2) {
      setError(e2.message || (isEdit ? "Échec de la modification du rappel." : "Échec de la création du rappel."));
    }
    setCreating(false);
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,47,0.55)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onCancel}>
      <form onSubmit={handleSubmit} onClick={e => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 420, boxShadow: "0 12px 40px rgba(0,0,0,0.25)" }}>
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 16 }}>{isEdit ? "✏️ Modifier le rappel" : "🔔 Nouveau rappel"}</div>

        <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 4 }}>Nom du patient</label>
        <input value={nom} onChange={e => setNom(e.target.value)} placeholder="Dupont"
          style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", marginBottom: 12, fontFamily: "inherit", fontSize: 14, boxSizing: "border-box" }} />

        <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 4 }}>Prénom du patient</label>
        <input value={prenom} onChange={e => setPrenom(e.target.value)} placeholder="Jean"
          style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", marginBottom: 12, fontFamily: "inherit", fontSize: 14, boxSizing: "border-box" }} />

        <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 4 }}>Numéro de téléphone</label>
        <input value={telephone} onChange={e => setTelephone(e.target.value)} placeholder="06 12 34 56 78"
          style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", marginBottom: 8, fontFamily: "inherit", fontSize: 14, boxSizing: "border-box" }} />

        {modeContact === "appel" && (
          <div style={{ fontSize: 11.5, color: "#a16207", marginBottom: 12, lineHeight: 1.4 }}>
            📞 Numéro fixe détecté — à l'échéance, ce rappel passera en "À appeler" au lieu d'un SMS.
          </div>
        )}

        <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 4 }}>Spécialité / type d'ordonnance (optionnel)</label>
        <select value={specialiteChoix} onChange={e => setSpecialiteChoix(e.target.value)}
          style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", marginBottom: specialiteChoix === "__autre__" ? 8 : 4, fontFamily: "inherit", fontSize: 14, boxSizing: "border-box", background: "#fff" }}>
          <option value="">— Non précisé —</option>
          {SPECIALITES.map(s => <option key={s} value={s}>{s}</option>)}
          <option value="__autre__">Autre…</option>
        </select>
        {specialiteChoix === "__autre__" && (
          <input value={specialiteAutre} onChange={e => setSpecialiteAutre(e.target.value)} placeholder="Précisez la spécialité"
            style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", marginBottom: 4, fontFamily: "inherit", fontSize: 14, boxSizing: "border-box" }} />
        )}

        <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 4, marginTop: 12 }}>Médecin prescripteur (optionnel)</label>
        <input value={medecinPrescripteur} onChange={e => setMedecinPrescripteur(e.target.value)} placeholder="Dr Martin"
          style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", marginBottom: 4, fontFamily: "inherit", fontSize: 14, boxSizing: "border-box" }} />
        <div style={{ fontSize: 11.5, color: "#94a3b8", marginBottom: 12 }}>Les deux sont repris dans le SMS pour distinguer les traitements si le patient a plusieurs rappels actifs.</div>

        {canEditDate ? (
          <>
            <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 4 }}>Date de renouvellement</label>
            <input type="date" value={dateRappel} min={todayDateInputValue()} onChange={e => setDateRappel(e.target.value)}
              style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", marginBottom: 4, fontFamily: "inherit", fontSize: 14, boxSizing: "border-box" }} />
            <div style={{ fontSize: 11.5, color: "#94a3b8", marginBottom: 12 }}>{isEdit ? "Le SMS part 7 jours avant cette date — modifiable tant qu'il n'a pas été envoyé." : "Le SMS sera envoyé automatiquement 7 jours avant — pré-remplie à J+28, modifiable si besoin."}</div>
          </>
        ) : (
          <div style={{ fontSize: 11.5, color: "#94a3b8", marginBottom: 12, fontStyle: "italic" }}>Date de renouvellement non modifiable : ce cycle est déjà en cours.</div>
        )}

        <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 4 }}>Commentaire (optionnel)</label>
        <textarea value={commentaire} onChange={e => setCommentaire(e.target.value)} rows={2} placeholder="Ex : traitement chronique, renouvellement tous les 3 mois"
          style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", marginBottom: 12, fontFamily: "inherit", fontSize: 14, boxSizing: "border-box", resize: "vertical" }} />

        {!isEdit && (
          <label style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 16, cursor: "pointer" }}>
            <input type="checkbox" checked={consentement} onChange={e => setConsentement(e.target.checked)} style={{ marginTop: 3 }} />
            <span style={{ fontSize: 12.5, color: "#475569", lineHeight: 1.4 }}>Le patient a été informé et consent à être recontacté {modeContact === "appel" ? "par téléphone" : "par SMS"} au sujet du renouvellement de son ordonnance.</span>
          </label>
        )}

        {error && <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 12 }}>{error}</div>}

        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={onCancel} disabled={creating}
            style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1.5px solid #e2e8f0", background: "#fff", color: "#475569", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
            Annuler
          </button>
          <button type="submit" disabled={creating}
            style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: "#1a3a6e", color: "#fff", fontWeight: 700, fontSize: 14, cursor: creating ? "default" : "pointer", fontFamily: "inherit", opacity: creating ? 0.7 : 1 }}>
            {creating ? (isEdit ? "Enregistrement…" : "Création…") : (isEdit ? "Enregistrer" : "Créer le rappel")}
          </button>
        </div>
      </form>
    </div>
  );
}
