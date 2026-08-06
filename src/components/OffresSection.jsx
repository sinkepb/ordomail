// Extrait de Dashboard.jsx (phase 4) — composant autonome (props + état local
// uniquement). Découpage des gros fichiers, voir DEPLOIEMENT_PHASE2.md/PHASE4.md.
import { useState, useEffect } from "react";
import { getSupabaseClient, isDemoMode, fetchStoryMetrics } from "../supabase.js";

function formatDuree(ms) {
  if (!ms) return "—";
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.round(s / 60)}min`;
}

function aggregateOffre(events, offreId) {
  const key = `offre-${offreId}`;
  const relevant = events.filter(e => e.story_id === key);
  const views = relevant.filter(e => e.event === "view");
  const avgMs = views.length ? Math.round(views.reduce((a, b) => a + (b.duree_ms || 0), 0) / views.length) : 0;
  const interets = relevant.filter(e => e.event === "offer_interest" && e.meta?.isOn);
  return { vues: views.length, dureeMoyenne: avgMs, interets: interets.length };
}

function OffresSection({ pharmacie }) {
  const [offres, setOffres]       = useState([]);
  const [events, setEvents]       = useState([]);
  const [showForm, setShowForm]   = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm]           = useState({ type:"promo", titre:"", description:"", emoji:"🎁", badge:"", couleur:"#1a3a6e", actif:true, date_fin:"" });
  const [saving, setSaving]       = useState(false);
  const sb = getSupabaseClient();

  const TYPES = [
    { id:"promo",    label:"Promotion",   emoji:"🏷️" },
    { id:"service",  label:"Service",     emoji:"🩺" },
    { id:"fidelite", label:"Fidélité",    emoji:"🎁" },
  ];

  // Charger les offres au montage
  useEffect(() => {
    if (!pharmacie?.id) return;
    if (isDemoMode) {
      // Démo : offres en mémoire déjà dans le state
      return;
    }
    if (!sb) return;
    sb.from("offres_stories")
      .select("*")
      .eq("pharmacie_id", pharmacie.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => { if (data) setOffres(data); });
    fetchStoryMetrics(pharmacie.id).then(data => setEvents(data || []));
  }, [pharmacie?.id]);

  function openEdit(offre) {
    setEditingId(offre.id);
    setForm({ type:offre.type, titre:offre.titre, description:offre.description||"",
      emoji:offre.emoji||"🎁", badge:offre.badge||"", couleur:offre.couleur||"#1a3a6e",
      actif:offre.actif, date_fin:offre.date_fin||"" });
    setShowForm(true);
  }

  async function saveOffre() {
    if (!form.titre.trim()) return;
    setSaving(true);
    const payload = { ...form, pharmacie_id: pharmacie.id };
    if (editingId) {
      // Modification
      if (sb && !isDemoMode) {
        await sb.from("offres_stories").update(payload).eq("id", editingId);
      }
      setOffres(prev => prev.map(o => o.id === editingId ? { ...o, ...payload } : o));
    } else {
      // Création
      if (sb && !isDemoMode) {
        const { data } = await sb.from("offres_stories").insert(payload).select().single();
        if (data) setOffres(prev => [data, ...prev]);
      } else {
        setOffres(prev => [{ ...payload, id: `o${Date.now()}`, created_at: new Date().toISOString() }, ...prev]);
      }
    }
    setForm({ type:"promo", titre:"", description:"", emoji:"🎁", badge:"", couleur:"#1a3a6e", actif:true, date_fin:"" });
    setEditingId(null);
    setShowForm(false);
    setSaving(false);
  }

  async function toggleOffre(id, actif) {
    setOffres(prev => prev.map(o => o.id === id ? { ...o, actif: !actif } : o));
    if (sb && !isDemoMode) await sb.from("offres_stories").update({ actif: !actif }).eq("id", id);
  }

  async function deleteOffre(id) {
    if (!window.confirm("Supprimer cette offre ?")) return;
    setOffres(prev => prev.filter(o => o.id !== id));
    if (sb && !isDemoMode) await sb.from("offres_stories").delete().eq("id", id);
  }

  return (
    <div style={{ background:"#fff", borderRadius:14, padding:22, boxShadow:"0 2px 10px rgba(0,0,0,0.07)" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:18 }}>
        <div>
          <div style={{ fontWeight:800, fontSize:15 }}>🎯 Offres & Promotions</div>
          <div style={{ fontSize:12, color:"#64748b", marginTop:2 }}>Affichées dans les stories de vos patients en attente</div>
        </div>
        <button onClick={()=>setShowForm(true)}
          style={{ padding:"8px 16px", border:"none", borderRadius:10, background:"#1a3a6e", color:"#fff", fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>
          + Nouvelle offre
        </button>
      </div>

      {/* Formulaire création */}
      {showForm && (
        <div style={{ background:"#f8faff", border:"1.5px solid #e0e7ff", borderRadius:12, padding:18, marginBottom:18 }}>
          <div style={{ fontWeight:700, fontSize:14, marginBottom:14 }}>{editingId ? "✏️ Modifier l'offre" : "➕ Créer une offre"}</div>

          {/* Type */}
          <div style={{ display:"flex", gap:8, marginBottom:14 }}>
            {TYPES.map(t=>(
              <button key={t.id} onClick={()=>setForm(f=>({...f,type:t.id}))}
                style={{ flex:1, padding:"8px 4px", border:`2px solid ${form.type===t.id?"#1a3a6e":"#e0e7ff"}`, borderRadius:10,
                  background:form.type===t.id?"#1a3a6e":"#fff", color:form.type===t.id?"#fff":"#374151",
                  fontWeight:700, fontSize:12, cursor:"pointer", fontFamily:"inherit", textAlign:"center" }}>
                <div style={{ fontSize:18, marginBottom:2 }}>{t.emoji}</div>
                <div>{t.label}</div>
              </button>
            ))}
          </div>

          {/* Emoji + titre */}
          <div style={{ display:"flex", gap:8, marginBottom:10 }}>
            <input value={form.emoji} onChange={e=>setForm(f=>({...f,emoji:e.target.value}))}
              style={{ width:52, border:"1.5px solid #e0e7ff", borderRadius:8, padding:"8px", fontSize:20, textAlign:"center", fontFamily:"inherit" }}/>
            <input value={form.titre} onChange={e=>setForm(f=>({...f,titre:e.target.value}))}
              placeholder="Titre de l'offre (ex: -20% sur Doliprane)"
              style={{ flex:1, border:"1.5px solid #e0e7ff", borderRadius:8, padding:"8px 12px", fontSize:14, fontFamily:"inherit" }}/>
          </div>

          {/* Description */}
          <textarea value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))}
            placeholder="Description courte (1-2 lignes)"
            rows={2}
            style={{ width:"100%", border:"1.5px solid #e0e7ff", borderRadius:8, padding:"8px 12px", fontSize:13, fontFamily:"inherit", resize:"none", marginBottom:10 }}/>

          {/* Badge + couleur + date fin */}
          <div style={{ display:"flex", gap:8, marginBottom:14 }}>
            <input value={form.badge} onChange={e=>setForm(f=>({...f,badge:e.target.value}))}
              placeholder='Badge (ex: "-20%")'
              style={{ flex:1, border:"1.5px solid #e0e7ff", borderRadius:8, padding:"8px 12px", fontSize:13, fontFamily:"inherit" }}/>
            <input type="color" value={form.couleur} onChange={e=>setForm(f=>({...f,couleur:e.target.value}))}
              style={{ width:44, height:38, border:"1.5px solid #e0e7ff", borderRadius:8, cursor:"pointer", padding:2 }}/>
            <input type="date" value={form.date_fin} onChange={e=>setForm(f=>({...f,date_fin:e.target.value}))}
              style={{ flex:1, border:"1.5px solid #e0e7ff", borderRadius:8, padding:"8px 12px", fontSize:13, fontFamily:"inherit" }}/>
          </div>

          {/* Preview story */}
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:11, fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>Aperçu story</div>
            <div style={{ width:120, height:200, borderRadius:16, background:`linear-gradient(160deg,${form.couleur},${form.couleur}99)`, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:10, textAlign:"center", boxShadow:"0 4px 16px rgba(0,0,0,0.15)" }}>
              {form.badge && <div style={{ background:"rgba(255,255,255,0.25)", borderRadius:20, padding:"2px 8px", fontSize:11, fontWeight:900, color:"#fff", marginBottom:6 }}>{form.badge}</div>}
              <div style={{ fontSize:28, marginBottom:6 }}>{form.emoji||"🎁"}</div>
              <div style={{ fontSize:11, fontWeight:800, color:"#fff", lineHeight:1.3 }}>{form.titre||"Titre"}</div>
              {form.description && <div style={{ fontSize:9, color:"rgba(255,255,255,0.8)", marginTop:4, lineHeight:1.4 }}>{form.description.slice(0,40)}</div>}
            </div>
          </div>

          <div style={{ display:"flex", gap:8 }}>
            <button onClick={()=>setShowForm(false)}
              style={{ flex:1, padding:"10px", border:"1.5px solid #e0e7ff", borderRadius:10, background:"#fff", color:"#374151", fontWeight:600, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>
              Annuler
            </button>
            <button onClick={saveOffre} disabled={!form.titre.trim()||saving}
              style={{ flex:2, padding:"10px", border:"none", borderRadius:10, background:"#1a3a6e", color:"#fff", fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>
              {saving ? "Enregistrement…" : editingId ? "✅ Enregistrer" : "✅ Publier l'offre"}
            </button>
          </div>
        </div>
      )}

      {/* Liste des offres */}
      {offres.length === 0 && !showForm && (
        <div style={{ textAlign:"center", padding:"32px 0", color:"#94a3b8" }}>
          <div style={{ fontSize:36, marginBottom:8 }}>🎯</div>
          <div style={{ fontSize:14, fontWeight:600 }}>Aucune offre créée</div>
          <div style={{ fontSize:12, marginTop:4 }}>Créez votre première offre pour l'afficher dans les stories</div>
        </div>
      )}
      {offres.map(offre => {
        const stats = aggregateOffre(events, offre.id);
        return (
        <div key={offre.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 14px", border:`1.5px solid ${offre.actif?"#e0e7ff":"#f1f5f9"}`, borderRadius:12, marginBottom:8, background:offre.actif?"#f8faff":"#f8f9fa" }}>
          <div style={{ width:44, height:44, borderRadius:10, background:`linear-gradient(135deg,${offre.couleur||"#1a3a6e"},${offre.couleur||"#1a3a6e"}88)`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, flexShrink:0 }}>
            {offre.emoji||"🎁"}
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontWeight:700, fontSize:14, color:offre.actif?"#1a1a1a":"#94a3b8", display:"flex", alignItems:"center", gap:6 }}>
              {offre.titre}
              {offre.badge && <span style={{ fontSize:10, background:"#fef3c7", color:"#92400e", borderRadius:20, padding:"1px 7px", fontWeight:800 }}>{offre.badge}</span>}
              <span style={{ fontSize:10, background:offre.type==="promo"?"#fee2e2":offre.type==="service"?"#dbeafe":"#dcfce7", color:offre.type==="promo"?"#dc2626":offre.type==="service"?"#1e40af":"#15803d", borderRadius:20, padding:"1px 7px", fontWeight:700 }}>
                {offre.type==="promo"?"Promotion":offre.type==="service"?"Service":"Fidélité"}
              </span>
            </div>
            {offre.description && <div style={{ fontSize:12, color:"#64748b", marginTop:2, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{offre.description}</div>}
            {offre.date_fin && <div style={{ fontSize:11, color:"#f59e0b", marginTop:2 }}>Jusqu'au {new Date(offre.date_fin).toLocaleDateString("fr-FR")}</div>}
            <div style={{ fontSize:11, color:"#64748b", marginTop:4, display:"flex", gap:12, flexWrap:"wrap" }}>
              <span>👁️ {stats.vues} vue{stats.vues>1?"s":""}</span>
              <span>⏱️ {formatDuree(stats.dureeMoyenne)} en moyenne</span>
              <span>❤️ {stats.interets} intéressé{stats.interets>1?"s":""}</span>
            </div>
          </div>
          <div style={{ display:"flex", gap:6, flexShrink:0 }}>
            <button onClick={()=>toggleOffre(offre.id, offre.actif)}
              style={{ padding:"5px 10px", border:`1.5px solid ${offre.actif?"#fecdd3":"#bbf7d0"}`, borderRadius:8,
                background:offre.actif?"#fff5f5":"#f0fdf4", color:offre.actif?"#dc2626":"#15803d",
                fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
              {offre.actif?"⏸ Pause":"▶ Activer"}
            </button>
            <button onClick={()=>openEdit(offre)}
              style={{ padding:"5px 9px", border:"1.5px solid #e0e7ff", borderRadius:8,
                background:"#f8faff", color:"#1a3a6e", fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>
              ✏️
            </button>
            <button onClick={()=>deleteOffre(offre.id)}
              style={{ padding:"5px 9px", border:"1.5px solid #fee2e2", borderRadius:8,
                background:"#fff5f5", color:"#dc2626", fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>
              🗑️
            </button>
          </div>
        </div>
        );
      })}
    </div>
  );
}

export { OffresSection };
export default OffresSection;
