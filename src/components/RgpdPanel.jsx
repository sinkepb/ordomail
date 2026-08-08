// Panneau RGPD — backoffice OrdoMail Business (09/08/2026).
// Deux outils de conformité RGPD sur les ordonnances (données de santé) :
//   1. Rétention : durée de conservation configurable, purgée chaque nuit par
//      l'edge function purge-ordonnances (désactivée tant qu'aucune durée
//      n'est définie — voir migration 20260809_retention_purge.sql).
//   2. Recherche RGPD : localise l'historique complet d'un patient par son
//      nom (au-delà de la fenêtre de 7 jours du dashboard vendeur), pour
//      répondre à une demande de droit d'accès/effacement (art. 12-22).
//      ⚠️ Ne vérifie PAS l'identité du demandeur — c'est un outil de
//      localisation, pas d'authentification. Voir l'avertissement affiché.
import { useState, useEffect } from "react";

async function callSecureData(resource, params, adminToken) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const res = await fetch(`${supabaseUrl}/functions/v1/secure-data`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": supabaseKey,
      "Authorization": `Bearer ${adminToken || ""}`,
    },
    body: JSON.stringify({ resource, params }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `secure-data ${resource} : erreur ${res.status}`);
  return body;
}

function RetentionSection({ adminToken }) {
  const [days, setDays]         = useState("");
  const [current, setCurrent]   = useState(null);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [msg, setMsg]           = useState(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const { data } = await callSecureData("admin_retention_get", {}, adminToken);
      setCurrent(data);
      setDays(data?.ordonnances_retention_days ? String(data.ordonnances_retention_days) : "");
    } catch(e) {
      setMsg({ ok: false, text: e.message });
    }
    setLoading(false);
  }

  async function save() {
    setSaving(true); setMsg(null);
    try {
      const value = days.trim() === "" ? null : Number(days);
      if (value !== null && (!Number.isInteger(value) || value <= 0)) {
        setMsg({ ok: false, text: "Entrez un nombre entier de jours positif, ou laissez vide pour désactiver la purge." });
        setSaving(false);
        return;
      }
      await callSecureData("admin_retention_set", { days: value, updatedBy: "backoffice" }, adminToken);
      setMsg({ ok: true, text: value ? `Rétention fixée à ${value} jours — la purge nocturne s'appliquera dès ce soir.` : "Purge automatique désactivée." });
      await load();
    } catch(e) {
      setMsg({ ok: false, text: e.message });
    }
    setSaving(false);
  }

  return (
    <div style={{ background:"#1e293b", border:"1px solid #334155", borderRadius:12, padding:20, marginBottom:20 }}>
      <div style={{ fontWeight:800, fontSize:15, color:"#fff", marginBottom:6 }}>🗑️ Rétention des ordonnances</div>
      <div style={{ fontSize:12, color:"#64748b", marginBottom:16, lineHeight:1.6 }}>
        Durée après laquelle une ordonnance (fichier + métadonnées) est supprimée automatiquement chaque nuit. Laissez vide pour désactiver la purge — c'est le réglage par défaut, aucune suppression n'a lieu tant qu'une durée n'est pas définie ici.
      </div>
      {loading ? (
        <div style={{ color:"#64748b", fontSize:13 }}>Chargement…</div>
      ) : (
        <>
          <div style={{ display:"flex", gap:10, alignItems:"center", marginBottom:10 }}>
            <input type="number" min="1" value={days} onChange={e=>setDays(e.target.value)}
              placeholder="ex. 1095 (3 ans)"
              style={{ width:180, padding:"9px 12px", background:"#0f172a", border:"1px solid #334155", borderRadius:8, color:"#fff", fontSize:14, outline:"none", fontFamily:"inherit" }}/>
            <span style={{ fontSize:12, color:"#64748b" }}>jours</span>
            <button onClick={save} disabled={saving}
              style={{ marginLeft:"auto", padding:"9px 18px", border:"none", borderRadius:8, background:saving?"#1e3a5f":"#3b82f6", color:"#fff", fontWeight:700, fontSize:13, cursor:saving?"wait":"pointer", fontFamily:"inherit" }}>
              {saving ? "…" : "Enregistrer"}
            </button>
          </div>
          <div style={{ fontSize:11, color:"#475569" }}>
            {current?.ordonnances_retention_days
              ? `Actuellement : ${current.ordonnances_retention_days} jours (dernière modification ${current.updated_at ? new Date(current.updated_at).toLocaleString("fr-FR") : "—"})`
              : "Actuellement : purge désactivée"}
          </div>
        </>
      )}
      {msg && <div style={{ marginTop:10, fontSize:12, fontWeight:600, padding:"8px 12px", borderRadius:8, background:msg.ok?"rgba(34,197,94,0.15)":"rgba(220,38,38,0.15)", color:msg.ok?"#4ade80":"#f87171" }}>{msg.text}</div>}
    </div>
  );
}

function SearchSection({ adminToken }) {
  const [nom, setNom]           = useState("");
  const [results, setResults]   = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [deletingId, setDeletingId] = useState(null);

  async function search() {
    if (nom.trim().length < 2) { setError("Entrez au moins 2 caractères."); return; }
    setLoading(true); setError(""); setResults(null);
    try {
      const { data } = await callSecureData("admin_search_ordonnances", { nom: nom.trim() }, adminToken);
      setResults(data || []);
    } catch(e) {
      setError(e.message);
    }
    setLoading(false);
  }

  async function supprimer(id) {
    if (!window.confirm("Confirmer la suppression définitive de cette ordonnance ?\n\nÀ ne faire qu'après avoir vérifié l'identité du demandeur par un autre moyen (téléphone, email confirmé).")) return;
    setDeletingId(id);
    try {
      await callSecureData("admin_delete_ordonnance", { ordoId: id }, adminToken);
      setResults(prev => prev.filter(r => r.id !== id));
    } catch(e) {
      setError(e.message);
    }
    setDeletingId(null);
  }

  return (
    <div style={{ background:"#1e293b", border:"1px solid #334155", borderRadius:12, padding:20 }}>
      <div style={{ fontWeight:800, fontSize:15, color:"#fff", marginBottom:6 }}>🔍 Recherche RGPD (droits patient)</div>
      <div style={{ background:"rgba(230,168,23,0.12)", border:"1px solid rgba(230,168,23,0.35)", borderRadius:8, padding:"10px 14px", fontSize:12, color:"#fcd34d", lineHeight:1.6, marginBottom:16 }}>
        ⚠️ Cette recherche localise des dossiers par nom — elle ne vérifie <strong>pas</strong> l'identité du demandeur. Vérifiez toujours l'identité par un autre moyen (téléphone, email confirmé) avant toute suppression.
      </div>
      <div style={{ display:"flex", gap:10, marginBottom:14 }}>
        <input value={nom} onChange={e=>setNom(e.target.value)} onKeyDown={e=>e.key==="Enter"&&search()}
          placeholder="Nom du patient…"
          style={{ flex:1, padding:"9px 12px", background:"#0f172a", border:"1px solid #334155", borderRadius:8, color:"#fff", fontSize:14, outline:"none", fontFamily:"inherit" }}/>
        <button onClick={search} disabled={loading}
          style={{ padding:"9px 18px", border:"none", borderRadius:8, background:loading?"#1e3a5f":"#3b82f6", color:"#fff", fontWeight:700, fontSize:13, cursor:loading?"wait":"pointer", fontFamily:"inherit" }}>
          {loading ? "…" : "Rechercher"}
        </button>
      </div>
      {error && <div style={{ marginBottom:12, fontSize:12, fontWeight:600, padding:"8px 12px", borderRadius:8, background:"rgba(220,38,38,0.15)", color:"#f87171" }}>{error}</div>}
      {results && results.length === 0 && (
        <div style={{ textAlign:"center", padding:24, color:"#64748b", fontSize:13 }}>Aucun résultat.</div>
      )}
      {results && results.length > 0 && (
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {results.map(r => (
            <div key={r.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, background:"#0f172a", border:"1px solid #334155", borderRadius:8, padding:"10px 14px" }}>
              <div style={{ minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:700, color:"#fff" }}>{r.patient_nom || r.from_name || "Patient"}</div>
                <div style={{ fontSize:11, color:"#64748b" }}>
                  {r.pharmacies?.nom || r.pharmacie_id} · {r.code_patient || "—"} · {new Date(r.received_at).toLocaleDateString("fr-FR")} · {r.status}
                </div>
              </div>
              <button onClick={()=>supprimer(r.id)} disabled={deletingId===r.id}
                style={{ flexShrink:0, padding:"6px 14px", border:"1px solid #dc2626", borderRadius:8, background:"rgba(220,38,38,0.12)", color:"#f87171", fontSize:11, fontWeight:700, cursor:deletingId===r.id?"wait":"pointer", fontFamily:"inherit" }}>
                {deletingId===r.id ? "…" : "🗑️ Supprimer"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RgpdPanel({ adminToken } = {}) {
  return (
    <div>
      <RetentionSection adminToken={adminToken} />
      <SearchSection adminToken={adminToken} />
    </div>
  );
}

export { RgpdPanel };
