// Rappels de renouvellement d'ordonnance (04/09/2026) — voir
// supabase/migrations/20260904_rappels_ordonnance.sql pour le cycle de statut.
// Découpage autonome (props + état local), même convention que OffresSection.jsx.
import { useState, useEffect } from "react";
import { fetchRappels, createRappel, traiterRappel, terminerRappel } from "../supabase.js";

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

// Exporté (04/09/2026) — réutilisé depuis Dashboard.jsx pour créer un rappel
// directement depuis une carte d'ordonnance (nom/prénom pré-remplis à partir
// du patient de l'ordonnance), pas seulement depuis l'onglet Rappels lui-même.
function RappelForm({ onCancel, onCreated, creating, setCreating, initialNom = "", initialPrenom = "" }) {
  const [nom, setNom] = useState(initialNom);
  const [prenom, setPrenom] = useState(initialPrenom);
  const [telephone, setTelephone] = useState("");
  const [commentaire, setCommentaire] = useState("");
  const [consentement, setConsentement] = useState(false);
  const [error, setError] = useState("");

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
    if (!consentement) {
      setError("Le patient doit avoir consenti à être recontacté par SMS.");
      return;
    }
    setCreating(true);
    try {
      await onCreated({ nom: nom.trim(), prenom: prenom.trim(), telephone: normalizeTel(telephone), commentaire: commentaire.trim(), consentement });
    } catch (e2) {
      setError(e2.message || "Échec de la création du rappel.");
    }
    setCreating(false);
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,47,0.55)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onCancel}>
      <form onSubmit={handleSubmit} onClick={e => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 420, boxShadow: "0 12px 40px rgba(0,0,0,0.25)" }}>
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 16 }}>🔔 Nouveau rappel de renouvellement</div>

        <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 4 }}>Nom du patient</label>
        <input value={nom} onChange={e => setNom(e.target.value)} placeholder="Dupont"
          style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", marginBottom: 12, fontFamily: "inherit", fontSize: 14, boxSizing: "border-box" }} />

        <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 4 }}>Prénom du patient</label>
        <input value={prenom} onChange={e => setPrenom(e.target.value)} placeholder="Jean"
          style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", marginBottom: 12, fontFamily: "inherit", fontSize: 14, boxSizing: "border-box" }} />

        <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 4 }}>Numéro de téléphone</label>
        <input value={telephone} onChange={e => setTelephone(e.target.value)} placeholder="06 12 34 56 78"
          style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", marginBottom: 12, fontFamily: "inherit", fontSize: 14, boxSizing: "border-box" }} />

        <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 4 }}>Commentaire (optionnel)</label>
        <textarea value={commentaire} onChange={e => setCommentaire(e.target.value)} rows={2} placeholder="Ex : traitement chronique, renouvellement tous les 3 mois"
          style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", marginBottom: 12, fontFamily: "inherit", fontSize: 14, boxSizing: "border-box", resize: "vertical" }} />

        <label style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 16, cursor: "pointer" }}>
          <input type="checkbox" checked={consentement} onChange={e => setConsentement(e.target.checked)} style={{ marginTop: 3 }} />
          <span style={{ fontSize: 12.5, color: "#475569", lineHeight: 1.4 }}>Le patient a été informé et consent à être recontacté par SMS au sujet du renouvellement de son ordonnance.</span>
        </label>

        {error && <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 12 }}>{error}</div>}

        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={onCancel} disabled={creating}
            style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1.5px solid #e2e8f0", background: "#fff", color: "#475569", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
            Annuler
          </button>
          <button type="submit" disabled={creating}
            style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: "#1a3a6e", color: "#fff", fontWeight: 700, fontSize: 14, cursor: creating ? "default" : "pointer", fontFamily: "inherit", opacity: creating ? 0.7 : 1 }}>
            {creating ? "Création…" : "Créer le rappel"}
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
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState(null);

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
                {r.commentaire && <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>{r.commentaire}</div>}
                {r.statut === "a_traiter" && r.choix_patient && (
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: "#dc2626", marginTop: 4 }}>{CHOIX_LABEL[r.choix_patient] || r.choix_patient}</div>
                )}
              </div>
              <span style={{ background: info.bg, color: info.fg, borderRadius: 999, padding: "4px 12px", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{info.label}</span>
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
    </div>
  );
}

export { RappelsSection, RappelForm };
