// Panneau RGPD — backoffice OrdoMail Business (09/08/2026).
// Recherche RGPD : localise les ordonnances d'un patient par son nom, dans la
// fenêtre de rétention active (au-delà des 7 jours du dashboard vendeur, mais
// bornée par la purge automatique — voir l'onglet Purge, PurgeAdmin.jsx), pour
// répondre à une demande de droit d'accès/effacement (art. 12-22).
// ⚠️ Ne vérifie PAS l'identité du demandeur — c'est un outil de localisation,
// pas d'authentification. Voir l'avertissement affiché.
//
// @conformite 25/08/2026 — la recherche est désormais bornée à la fenêtre de
// rétention (au lieu de porter sur tout l'historique sans limite) : un outil
// conçu pour chercher indéfiniment dans le passé contredit l'argument "courte
// période" (art. R.1111-8-8-I al.4 CSP) sur lequel repose l'exemption
// d'hébergeur de données de santé — voir DEPLOIEMENT_CHECKLIST.md.
//
// 25/08/2026 — la section Rétention (durée + fréquence + déclenchement manuel
// + historique) a été sortie dans son propre onglet backoffice (PurgeAdmin.jsx)
// à la demande de l'utilisateur.
import { callSecureDataAdmin } from "../lib/supabase/adminApi.js";
import { useState } from "react";
import { PaginationControls } from "./PaginationControls.jsx";

const RESULTS_PER_PAGE = 10;

// Déclenche le téléchargement d'un objet JS comme fichier .json (01/10/2026,
// export RGPD) — pas de librairie, un Blob + lien éphémère suffit.
function downloadJson(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function SearchSection({ adminToken }) {
  const [nom, setNom]           = useState("");
  const [results, setResults]   = useState(null);
  const [rappelsResults, setRappelsResults] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [deletingId, setDeletingId] = useState(null);
  const [exportingId, setExportingId] = useState(null);
  const [retentionDays, setRetentionDays] = useState(null);
  const [page, setPage] = useState(1);

  async function search() {
    if (nom.trim().length < 2) { setError("Entrez au moins 2 caractères."); return; }
    setLoading(true); setError(""); setResults(null); setRappelsResults(null); setPage(1);
    try {
      const { data, retentionDays: rd, rappels } = await callSecureDataAdmin("admin_search_ordonnances", { nom: nom.trim() }, adminToken);
      setResults(data || []);
      setRappelsResults(rappels || []);
      setRetentionDays(rd ?? null);
    } catch(e) {
      setError(e.message);
    }
    setLoading(false);
  }

  async function supprimer(id) {
    if (!window.confirm("Confirmer la suppression définitive de cette ordonnance ?\n\nÀ ne faire qu'après avoir vérifié l'identité du demandeur par un autre moyen (téléphone, email confirmé).")) return;
    setDeletingId(id);
    try {
      await callSecureDataAdmin("admin_delete_ordonnance", { ordoId: id }, adminToken);
      setResults(prev => prev.filter(r => r.id !== id));
    } catch(e) {
      setError(e.message);
    }
    setDeletingId(null);
  }

  // Export/portabilité (01/10/2026, art. 15/20) — télécharge un JSON
  // consolidé pour une ordonnance ou un rappel, à transmettre ensuite au
  // demandeur par le canal de son choix (email, courrier...).
  async function exporter(type, id) {
    setExportingId(id);
    try {
      const params = type === "ordonnance" ? { ordoIds: [id] } : { rappelIds: [id] };
      const { data } = await callSecureDataAdmin("admin_export_patient_data", params, adminToken);
      downloadJson(data, `export-rgpd-${type}-${id.slice(0, 8)}.json`);
    } catch(e) {
      setError(e.message);
    }
    setExportingId(null);
  }

  const results_ = results || [];
  const pageCount = Math.max(1, Math.ceil(results_.length / RESULTS_PER_PAGE));
  const currentPage = Math.min(page, pageCount);
  const paginatedResults = results_.slice((currentPage - 1) * RESULTS_PER_PAGE, currentPage * RESULTS_PER_PAGE);

  return (
    <div style={{ background:"#1e293b", border:"1px solid #334155", borderRadius:12, padding:20 }}>
      <div style={{ fontWeight:800, fontSize:15, color:"#fff", marginBottom:6 }}>🔍 Recherche RGPD (droits patient)</div>
      <div style={{ background:"rgba(230,168,23,0.12)", border:"1px solid rgba(230,168,23,0.35)", borderRadius:8, padding:"10px 14px", fontSize:12, color:"#fcd34d", lineHeight:1.6, marginBottom:16 }}>
        ⚠️ Cette recherche localise des dossiers par nom — elle ne vérifie <strong>pas</strong> l'identité du demandeur. Vérifiez toujours l'identité par un autre moyen (téléphone, email confirmé) avant toute suppression.
      </div>
      <div style={{ fontSize:11, color:"#64748b", marginBottom:14 }}>
        {retentionDays
          ? `Recherche limitée aux ${retentionDays} derniers jours (fenêtre de rétention active) — toute ordonnance plus ancienne a déjà été purgée automatiquement.`
          : "La rétention n'est pas configurée ci-dessus : la recherche ne sera pas bornée dans le temps."}
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
          {paginatedResults.map(r => (
            <div key={r.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, background:"#0f172a", border:"1px solid #334155", borderRadius:8, padding:"10px 14px" }}>
              <div style={{ minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:700, color:"#fff" }}>{r.patient_nom || r.from_name || "Patient"}</div>
                <div style={{ fontSize:11, color:"#64748b" }}>
                  {r.pharmacies?.nom || r.pharmacie_id} · {r.code_patient || "—"} · {new Date(r.received_at).toLocaleDateString("fr-FR")} · {r.status}
                </div>
              </div>
              <div style={{ display:"flex", gap:8, flexShrink:0 }}>
                <button onClick={()=>exporter("ordonnance", r.id)} disabled={exportingId===r.id}
                  style={{ padding:"6px 14px", border:"1px solid #3b82f6", borderRadius:8, background:"rgba(59,130,246,0.12)", color:"#93c5fd", fontSize:11, fontWeight:700, cursor:exportingId===r.id?"wait":"pointer", fontFamily:"inherit" }}>
                  {exportingId===r.id ? "…" : "📥 Exporter"}
                </button>
                <button onClick={()=>supprimer(r.id)} disabled={deletingId===r.id}
                  style={{ padding:"6px 14px", border:"1px solid #dc2626", borderRadius:8, background:"rgba(220,38,38,0.12)", color:"#f87171", fontSize:11, fontWeight:700, cursor:deletingId===r.id?"wait":"pointer", fontFamily:"inherit" }}>
                  {deletingId===r.id ? "…" : "🗑️ Supprimer"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <PaginationControls page={currentPage} setPage={setPage} pageCount={pageCount} totalCount={results_.length} itemLabel="résultat"/>

      {/* Rappels de renouvellement (01/10/2026, audit RGPD) — jusqu'ici
          introuvables par cet outil, alors que lisibles/modifiables par le
          titulaire comme les ordonnances. Pas de suppression directe ici
          (la purge dédiée — onglet Purge — reste le chemin normal), mais au
          moins visibles et exportables pour une demande d'accès. */}
      {rappelsResults && rappelsResults.length > 0 && (
        <div style={{ marginTop:20 }}>
          <div style={{ fontSize:12, fontWeight:700, color:"#94a3b8", marginBottom:8 }}>🔔 Rappels de renouvellement ({rappelsResults.length})</div>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {rappelsResults.map(r => (
              <div key={r.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, background:"#0f172a", border:"1px solid #334155", borderRadius:8, padding:"10px 14px" }}>
                <div style={{ minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:"#fff" }}>{r.patient_prenom} {r.patient_nom}</div>
                  <div style={{ fontSize:11, color:"#64748b" }}>
                    {r.pharmacies?.nom || r.pharmacie_id} · {r.patient_telephone} · {new Date(r.created_at).toLocaleDateString("fr-FR")} · {r.statut}
                  </div>
                </div>
                <button onClick={()=>exporter("rappel", r.id)} disabled={exportingId===r.id}
                  style={{ flexShrink:0, padding:"6px 14px", border:"1px solid #3b82f6", borderRadius:8, background:"rgba(59,130,246,0.12)", color:"#93c5fd", fontSize:11, fontWeight:700, cursor:exportingId===r.id?"wait":"pointer", fontFamily:"inherit" }}>
                  {exportingId===r.id ? "…" : "📥 Exporter"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RgpdPanel({ adminToken } = {}) {
  return (
    <div>
      <SearchSection adminToken={adminToken} />
    </div>
  );
}

export { RgpdPanel };
