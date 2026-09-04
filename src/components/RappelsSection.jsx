// Rappels de renouvellement d'ordonnance (04/09/2026) — voir
// supabase/migrations/20260904_rappels_ordonnance.sql pour le cycle de statut.
// Découpage autonome (props + état local), même convention que OffresSection.jsx.
import { useState, useEffect } from "react";
import { fetchRappels, createRappel, traiterRappel, terminerRappel, updateRappel, envoyerTestRappel } from "../supabase.js";

// Adresse de test mémorisée localement (04/09/2026) — pure commodité pour ne
// pas la retaper à chaque envoi de test ; jamais partagée, jamais envoyée
// nulle part sauf dans l'appel d'envoi lui-même que l'utilisateur déclenche.
const TEST_EMAIL_KEY = "ordomail_rappel_test_email";

const STATUT_INFO = {
  en_attente: { label: "En attente (J+21)", bg: "#eef2ff", fg: "#4338ca" },
  sms_envoye: { label: "SMS envoyé", bg: "#eff6ff", fg: "#1d4ed8" },
  a_traiter:  { label: "À traiter",  bg: "#fef2f2", fg: "#dc2626" },
  termine:    { label: "Terminé",    bg: "#f0fdf4", fg: "#15803d" },
};

const CHOIX_LABEL = {
  tout_renouveler: "✅ Tout renouveler",
  rien: "🚫 Ne rien prendre",
  partiel: "🔶 Renouvellement partiel",
};

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

// Popup minimale pour l'envoi de test (04/09/2026) — une seule adresse email,
// mémorisée localement pour ne pas la retaper à chaque test.
function EnvoyerTestModal({ rappel, onCancel, onSend, sending, error }) {
  const [email, setEmail] = useState(() => { try { return localStorage.getItem(TEST_EMAIL_KEY) || ""; } catch { return ""; } });

  function handleSubmit(e) {
    e.preventDefault();
    if (!email.trim()) return;
    try { localStorage.setItem(TEST_EMAIL_KEY, email.trim()); } catch { /* stockage indisponible, tant pis */ }
    onSend(email.trim());
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,47,0.55)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onCancel}>
      <form onSubmit={handleSubmit} onClick={e => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 380, boxShadow: "0 12px 40px rgba(0,0,0,0.25)" }}>
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 8 }}>📧 Envoyer un test</div>
        <div style={{ fontSize: 12.5, color: "#64748b", marginBottom: 16, lineHeight: 1.5 }}>
          Le SMS réel n'est pas encore branché — ce test envoie le lien du rappel de <strong>{rappel.patient_prenom}</strong> par email pour vérifier la page de réponse patient et le workflow.
        </div>
        <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 4 }}>Adresse email de test</label>
        <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="vous@exemple.fr" autoFocus
          style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", marginBottom: 12, fontFamily: "inherit", fontSize: 14, boxSizing: "border-box" }} />
        {error && <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 12 }}>{error}</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={onCancel} disabled={sending}
            style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1.5px solid #e2e8f0", background: "#fff", color: "#475569", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
            Annuler
          </button>
          <button type="submit" disabled={sending}
            style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: "#1a3a6e", color: "#fff", fontWeight: 700, fontSize: 14, cursor: sending ? "default" : "pointer", fontFamily: "inherit", opacity: sending ? 0.7 : 1 }}>
            {sending ? "Envoi…" : "Envoyer"}
          </button>
        </div>
      </form>
    </div>
  );
}

function RappelsSection({ pharmacie, onCountATraiter }) {
  const [rappels, setRappels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtre, setFiltre] = useState("tous");
  const [showForm, setShowForm] = useState(false);
  const [editingRappel, setEditingRappel] = useState(null);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [sendModalRappel, setSendModalRappel] = useState(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");

  useEffect(() => {
    if (!pharmacie?.id) return;
    setLoading(true);
    fetchRappels(pharmacie.id).then(data => { setRappels(data || []); setLoading(false); });
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

  async function handleEnvoyer(email) {
    setSending(true); setSendError("");
    try {
      await envoyerTestRappel(sendModalRappel.id, email);
      setRappels(prev => prev.map(r => r.id === sendModalRappel.id ? { ...r, statut: "sms_envoye" } : r));
      setSendModalRappel(null);
    } catch (e) {
      setSendError(e.message || "Échec de l'envoi.");
    }
    setSending(false);
  }

  async function handleValider(rappel) {
    setBusyId(rappel.id);
    try {
      await traiterRappel(rappel.id);
      setRappels(prev => prev.map(r => r.id === rappel.id
        ? { ...r, statut: "en_attente", choix_patient: null, cycle_numero: (r.cycle_numero || 1) + 1 }
        : r));
    } catch (e) {
      console.error("[handleValider]", e.message);
    }
    setBusyId(null);
  }

  async function handleTerminer(rappel) {
    setBusyId(rappel.id);
    try {
      await terminerRappel(rappel.id);
      setRappels(prev => prev.map(r => r.id === rappel.id ? { ...r, statut: "termine" } : r));
    } catch (e) {
      console.error("[handleTerminer]", e.message);
    }
    setBusyId(null);
  }

  const filtered = filtre === "tous" ? rappels : rappels.filter(r => r.statut === filtre);
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

      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {FILTRES.map(([k, label]) => (
          <button key={k} onClick={() => setFiltre(k)}
            style={{ padding: "6px 12px", borderRadius: 8, border: `1.5px solid ${filtre === k ? "#1a3a6e" : "#e2e8f0"}`, background: filtre === k ? "#1a3a6e" : "#fff", color: filtre === k ? "#fff" : "#64748b", fontWeight: filtre === k ? 700 : 500, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
            {label}
          </button>
        ))}
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
            <div key={r.id} style={{ background: "#fff", borderRadius: 12, padding: "14px 16px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
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
              </div>
              <span style={{ background: info.bg, color: info.fg, borderRadius: 999, padding: "4px 12px", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{info.label}</span>
              <button onClick={() => setEditingRappel(r)} disabled={busy}
                style={{ padding: "8px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", background: "#fff", color: "#475569", fontWeight: 700, fontSize: 12.5, cursor: busy ? "default" : "pointer", fontFamily: "inherit", opacity: busy ? 0.6 : 1 }}>
                ✏️ Modifier
              </button>
              {/* Envoi de test (04/09/2026) — en attendant le vrai prestataire SMS,
                  déclenche l'envoi du lien par email pour tester le workflow.
                  Masqué une fois le patient déjà répondu ou le rappel terminé
                  (voir secure-data:rappels_envoyer_test, même contrainte). */}
              {(r.statut === "en_attente" || r.statut === "sms_envoye") && (
                <button onClick={() => { setSendError(""); setSendModalRappel(r); }} disabled={busy}
                  style={{ padding: "8px 12px", borderRadius: 8, border: "1.5px solid #c7d2fe", background: "#f0f4ff", color: "#4338ca", fontWeight: 700, fontSize: 12.5, cursor: busy ? "default" : "pointer", fontFamily: "inherit", opacity: busy ? 0.6 : 1 }}>
                  📧 Envoyer (test)
                </button>
              )}
              {r.statut === "a_traiter" && (
                <button onClick={() => handleValider(r)} disabled={busy}
                  style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "#15803d", color: "#fff", fontWeight: 700, fontSize: 12.5, cursor: busy ? "default" : "pointer", fontFamily: "inherit", opacity: busy ? 0.6 : 1 }}>
                  {busy ? "…" : "✅ Valider"}
                </button>
              )}
              {r.statut !== "termine" && (
                <button onClick={() => handleTerminer(r)} disabled={busy}
                  style={{ padding: "8px 14px", borderRadius: 8, border: "1.5px solid #e2e8f0", background: "#fff", color: "#64748b", fontWeight: 700, fontSize: 12.5, cursor: busy ? "default" : "pointer", fontFamily: "inherit", opacity: busy ? 0.6 : 1 }}>
                  Fin de traitement
                </button>
              )}
            </div>
          );
        })}
      </div>

      {showForm && <RappelForm onCancel={() => setShowForm(false)} onCreated={handleCreated} creating={creating} setCreating={setCreating} />}
      {editingRappel && <RappelForm editingRappel={editingRappel} onCancel={() => setEditingRappel(null)} onCreated={handleUpdated} creating={creating} setCreating={setCreating} />}
      {sendModalRappel && <EnvoyerTestModal rappel={sendModalRappel} onCancel={() => setSendModalRappel(null)} onSend={handleEnvoyer} sending={sending} error={sendError} />}
    </div>
  );
}

export { RappelsSection, RappelForm };
