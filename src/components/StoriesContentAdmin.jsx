// Extrait de AdminPage.jsx (phase 2) — composant autonome (état local uniquement),
// découpage des gros fichiers. Voir DEPLOIEMENT_PHASE2.md.
//
// @phase4-security 25/07/2026 — lisait/écrivait stories_content directement avec
// la clé anon : le backoffice n'a pas de session Supabase Auth réelle (même
// architecture que le vendeur, voir phase 1), donc RLS ne pouvait pas distinguer
// un admin authentifié d'un visiteur anonyme muni de la clé anon publique.
// Routé via secure-data (jeton admin) comme le reste du backoffice.
import { useState, useEffect } from "react";

async function callSecureData(resource, params, adminToken) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const res = await fetch(`${supabaseUrl}/functions/v1/secure-data-admin`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": supabaseKey,
      "Authorization": `Bearer ${adminToken || ""}`,
    },
    body: JSON.stringify({ resource, params }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `secure-data-admin ${resource} : erreur ${res.status}`);
  return body;
}

function StoriesContentAdmin({ adminToken } = {}) {
  const [items, setItems]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing]   = useState(null);
  const [form, setForm]         = useState({
    type: "info", titre: "", contenu: "", emoji: "💡",
    question: "", reponses: "", explication: "", actif: true,
  });
  const [saving, setSaving]     = useState(false);
  const [search, setSearch]     = useState("");
  const [error, setError]       = useState("");

  const TYPES = [
    { id:"info",    label:"Information",  emoji:"💡", color:"#1a3a6e" },
    { id:"conseil", label:"Conseil santé",emoji:"💊", color:"#15803d" },
    { id:"quiz",    label:"Quiz",         emoji:"🧠", color:"#6d28d9" },
  ];

  useEffect(() => { loadItems(); }, []);

  async function loadItems() {
    setLoading(true);
    setError("");
    try {
      const { data } = await callSecureData("admin_stories", {}, adminToken);
      if (data) setItems(data);
    } catch(e) {
      setError(e.message);
    }
    setLoading(false);
  }

  function openNew() {
    setEditing(null);
    setForm({ type:"info", titre:"", contenu:"", emoji:"💡", question:"", reponses:"", explication:"", actif:true });
    setShowForm(true);
  }

  function openEdit(item) {
    setEditing(item.id);
    setForm({
      type: item.type, titre: item.titre, contenu: item.contenu || "",
      emoji: item.emoji || "💡", question: item.question || "",
      reponses: item.reponses || "", explication: item.explication || "",
      actif: item.actif,
    });
    setShowForm(true);
  }

  async function saveItem() {
    if (!form.titre.trim()) return;
    setSaving(true);
    setError("");
    const payload = {
      type: form.type, titre: form.titre, contenu: form.contenu,
      emoji: form.emoji, question: form.question,
      reponses: form.reponses, explication: form.explication, actif: form.actif,
    };
    try {
      if (editing) {
        await callSecureData("admin_stories_write", { action: "update", id: editing, payload }, adminToken);
        setItems(prev => prev.map(x => x.id === editing ? { ...x, ...payload } : x));
      } else {
        const { data } = await callSecureData("admin_stories_write", { action: "create", payload }, adminToken);
        if (data) setItems(prev => [data, ...prev]);
      }
      setShowForm(false); setEditing(null);
    } catch(e) {
      setError(e.message);
    }
    setSaving(false);
  }

  async function deleteItem(id) {
    if (!window.confirm("Supprimer ce contenu ?")) return;
    try {
      await callSecureData("admin_stories_write", { action: "delete", id }, adminToken);
      setItems(prev => prev.filter(x => x.id !== id));
    } catch(e) {
      setError(e.message);
    }
  }

  async function toggleActif(id, actif) {
    try {
      await callSecureData("admin_stories_write", { action: "update", id, payload: { actif: !actif } }, adminToken);
      setItems(prev => prev.map(x => x.id === id ? { ...x, actif: !actif } : x));
    } catch(e) {
      setError(e.message);
    }
  }

  const filtered = items.filter(x =>
    x.titre.toLowerCase().includes(search.toLowerCase()) ||
    (x.contenu||"").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
        <div>
          <div style={{ fontWeight:900, fontSize:18 }}>📱 Contenu Stories Santé</div>
          <div style={{ fontSize:12, color:"#64748b", marginTop:2 }}>{items.length} contenus · Affichés aléatoirement aux patients</div>
        </div>
        <button onClick={openNew}
          style={{ padding:"10px 18px", border:"none", borderRadius:10, background:"#1a3a6e", color:"#fff", fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>
          + Ajouter
        </button>
      </div>

      {error && (
        <div style={{ background:"#fee2e2", border:"1px solid #fecaca", borderRadius:8, padding:"9px 12px", marginBottom:14, fontSize:13, color:"#dc2626" }}>
          ⚠️ {error}
        </div>
      )}

      {/* Barre recherche */}
      <input value={search} onChange={e=>setSearch(e.target.value)}
        placeholder="🔍 Rechercher…"
        style={{ width:"100%", border:"1.5px solid #e0e7ff", borderRadius:10, padding:"10px 14px", fontSize:14, fontFamily:"inherit", marginBottom:16, outline:"none" }}/>

      {/* Formulaire */}
      {showForm && (
        <div style={{ background:"#f8faff", border:"1.5px solid #e0e7ff", borderRadius:14, padding:20, marginBottom:20 }}>
          <div style={{ fontWeight:700, fontSize:15, marginBottom:16 }}>{editing ? "✏️ Modifier" : "➕ Nouveau contenu"}</div>

          {/* Type */}
          <div style={{ display:"flex", gap:8, marginBottom:14 }}>
            {TYPES.map(t => (
              <button key={t.id} onClick={()=>setForm(f=>({...f, type:t.id, emoji:t.emoji}))}
                style={{ flex:1, padding:"8px 4px", border:`2px solid ${form.type===t.id?t.color:"#e0e7ff"}`,
                  borderRadius:10, background:form.type===t.id?t.color:"#fff",
                  color:form.type===t.id?"#fff":"#374151", fontWeight:700, fontSize:12,
                  cursor:"pointer", fontFamily:"inherit", textAlign:"center" }}>
                <div style={{ fontSize:18 }}>{t.emoji}</div>
                <div>{t.label}</div>
              </button>
            ))}
          </div>

          {/* Emoji + Titre */}
          <div style={{ display:"flex", gap:8, marginBottom:10 }}>
            <input value={form.emoji} onChange={e=>setForm(f=>({...f,emoji:e.target.value}))}
              style={{ width:52, border:"1.5px solid #e0e7ff", borderRadius:8, padding:8, fontSize:20, textAlign:"center", fontFamily:"inherit" }}/>
            <input value={form.titre} onChange={e=>setForm(f=>({...f,titre:e.target.value}))}
              placeholder="Titre" style={{ flex:1, border:"1.5px solid #e0e7ff", borderRadius:8, padding:"8px 12px", fontSize:14, fontFamily:"inherit" }}/>
          </div>

          {/* Contenu texte (info + conseil) */}
          {form.type !== "quiz" && (
            <textarea value={form.contenu} onChange={e=>setForm(f=>({...f,contenu:e.target.value}))}
              placeholder="Contenu de la story (2-3 lignes max)" rows={3}
              style={{ width:"100%", border:"1.5px solid #e0e7ff", borderRadius:8, padding:"8px 12px", fontSize:13, fontFamily:"inherit", resize:"none", marginBottom:10 }}/>
          )}

          {/* Champs quiz */}
          {form.type === "quiz" && (
            <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:10 }}>
              <input value={form.question} onChange={e=>setForm(f=>({...f,question:e.target.value}))}
                placeholder="Question du quiz"
                style={{ border:"1.5px solid #e0e7ff", borderRadius:8, padding:"8px 12px", fontSize:13, fontFamily:"inherit" }}/>
              <textarea value={form.reponses} onChange={e=>setForm(f=>({...f,reponses:e.target.value}))}
                rows={5} placeholder={`Réponses au format JSON:
[{"text":"Réponse A","correct":false,"emoji":"❌"},
 {"text":"Réponse B","correct":true,"emoji":"✅"}]`}
                style={{ border:"1.5px solid #e0e7ff", borderRadius:8, padding:"8px 12px", fontSize:12, fontFamily:"monospace", resize:"vertical" }}/>
              <input value={form.explication} onChange={e=>setForm(f=>({...f,explication:e.target.value}))}
                placeholder="Explication après réponse"
                style={{ border:"1.5px solid #e0e7ff", borderRadius:8, padding:"8px 12px", fontSize:13, fontFamily:"inherit" }}/>
            </div>
          )}

          {/* Actif */}
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
            <input type="checkbox" checked={form.actif} onChange={e=>setForm(f=>({...f,actif:e.target.checked}))} id="actif-check"/>
            <label htmlFor="actif-check" style={{ fontSize:13, fontWeight:600, color:"#374151", cursor:"pointer" }}>Actif (affiché aux patients)</label>
          </div>

          <div style={{ display:"flex", gap:8 }}>
            <button onClick={()=>{setShowForm(false);setEditing(null);}}
              style={{ flex:1, padding:"10px", border:"1.5px solid #e0e7ff", borderRadius:10, background:"#fff", fontWeight:600, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>
              Annuler
            </button>
            <button onClick={saveItem} disabled={!form.titre.trim()||saving}
              style={{ flex:2, padding:"10px", border:"none", borderRadius:10, background:"#1a3a6e", color:"#fff", fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>
              {saving ? "Enregistrement…" : editing ? "✅ Enregistrer" : "✅ Publier"}
            </button>
          </div>
        </div>
      )}

      {/* Stats rapides */}
      <div style={{ display:"flex", gap:8, marginBottom:16 }}>
        {TYPES.map(t => (
          <div key={t.id} style={{ flex:1, background:"#f8faff", border:"1.5px solid #e0e7ff", borderRadius:10, padding:"10px 12px", textAlign:"center" }}>
            <div style={{ fontSize:20 }}>{t.emoji}</div>
            <div style={{ fontSize:20, fontWeight:900, color:t.color }}>{items.filter(x=>x.type===t.id).length}</div>
            <div style={{ fontSize:10, color:"#64748b" }}>{t.label}</div>
          </div>
        ))}
        <div style={{ flex:1, background:"#f0fdf4", border:"1.5px solid #bbf7d0", borderRadius:10, padding:"10px 12px", textAlign:"center" }}>
          <div style={{ fontSize:20 }}>✅</div>
          <div style={{ fontSize:20, fontWeight:900, color:"#15803d" }}>{items.filter(x=>x.actif).length}</div>
          <div style={{ fontSize:10, color:"#64748b" }}>Actifs</div>
        </div>
      </div>

      {/* Liste */}
      {loading && <div style={{ textAlign:"center", padding:32, color:"#94a3b8" }}>Chargement…</div>}
      {!loading && filtered.length === 0 && (
        <div style={{ textAlign:"center", padding:32, color:"#94a3b8" }}>
          <div style={{ fontSize:36, marginBottom:8 }}>📭</div>
          <div>{search ? "Aucun résultat" : "Aucun contenu créé"}</div>
        </div>
      )}
      {filtered.map(item => {
        const typeInfo = TYPES.find(t=>t.id===item.type) || TYPES[0];
        return (
          <div key={item.id} style={{ display:"flex", alignItems:"flex-start", gap:12, padding:"14px 16px",
            border:`1.5px solid ${item.actif?"#e0e7ff":"#f1f5f9"}`, borderRadius:12, marginBottom:8,
            background:item.actif?"#fff":"#f8f9fa", opacity:item.actif?1:0.6 }}>
            <div style={{ width:42, height:42, borderRadius:10, background:typeInfo.color, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0 }}>
              {item.emoji||typeInfo.emoji}
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:3 }}>
                <span style={{ fontWeight:700, fontSize:14, color:"#1a1a1a" }}>{item.titre}</span>
                <span style={{ fontSize:10, background:typeInfo.color+"22", color:typeInfo.color, borderRadius:20, padding:"1px 8px", fontWeight:700 }}>{typeInfo.label}</span>
                {!item.actif && <span style={{ fontSize:10, background:"#f1f5f9", color:"#94a3b8", borderRadius:20, padding:"1px 8px", fontWeight:700 }}>Inactif</span>}
              </div>
              {item.contenu && <div style={{ fontSize:12, color:"#64748b", lineHeight:1.5, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{item.contenu}</div>}
              {item.question && <div style={{ fontSize:12, color:"#6d28d9", marginTop:2 }}>❓ {item.question}</div>}
            </div>
            <div style={{ display:"flex", gap:6, flexShrink:0 }}>
              <button onClick={()=>toggleActif(item.id, item.actif)}
                style={{ padding:"5px 10px", border:`1.5px solid ${item.actif?"#fecdd3":"#bbf7d0"}`, borderRadius:8,
                  background:item.actif?"#fff5f5":"#f0fdf4", color:item.actif?"#dc2626":"#15803d",
                  fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
                {item.actif?"Désactiver":"Activer"}
              </button>
              <button onClick={()=>openEdit(item)}
                style={{ padding:"5px 9px", border:"1.5px solid #e0e7ff", borderRadius:8, background:"#f8faff", color:"#1a3a6e", fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>
                ✏️
              </button>
              <button onClick={()=>deleteItem(item.id)}
                style={{ padding:"5px 9px", border:"1.5px solid #fee2e2", borderRadius:8, background:"#fff5f5", color:"#dc2626", fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>
                🗑️
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export { StoriesContentAdmin };
export default StoriesContentAdmin;
