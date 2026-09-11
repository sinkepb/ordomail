// Rappels de renouvellement d'ordonnance (04/09/2026) — voir
// supabase/migrations/20260904_rappels_ordonnance.sql pour le cycle de statut.
// Découpage autonome (props + état local), même convention que OffresSection.jsx.
import { useState, useEffect } from "react";
import { fetchRappels, fetchRappelJournal, fetchRappelsStats, createRappel, traiterRappel, terminerRappel, reactiverRappel, updateRappel, envoyerTestRappel, subscribeToRappels } from "../supabase.js";

const STATUT_INFO = {
  en_attente: { label: "En attente", bg: "#eef2ff", fg: "#4338ca" },
  sms_envoye: { label: "SMS envoyé", bg: "#eff6ff", fg: "#1d4ed8" },
  a_traiter:  { label: "À traiter",  bg: "#fef2f2", fg: "#dc2626" },
  termine:    { label: "Terminé",    bg: "#f0fdf4", fg: "#15803d" },
};

const CHOIX_LABEL = {
  tout_renouveler: "✅ Tout renouveler",
  rien: "🚫 Ne rien prendre",
  partiel: "🔶 Renouvellement partiel",
};

// Créneau de retrait choisi par le patient à la confirmation (08/09/2026) —
// voir RappelChoixPage.jsx et la migration 20260908_rappels_creneau_retrait.sql.
const CRENEAU_LABEL = {
  ce_matin: "🌅 Ce matin",
  cet_apres_midi: "☀️ Cet après-midi",
  demain_matin: "🌤️ Demain matin",
  demain_apres_midi: "🌇 Demain après-midi",
};

// Historique détaillé d'un rappel (07/09/2026) — un événement par ligne de
// rappels_evenements (voir secure-data:rappels_journal). meta varie selon le
// type : {canal, mocked, to} pour sms_envoye, {choix} pour reponse_patient,
// {error} pour sms_echec.
const JOURNAL_INFO = {
  cree:            { icon: "🆕", label: "Rappel créé" },
  sms_envoye:      { icon: "📱", label: "SMS envoyé" },
  sms_echec:       { icon: "⚠️", label: "Échec d'envoi" },
  reponse_patient: { icon: "💬", label: "Patient a répondu" },
  traite:          { icon: "✅", label: "Rappel validé — nouveau cycle lancé" },
  termine:         { icon: "🔚", label: "Rappel terminé" },
  reactive:        { icon: "🔄", label: "Rappel réactivé" },
};
function journalLigne(evt) {
  const info = JOURNAL_INFO[evt.type] || { icon: "•", label: evt.type };
  if (evt.type === "sms_envoye" && evt.meta?.canal === "email_test") {
    return { ...info, icon: "✉️", label: `Email envoyé (test${evt.meta?.to ? " → " + evt.meta.to : ""})` };
  }
  if (evt.type === "reponse_patient" && evt.meta?.choix) {
    return { ...info, label: `Patient a répondu : ${CHOIX_LABEL[evt.meta.choix] || evt.meta.choix}` };
  }
  if (evt.type === "sms_echec" && evt.meta?.error) {
    return { ...info, label: `Échec d'envoi — ${evt.meta.error}` };
  }
  return info;
}

const FILTRES = [
  ["tous", "Tous"],
  ["a_traiter", "À traiter"],
  ["en_attente", "En attente"],
  ["termine", "Terminés"],
];

function normalizeTel(v) {
  return (v || "").replace(/[\s.-]/g, "");
}
function telValide(v) {
  return /^(0|\+33)[1-9]\d{8}$/.test(normalizeTel(v));
}
// Format YYYY-MM-DD attendu par <input type="date"> — J+21 par défaut
// (04/09/2026), modifiable ensuite par le pharmacien.
function toDateInputValue(date) {
  return date.toISOString().slice(0, 10);
}
function defaultDateRappel() {
  const d = new Date();
  d.setDate(d.getDate() + 21);
  return toDateInputValue(d);
}
function todayDateInputValue() {
  return toDateInputValue(new Date());
}

// Exporté (04/09/2026) — réutilisé depuis Dashboard.jsx pour créer un rappel
// directement depuis une carte d'ordonnance (nom/prénom pré-remplis à partir
// du patient de l'ordonnance), pas seulement depuis l'onglet Rappels lui-même.
// editingRappel (04/09/2026) : passer le rappel existant bascule le formulaire
// en mode édition (nom/prénom/téléphone/commentaire toujours modifiables ;
// la date de rappel seulement si le cycle est encore "en_attente" — voir
// secure-data:rappels_update, même contrainte appliquée côté serveur). Le
// consentement n'est PAS ré-éditable ici : c'est une donnée recueillie une
// fois à la création, pas un champ de formulaire ordinaire.
function RappelForm({ onCancel, onCreated, creating, setCreating, initialNom = "", initialPrenom = "", editingRappel = null }) {
  const isEdit = !!editingRappel;
  const [nom, setNom] = useState(editingRappel?.patient_nom || initialNom);
  const [prenom, setPrenom] = useState(editingRappel?.patient_prenom || initialPrenom);
  const [telephone, setTelephone] = useState(editingRappel?.patient_telephone || "");
  const [dateRappel, setDateRappel] = useState(() => editingRappel?.date_prochaine_relance
    ? toDateInputValue(new Date(editingRappel.date_prochaine_relance))
    : defaultDateRappel());
  const [commentaire, setCommentaire] = useState(editingRappel?.commentaire || "");
  const [consentement, setConsentement] = useState(false);
  const [error, setError] = useState("");
  const canEditDate = !isEdit || editingRappel.statut === "en_attente";

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
      setError("La date de rappel ne peut pas être dans le passé.");
      return;
    }
    if (!isEdit && !consentement) {
      setError("Le patient doit avoir consenti à être recontacté par SMS.");
      return;
    }
    setCreating(true);
    try {
      const payload = { nom: nom.trim(), prenom: prenom.trim(), telephone: normalizeTel(telephone), commentaire: commentaire.trim() };
      if (canEditDate) payload.dateRappel = dateRappel;
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
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 16 }}>{isEdit ? "✏️ Modifier le rappel" : "🔔 Nouveau rappel de renouvellement"}</div>

        <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 4 }}>Nom du patient</label>
        <input value={nom} onChange={e => setNom(e.target.value)} placeholder="Dupont"
          style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", marginBottom: 12, fontFamily: "inherit", fontSize: 14, boxSizing: "border-box" }} />

        <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 4 }}>Prénom du patient</label>
        <input value={prenom} onChange={e => setPrenom(e.target.value)} placeholder="Jean"
          style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", marginBottom: 12, fontFamily: "inherit", fontSize: 14, boxSizing: "border-box" }} />

        <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 4 }}>Numéro de téléphone</label>
        <input value={telephone} onChange={e => setTelephone(e.target.value)} placeholder="06 12 34 56 78"
          style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", marginBottom: 12, fontFamily: "inherit", fontSize: 14, boxSizing: "border-box" }} />

        {canEditDate ? (
          <>
            <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 4 }}>Date de rappel</label>
            <input type="date" value={dateRappel} min={todayDateInputValue()} onChange={e => setDateRappel(e.target.value)}
              style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", marginBottom: 4, fontFamily: "inherit", fontSize: 14, boxSizing: "border-box" }} />
            <div style={{ fontSize: 11.5, color: "#94a3b8", marginBottom: 12 }}>{isEdit ? "Modifiable tant que le rappel n'a pas été envoyé." : "Pré-remplie à J+21 (renouvellement standard) — modifiable si besoin."}</div>
          </>
        ) : (
          <div style={{ fontSize: 11.5, color: "#94a3b8", marginBottom: 12, fontStyle: "italic" }}>Date de rappel non modifiable : ce cycle est déjà en cours.</div>
        )}

        <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 4 }}>Commentaire (optionnel)</label>
        <textarea value={commentaire} onChange={e => setCommentaire(e.target.value)} rows={2} placeholder="Ex : traitement chronique, renouvellement tous les 3 mois"
          style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", marginBottom: 12, fontFamily: "inherit", fontSize: 14, boxSizing: "border-box", resize: "vertical" }} />

        {!isEdit && (
          <label style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 16, cursor: "pointer" }}>
            <input type="checkbox" checked={consentement} onChange={e => setConsentement(e.target.checked)} style={{ marginTop: 3 }} />
            <span style={{ fontSize: 12.5, color: "#475569", lineHeight: 1.4 }}>Le patient a été informé et consent à être recontacté par SMS au sujet du renouvellement de son ordonnance.</span>
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

// Confirmation avant envoi manuel du SMS (06/09/2026) — envoyait auparavant
// le lien par email à une adresse de test tant que le SMS réel n'était pas
// branché (voir _shared/sms.ts) ; envoie désormais un vrai SMS, au tarif
// réel, directement au patient. Le canal email de secours (bouton retiré une
// fois le sender SMS OVH validé) reste géré côté serveur (rappels_envoyer_test)
// mais n'est plus accessible depuis cette interface.
function EnvoyerTestModal({ rappel, onCancel, onSend, sending, error }) {
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

// Prochaine date de rappel par défaut selon le choix du patient (04/09/2026)
// — J+21 pour un renouvellement (total ou partiel), ou un écart croissant
// pour "ne rien prendre" (numéro de cycle ACTUEL, avant incrémentation, ×31
// jours + 21) : un patient qui décline plusieurs fois de suite n'a pas
// besoin d'être rappelé aussi souvent. Même formule que côté serveur
// (secure-data:rappels_traiter) — dupliquée ici pour pré-remplir le champ,
// le serveur reste la source de vérité qui valide la date finale envoyée.
function defaultDateForChoix(rappel) {
  const d = new Date();
  const jours = rappel.choix_patient === "rien" ? rappel.cycle_numero * 31 + 21 : 21;
  d.setDate(d.getDate() + jours);
  return toDateInputValue(d);
}

// Popup de confirmation à la validation d'un rappel "à traiter" (04/09/2026)
// — le contenu dépend du choix du patient : une confirmation de livraison
// est exigée pour un renouvellement (total ou partiel, formulée différemment
// selon le cas — un renouvellement partiel suppose d'avoir déjà appelé le
// patient pour préciser sa demande), mais pas pour "ne rien prendre" où
// seule la prochaine date compte.
function ValiderModal({ rappel, onCancel, onConfirm, submitting }) {
  const [dateRappel, setDateRappel] = useState(() => defaultDateForChoix(rappel));
  const [livre, setLivre] = useState(false);
  const [error, setError] = useState("");
  const requiresLivraison = rappel.choix_patient === "tout_renouveler" || rappel.choix_patient === "partiel";

  function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!dateRappel || dateRappel < todayDateInputValue()) {
      setError("La date de rappel ne peut pas être dans le passé.");
      return;
    }
    if (requiresLivraison && !livre) {
      setError("Confirmez que le médicament a bien été livré avant de valider.");
      return;
    }
    onConfirm(dateRappel);
  }

  const titre = rappel.choix_patient === "tout_renouveler" ? "✅ Confirmer le renouvellement"
    : rappel.choix_patient === "partiel" ? "🔶 Confirmer le renouvellement partiel"
    : "🚫 Confirmer";
  const consigne = rappel.choix_patient === "tout_renouveler"
    ? "Le médicament a bien été livré au patient."
    : rappel.choix_patient === "partiel"
    ? "Après avoir appelé le patient pour préciser sa demande, le médicament a bien été livré."
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

        <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 4 }}>Prochaine date de rappel</label>
        <input type="date" value={dateRappel} min={todayDateInputValue()} onChange={e => setDateRappel(e.target.value)}
          style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", marginBottom: 4, fontFamily: "inherit", fontSize: 14, boxSizing: "border-box" }} />
        <div style={{ fontSize: 11.5, color: "#94a3b8", marginBottom: 16 }}>
          {rappel.choix_patient === "rien" ? "Espacée automatiquement (le patient a décliné) — modifiable si besoin." : "Pré-remplie à J+21 — modifiable si besoin."}
        </div>

        {error && <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 12 }}>{error}</div>}

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

// Confirmation avant fin de traitement définitive (04/09/2026) — irréversible
// (plus aucune relance), une confirmation explicite évite un clic accidentel.
function TerminerConfirmModal({ rappel, onCancel, onConfirm, submitting }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,47,0.55)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onCancel}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 380, boxShadow: "0 12px 40px rgba(0,0,0,0.25)" }}>
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 8 }}>⚠️ Terminer ce rappel ?</div>
        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 20, lineHeight: 1.5 }}>
          Le suivi de <strong>{rappel.patient_prenom} {rappel.patient_nom}</strong> s'arrêtera définitivement — aucune nouvelle relance ne sera envoyée.
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onCancel} disabled={submitting}
            style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1.5px solid #e2e8f0", background: "#fff", color: "#475569", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
            Annuler
          </button>
          <button onClick={onConfirm} disabled={submitting}
            style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: "#dc2626", color: "#fff", fontWeight: 700, fontSize: 14, cursor: submitting ? "default" : "pointer", fontFamily: "inherit", opacity: submitting ? 0.7 : 1 }}>
            {submitting ? "…" : "Confirmer la fin"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Réactivation d'un rappel terminé (07/09/2026) — repart sur le même
// patient (nom/téléphone/consentement déjà recueillis) plutôt que d'obliger
// à recréer un rappel depuis zéro. Même choix de date par défaut que la
// validation (J+21).
function ReactiverModal({ rappel, onCancel, onConfirm, submitting }) {
  const [dateRappel, setDateRappel] = useState(defaultDateRappel);
  const [error, setError] = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!dateRappel || dateRappel < todayDateInputValue()) {
      setError("La date de rappel ne peut pas être dans le passé.");
      return;
    }
    onConfirm(dateRappel);
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,47,0.55)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onCancel}>
      <form onSubmit={handleSubmit} onClick={e => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 400, boxShadow: "0 12px 40px rgba(0,0,0,0.25)" }}>
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>🔄 Réactiver ce rappel ?</div>
        <div style={{ fontSize: 12.5, color: "#64748b", marginBottom: 16 }}>
          Reprend le suivi de <strong>{rappel.patient_prenom} {rappel.patient_nom}</strong> sans recréer un rappel — mêmes coordonnées, nouveau cycle.
        </div>

        <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 4 }}>Prochaine date de rappel</label>
        <input type="date" value={dateRappel} min={todayDateInputValue()} onChange={e => setDateRappel(e.target.value)}
          style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", marginBottom: 4, fontFamily: "inherit", fontSize: 14, boxSizing: "border-box" }} />
        <div style={{ fontSize: 11.5, color: "#94a3b8", marginBottom: 16 }}>Pré-remplie à J+21 — modifiable si besoin.</div>

        {error && <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 12 }}>{error}</div>}

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

function RappelsSection({ pharmacie, onCountATraiter }) {
  const [rappels, setRappels] = useState([]);
  const [loading, setLoading] = useState(true);
  // Filtre par défaut décidé une fois les rappels chargés (voir l'effet de
  // fetch ci-dessous) : "à traiter" s'il y en a — c'est ce qui demande une
  // action du pharmacien, ça ne doit pas être noyé derrière "Tous" — sinon
  // "en attente" plutôt qu'un onglet vide (06/09/2026, retour direct).
  const [filtre, setFiltre] = useState("a_traiter");
  const [showForm, setShowForm] = useState(false);
  const [editingRappel, setEditingRappel] = useState(null);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [sendModalRappel, setSendModalRappel] = useState(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [validatingRappel, setValidatingRappel] = useState(null);
  const [terminatingRappel, setTerminatingRappel] = useState(null);
  const [reactivatingRappel, setReactivatingRappel] = useState(null);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("recent"); // "recent" | "alpha" | "date_rappel"
  const [journalOpenId, setJournalOpenId] = useState(null);
  const [journal, setJournal] = useState([]);
  const [journalLoading, setJournalLoading] = useState(false);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (!pharmacie?.id) return;
    setLoading(true);
    fetchRappels(pharmacie.id).then(data => {
      const list = data || [];
      setRappels(list);
      setFiltre(list.some(r => r.statut === "a_traiter") ? "a_traiter" : "en_attente");
      setLoading(false);
    });
    // Statistiques d'efficacité (08/09/2026) — chargées une fois au montage,
    // pas de temps réel ici (contrairement à la liste) : ce sont des agrégats
    // sur 90 jours, une fraîcheur à la minute près n'apporte rien.
    fetchRappelsStats().then(setStats);
  }, [pharmacie?.id]);

  // Temps réel (04/09/2026, retour direct) — un patient répond depuis sa
  // propre session (resolve-rappel), jamais celle du pharmacien : sans ça,
  // le passage à "à traiter" n'apparaissait qu'après un rechargement manuel
  // de cet onglet. Fusionne l'événement dans la liste locale plutôt que de
  // tout recharger (même schéma que subscribeToOffres/OffresSection.jsx).
  useEffect(() => {
    if (!pharmacie?.id) return;
    return subscribeToRappels(pharmacie.id, ({ eventType, new: row, old }) => {
      setRappels(prev => {
        if (eventType === "INSERT") return prev.some(r => r.id === row.id) ? prev : [row, ...prev];
        if (eventType === "UPDATE") return prev.map(r => r.id === row.id ? { ...r, ...row } : r);
        if (eventType === "DELETE") return prev.filter(r => r.id !== old.id);
        return prev;
      });
    });
  }, [pharmacie?.id]);

  useEffect(() => {
    onCountATraiter?.(rappels.filter(r => r.statut === "a_traiter").length);
  }, [rappels, onCountATraiter]);

  async function handleCreated(payload) {
    const rappel = await createRappel(pharmacie.id, payload);
    if (rappel) setRappels(prev => [rappel, ...prev]);
    setShowForm(false);
  }

  async function handleUpdated(payload) {
    await updateRappel(editingRappel.id, payload);
    setRappels(prev => prev.map(r => r.id === editingRappel.id ? {
      ...r,
      patient_nom: payload.nom, patient_prenom: payload.prenom, patient_telephone: normalizeTel(payload.telephone),
      commentaire: payload.commentaire || null,
      ...(payload.dateRappel ? { date_prochaine_relance: new Date(payload.dateRappel).toISOString() } : {}),
    } : r));
    setEditingRappel(null);
  }

  async function handleEnvoyer() {
    setSending(true); setSendError("");
    try {
      await envoyerTestRappel(sendModalRappel.id);
      setRappels(prev => prev.map(r => r.id === sendModalRappel.id ? { ...r, statut: "sms_envoye" } : r));
      setSendModalRappel(null);
    } catch (e) {
      setSendError(e.message || "Échec de l'envoi.");
    }
    setSending(false);
  }

  async function handleValiderConfirm(dateRappel) {
    const rappel = validatingRappel;
    setBusyId(rappel.id);
    try {
      await traiterRappel(rappel.id, dateRappel);
      setRappels(prev => prev.map(r => r.id === rappel.id
        ? { ...r, statut: "en_attente", choix_patient: null, cycle_numero: (r.cycle_numero || 1) + 1, date_prochaine_relance: new Date(dateRappel).toISOString() }
        : r));
      setValidatingRappel(null);
    } catch (e) {
      console.error("[handleValiderConfirm]", e.message);
    }
    setBusyId(null);
  }

  async function handleTerminerConfirm() {
    const rappel = terminatingRappel;
    setBusyId(rappel.id);
    try {
      await terminerRappel(rappel.id);
      setRappels(prev => prev.map(r => r.id === rappel.id ? { ...r, statut: "termine" } : r));
      setTerminatingRappel(null);
    } catch (e) {
      console.error("[handleTerminerConfirm]", e.message);
    }
    setBusyId(null);
  }

  async function handleReactiverConfirm(dateRappel) {
    const rappel = reactivatingRappel;
    setBusyId(rappel.id);
    try {
      await reactiverRappel(rappel.id, dateRappel);
      setRappels(prev => prev.map(r => r.id === rappel.id
        ? { ...r, statut: "en_attente", choix_patient: null, cycle_numero: (r.cycle_numero || 1) + 1, date_prochaine_relance: new Date(dateRappel).toISOString() }
        : r));
      setReactivatingRappel(null);
    } catch (e) {
      console.error("[handleReactiverConfirm]", e.message);
    }
    setBusyId(null);
  }

  async function toggleJournal(rappelId) {
    if (journalOpenId === rappelId) { setJournalOpenId(null); return; }
    setJournalOpenId(rappelId);
    setJournalLoading(true);
    const data = await fetchRappelJournal(rappelId);
    setJournal(data || []);
    setJournalLoading(false);
  }

  // "En attente" inclut aussi "sms_envoye" (04/09/2026, retour direct) — le
  // rappel disparaissait silencieusement de cet onglet dès qu'un SMS (ou un
  // envoi de test) partait, alors que rien ne distingue les deux statuts
  // pour le pharmacien (mêmes actions disponibles sur la ligne : Modifier,
  // Envoyer, Fin de traitement) — seul le badge de statut affiché diffère.
  const parStatut = filtre === "tous" ? rappels
    : filtre === "en_attente" ? rappels.filter(r => r.statut === "en_attente" || r.statut === "sms_envoye")
    : rappels.filter(r => r.statut === filtre);
  // Recherche par nom (07/09/2026) — nom ET prénom, insensible à la casse et
  // aux accents (normalize) pour retrouver "Dupont" en tapant "dupond" est
  // hors scope ici, mais "depont"/"Depont" doit matcher "Dépont".
  const searchNorm = search.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const parRecherche = !searchNorm ? parStatut : parStatut.filter(r => {
    const nomComplet = `${r.patient_prenom || ""} ${r.patient_nom || ""}`.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    return nomComplet.includes(searchNorm);
  });
  const filtered = [...parRecherche].sort((a, b) => {
    if (sortBy === "alpha") {
      return `${a.patient_nom || ""}${a.patient_prenom || ""}`.localeCompare(`${b.patient_nom || ""}${b.patient_prenom || ""}`, "fr");
    }
    if (sortBy === "date_rappel") {
      // Sans date de rappel (ex. rappels terminés) : renvoyés en dernier.
      if (!a.date_prochaine_relance) return !b.date_prochaine_relance ? 0 : 1;
      if (!b.date_prochaine_relance) return -1;
      return new Date(a.date_prochaine_relance) - new Date(b.date_prochaine_relance);
    }
    return new Date(b.created_at) - new Date(a.created_at); // "recent" (défaut historique)
  });
  const countATraiter = rappels.filter(r => r.statut === "a_traiter").length;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div style={{ fontWeight: 800, fontSize: 15 }}>
          🔔 Rappels de renouvellement
          {countATraiter > 0 && (
            <span style={{ marginLeft: 8, background: "#dc2626", color: "#fff", borderRadius: 999, padding: "2px 9px", fontSize: 12, fontWeight: 800 }}>{countATraiter} à traiter</span>
          )}
        </div>
        <button onClick={() => setShowForm(true)}
          style={{ padding: "9px 16px", borderRadius: 10, border: "none", background: "#1a3a6e", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
          + Nouveau rappel
        </button>
      </div>

      {/* Statistiques d'efficacité (08/09/2026) — silencieux si absent (démo,
          échec réseau) plutôt qu'un bloc d'erreur pour un simple indicateur. */}
      {stats && stats.smsEnvoyes90j > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 8, marginBottom: 16 }}>
          <div style={{ background: "#f0fdf4", border: "1.5px solid #bbf7d0", borderRadius: 10, padding: "10px 14px" }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: "#15803d" }}>{stats.tauxRenouvellement}%</div>
            <div style={{ fontSize: 11, color: "#64748b" }}>Renouvellement réel · 90j</div>
          </div>
          <div style={{ background: "#eff6ff", border: "1.5px solid #bfdbfe", borderRadius: 10, padding: "10px 14px" }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: "#1d4ed8" }}>{stats.tauxReponse}%</div>
            <div style={{ fontSize: 11, color: "#64748b" }}>Taux de réponse · 90j</div>
          </div>
          <div style={{ background: "#faf5ff", border: "1.5px solid #e9d5ff", borderRadius: 10, padding: "10px 14px" }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: "#7e22ce" }}>{stats.delaiReponseMoyenHeures != null ? `${stats.delaiReponseMoyenHeures}h` : "—"}</div>
            <div style={{ fontSize: 11, color: "#64748b" }}>Délai de réponse moyen</div>
          </div>
          <div style={{ background: "#f8fafc", border: "1.5px solid #e2e8f0", borderRadius: 10, padding: "10px 14px" }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: "#334155" }}>{stats.rappelsActifs}</div>
            <div style={{ fontSize: 11, color: "#64748b" }}>Rappels actifs</div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {FILTRES.map(([k, label]) => (
          <button key={k} onClick={() => setFiltre(k)}
            style={{ padding: "6px 12px", borderRadius: 8, border: `1.5px solid ${filtre === k ? "#1a3a6e" : "#e2e8f0"}`, background: filtre === k ? "#1a3a6e" : "#fff", color: filtre === k ? "#fff" : "#64748b", fontWeight: filtre === k ? 700 : 500, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
            {label}
          </button>
        ))}
      </div>

      {/* Recherche par nom + tri (07/09/2026) */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Rechercher un patient…"
          style={{ flex: "1 1 220px", padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
        <select value={sortBy} onChange={e => setSortBy(e.target.value)}
          style={{ padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: 13, fontFamily: "inherit", background: "#fff", color: "#374151", cursor: "pointer" }}>
          <option value="recent">Plus récents d'abord</option>
          <option value="alpha">Ordre alphabétique</option>
          <option value="date_rappel">Date de rappel</option>
        </select>
      </div>

      {loading && <div style={{ color: "#94a3b8", fontSize: 13 }}>Chargement…</div>}
      {!loading && filtered.length === 0 && (
        <div style={{ color: "#94a3b8", fontSize: 13, background: "#fff", borderRadius: 12, padding: 24, textAlign: "center" }}>Aucun rappel dans cette catégorie.</div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {filtered.map(r => {
          const info = STATUT_INFO[r.statut] || STATUT_INFO.en_attente;
          const busy = busyId === r.id;
          return (
            <div key={r.id} style={{ background: "#fff", borderRadius: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", overflow: "hidden" }}>
            <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{r.patient_prenom} {r.patient_nom}</div>
                <div style={{ fontSize: 12, color: "#64748b" }}>{r.patient_telephone} · cycle n°{r.cycle_numero}</div>
                {r.statut === "en_attente" && r.date_prochaine_relance && (
                  <div style={{ fontSize: 12, color: "#4338ca", marginTop: 2 }}>
                    Rappel prévu le {new Date(r.date_prochaine_relance).toLocaleDateString("fr-FR")}
                  </div>
                )}
                {r.commentaire && <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>{r.commentaire}</div>}
                {r.statut === "a_traiter" && r.choix_patient && (
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: "#dc2626", marginTop: 4 }}>{CHOIX_LABEL[r.choix_patient] || r.choix_patient}</div>
                )}
                {r.statut === "a_traiter" && r.creneau_retrait && (
                  <div style={{ fontSize: 12, color: "#92400e", marginTop: 2 }}>🕐 Retrait souhaité : {CRENEAU_LABEL[r.creneau_retrait] || r.creneau_retrait}</div>
                )}
              </div>
              <span style={{ background: info.bg, color: info.fg, borderRadius: 999, padding: "4px 12px", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{info.label}</span>
              <button onClick={() => setEditingRappel(r)} disabled={busy}
                style={{ padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", background: "#fff", color: "#475569", fontWeight: 700, fontSize: 12.5, cursor: busy ? "default" : "pointer", fontFamily: "inherit", opacity: busy ? 0.6 : 1 }}>
                ✏️ Modifier
              </button>
              {/* Envoi manuel du SMS (06/09/2026) — déclenche l'envoi réel
                  sans attendre le prochain passage du cron. Masqué une fois
                  le patient déjà répondu ou le rappel terminé (voir
                  secure-data:rappels_envoyer_test, même contrainte). */}
              {(r.statut === "en_attente" || r.statut === "sms_envoye") && (
                <button onClick={() => { setSendError(""); setSendModalRappel(r); }} disabled={busy}
                  style={{ padding: "8px 12px", borderRadius: 8, border: "1.5px solid #c7d2fe", background: "#f0f4ff", color: "#4338ca", fontWeight: 700, fontSize: 12.5, cursor: busy ? "default" : "pointer", fontFamily: "inherit", opacity: busy ? 0.6 : 1 }}>
                  📱 Envoyer le SMS
                </button>
              )}
              {r.statut === "a_traiter" && (
                <button onClick={() => setValidatingRappel(r)} disabled={busy}
                  style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "#15803d", color: "#fff", fontWeight: 700, fontSize: 12.5, cursor: busy ? "default" : "pointer", fontFamily: "inherit", opacity: busy ? 0.6 : 1 }}>
                  {busy ? "…" : "✅ Valider"}
                </button>
              )}
              {r.statut !== "termine" && (
                <button onClick={() => setTerminatingRappel(r)} disabled={busy}
                  style={{ padding: "8px 14px", borderRadius: 8, border: "1.5px solid #e2e8f0", background: "#fff", color: "#64748b", fontWeight: 700, fontSize: 12.5, cursor: busy ? "default" : "pointer", fontFamily: "inherit", opacity: busy ? 0.6 : 1 }}>
                  Fin de traitement
                </button>
              )}
              {/* Réactivation (07/09/2026) — reprendre un rappel terminé sans
                  en recréer un nouveau depuis zéro. */}
              {r.statut === "termine" && (
                <button onClick={() => setReactivatingRappel(r)} disabled={busy}
                  style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "#1a3a6e", color: "#fff", fontWeight: 700, fontSize: 12.5, cursor: busy ? "default" : "pointer", fontFamily: "inherit", opacity: busy ? 0.6 : 1 }}>
                  🔄 Réactiver
                </button>
              )}
              {/* Historique détaillé (07/09/2026) — journal complet des
                  événements du rappel (voir secure-data:rappels_journal),
                  utile en cas de litige ou de question du patient. */}
              <button onClick={() => toggleJournal(r.id)}
                style={{ padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", background: journalOpenId === r.id ? "#f8fafc" : "#fff", color: "#64748b", fontWeight: 700, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}>
                🕐 Historique{journalOpenId === r.id ? " ▲" : " ▼"}
              </button>
            </div>
            {journalOpenId === r.id && (
              <div style={{ borderTop: "1px solid #f1f5f9", padding: "12px 16px", background: "#fafbfc" }}>
                {journalLoading && <div style={{ fontSize: 12.5, color: "#94a3b8" }}>Chargement…</div>}
                {!journalLoading && journal.length === 0 && (
                  <div style={{ fontSize: 12.5, color: "#94a3b8" }}>Aucun événement enregistré.</div>
                )}
                {!journalLoading && journal.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {journal.map((evt, i) => {
                      const ligne = journalLigne(evt);
                      return (
                        <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 12.5 }}>
                          <span style={{ flexShrink: 0 }}>{ligne.icon}</span>
                          <span style={{ flexShrink: 0, color: "#94a3b8", fontVariantNumeric: "tabular-nums", minWidth: 130 }}>
                            {new Date(evt.created_at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </span>
                          <span style={{ color: "#334155" }}>{ligne.label}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            </div>
          );
        })}
      </div>

      {showForm && <RappelForm onCancel={() => setShowForm(false)} onCreated={handleCreated} creating={creating} setCreating={setCreating} />}
      {editingRappel && <RappelForm editingRappel={editingRappel} onCancel={() => setEditingRappel(null)} onCreated={handleUpdated} creating={creating} setCreating={setCreating} />}
      {sendModalRappel && <EnvoyerTestModal rappel={sendModalRappel} onCancel={() => setSendModalRappel(null)} onSend={handleEnvoyer} sending={sending} error={sendError} />}
      {validatingRappel && <ValiderModal rappel={validatingRappel} onCancel={() => setValidatingRappel(null)} onConfirm={handleValiderConfirm} submitting={busyId === validatingRappel.id} />}
      {terminatingRappel && <TerminerConfirmModal rappel={terminatingRappel} onCancel={() => setTerminatingRappel(null)} onConfirm={handleTerminerConfirm} submitting={busyId === terminatingRappel.id} />}
      {reactivatingRappel && <ReactiverModal rappel={reactivatingRappel} onCancel={() => setReactivatingRappel(null)} onConfirm={handleReactiverConfirm} submitting={busyId === reactivatingRappel.id} />}
    </div>
  );
}

export { RappelsSection, RappelForm };
