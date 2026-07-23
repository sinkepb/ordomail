import { useState, useEffect, useRef } from "react";
import { PLAN_LIMITS, PLAN_ORDER } from "../lib/plans.js";
import { updateSonnetteActive } from "../supabase.js";
import { PersistentNav } from "../pages/LandingPage.jsx";
import { PLANS } from "../lib/utils.js";

function openInvoicePDF(invoice, pharmacie, plan) {
  const html = generateInvoiceHTML({ invoice, pharmacie, plan });
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const win  = window.open(url, "_blank");
  if (win) win.focus();
  // Révoquer après 60s
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

import { getSupabaseClient, isDemoMode, changePlan,
  snapshotMetriquesJournalieres, fetchHistoriqueMetriques } from "../supabase.js";

console.log("✅ MODULE CHARGÉ: pages/AdminPage.jsx");

const MOCK_INVOICES = [
  { id:"INV-2025-006", subId:"sub1", date:"15/06/2025", amount:19,  desc:"Starter — Juin 2025" },
  { id:"INV-2025-005", subId:"sub2", date:"01/06/2025", amount:39,  desc:"Standard — Juin 2025" },
  { id:"INV-2025-004", subId:"sub3", date:"15/05/2025", amount:189, desc:"Pro Annuel — Q2 2025" },
  { id:"INV-2025-003", subId:"sub1", date:"15/05/2025", amount:19,  desc:"Starter — Mai 2025" },
  { id:"INV-2025-002", subId:"sub7", date:"20/05/2025", amount:39,  desc:"Standard — Mai 2025" },
];

const MOCK_SUBSCRIPTIONS = [
  { id:"sub1", pharmacie:"Pharmacie Centrale",    email:"contact@pharmaciecentrale.fr", plan:"starter",  billing:"monthly", status:"active",    mrr:19,  renewal:"15/07/2025", subId:"sub1" },
  { id:"sub2", pharmacie:"Pharmacie du Soleil",   email:"pharma@soleil.fr",             plan:"standard", billing:"monthly", status:"active",    mrr:39,  renewal:"01/08/2025", subId:"sub2" },
  { id:"sub3", pharmacie:"Pharmacie Lafayette",   email:"contact@lafayette.fr",         plan:"pro",      billing:"annual",  status:"active",    mrr:63,  renewal:"15/09/2025", subId:"sub3" },
  { id:"sub4", pharmacie:"Pharmacie des Arts",    email:"info@pharmaarts.fr",           plan:"starter",  billing:"monthly", status:"trialing",  mrr:0,   renewal:"30/07/2025", subId:"sub4" },
  { id:"sub5", pharmacie:"Pharmacie Saint-Michel",email:"saintmichel@pharma.fr",        plan:"standard", billing:"annual",  status:"past_due",  mrr:31,  renewal:"01/07/2025", subId:"sub5" },
  { id:"sub6", pharmacie:"Pharmacie Beaubourg",   email:"contact@beaubourg.fr",         plan:"starter",  billing:"monthly", status:"canceled",  mrr:0,   renewal:"—",          subId:"sub6" },
  { id:"sub7", pharmacie:"Pharmacie de la Gare",  email:"gare@pharma.fr",              plan:"standard", billing:"monthly", status:"active",    mrr:39,  renewal:"20/07/2025", subId:"sub7" },
  { id:"sub8", pharmacie:"Pharmacie Marais",      email:"marais@pharma.fr",             plan:"pro",      billing:"monthly", status:"trialing",  mrr:0,   renewal:"10/08/2025", subId:"sub8" },
];


// Identifiant démo (mode VITE_DEMO_MODE=true uniquement — voir authenticate() ci-dessous).
// ⚠️ Ne JAMAIS utiliser DB.admin comme repli d'authentification hors mode démo strict :
// c'était la porte dérobée corrigée le 23/07/2026 (voir dossier d'audit sécurité).
// Note : contrairement à App.jsx, ce fichier n'a plus besoin d'un jeu de pharmacies
// factices — AdminDashboardLive lit window._ordomailDB (exposé par App.jsx) en mode
// démo, pas une copie locale. Seul DB.admin sert encore ici (repli démo du login).
const DB = {
  admin: { email: "admin@ordomail.fr", password: "admin2025" },
};


function BackofficeAdmin({ onBack }) {
  const [authed,     setAuthed]     = useState(false);
  const [adminToken, setAdminToken] = useState(null);
  const [email,      setEmail]      = useState("");
  const [pwd,        setPwd]        = useState("");
  const [err,        setErr]        = useState("");
  const [loading,    setLoading]    = useState(false);

  async function authenticate() {
    if (!email || !pwd) return;
    setLoading(true); setErr("");
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${supabaseUrl}/functions/v1/verify-admin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: pwd }),
      });
      const data = await res.json();
      if (data.success) { setAdminToken(data.token || null); setAuthed(true); }
      else setErr(data.error || "Identifiants incorrects");
    } catch(e) {
      // Le service verify-admin est indisponible (réseau, fonction non déployée, config manquante).
      // ⚠️ SÉCURITÉ : ce repli ne doit JAMAIS authentifier en production. Avant le 23/07/2026, ce
      // bloc comparait à un identifiant codé en dur (admin@ordomail.fr / admin2025) shipé dans le
      // bundle JS — une porte dérobée exploitable par quiconque lisait le code source. Il n'est
      // désormais accepté qu'en mode démo explicite (VITE_DEMO_MODE=true), jamais sur un simple
      // échec réseau.
      if (isDemoMode && email === DB.admin.email && pwd === DB.admin.password) {
        setAdminToken(null);
        setAuthed(true);
      } else {
        setErr("Service d'authentification indisponible — réessayez ou contactez le support");
      }
    }
    setLoading(false);
  }

  if (!authed) return (
    <div style={{minHeight:"100vh",background:"#0f172a",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Inter',system-ui,sans-serif",padding:24}}>
      <div style={{width:"100%",maxWidth:380}}>
        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{fontSize:40,marginBottom:8}}>🛡️</div>
          <div style={{fontWeight:900,fontSize:22,color:"#fff",marginBottom:4}}>OrdoMail Business</div>
          <div style={{fontSize:13,color:"#475569"}}>Espace administration réservé</div>
        </div>
        <div style={{background:"#1e293b",borderRadius:14,padding:24,boxShadow:"0 24px 60px rgba(0,0,0,0.4)"}}>
          {[["email","Email","email","admin@ordomail.fr",email,setEmail],["password","Mot de passe","password","••••••••",pwd,setPwd]].map(([k,l,t,ph,val,set])=>(
            <div key={k} style={{marginBottom:14}}>
              <label style={{fontSize:11,fontWeight:700,color:"#64748b",display:"block",marginBottom:6,textTransform:"uppercase"}}>{l}</label>
              <input type={t} value={val} onChange={e=>set(e.target.value)} onKeyDown={e=>e.key==="Enter"&&authenticate()} placeholder={ph}
                style={{width:"100%",padding:"10px 12px",background:"#0f172a",border:"1px solid #334155",borderRadius:8,color:"#fff",fontSize:14,outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}/>
            </div>
          ))}
          {err && <div style={{background:"#450a0a",border:"1px solid #7f1d1d",borderRadius:8,padding:"8px 12px",color:"#fca5a5",fontSize:12,marginBottom:12}}>{err}</div>}
          <button onClick={authenticate} disabled={!email||!pwd||loading}
            style={{width:"100%",padding:"11px",border:"none",borderRadius:9,background:!email||!pwd||loading?"#1e3a5f":"#3b82f6",color:"#fff",fontWeight:800,fontSize:14,cursor:!email||!pwd||loading?"not-allowed":"pointer",fontFamily:"inherit"}}>
            {loading ? "Vérification…" : "Accéder →"}
          </button>
        </div>
        <div style={{textAlign:"center",marginTop:14}}>
          <button onClick={onBack} style={{background:"none",border:"none",color:"#475569",fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>← Retour au site</button>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",fontFamily:"'Inter',system-ui,sans-serif",background:"#0f172a"}}>
      <header style={{background:"#1e293b",borderBottom:"1px solid #334155",height:52,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 20px",position:"sticky",top:0,zIndex:100}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span>💊</span>
          <span style={{fontWeight:900,fontSize:15,color:"#fff"}}>OrdoMail</span>
          <span style={{fontSize:10,fontWeight:700,color:"#64748b",background:"#0f172a",padding:"2px 8px",borderRadius:6}}>BUSINESS ADMIN</span>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={onBack} style={{background:"rgba(255,255,255,0.07)",border:"1px solid #334155",color:"#94a3b8",padding:"5px 14px",borderRadius:7,cursor:"pointer",fontSize:12,fontFamily:"inherit"}}>← Site</button>
          <button onClick={()=>{ setAuthed(false); setAdminToken(null); }} style={{background:"rgba(255,255,255,0.05)",border:"1px solid #1e293b",color:"#475569",padding:"5px 12px",borderRadius:7,cursor:"pointer",fontSize:12,fontFamily:"inherit"}}>Déconnexion</button>
        </div>
      </header>
      <AdminDashboardLive adminToken={adminToken}/>
    </div>
  );
}

function StoriesContentAdmin() {
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
  const sb = getSupabaseClient();

  const TYPES = [
    { id:"info",    label:"Information",  emoji:"💡", color:"#1a3a6e" },
    { id:"conseil", label:"Conseil santé",emoji:"💊", color:"#15803d" },
    { id:"quiz",    label:"Quiz",         emoji:"🧠", color:"#6d28d9" },
  ];

  useEffect(() => { loadItems(); }, []);

  async function loadItems() {
    setLoading(true);
    if (!sb) { setLoading(false); return; }
    const { data } = await sb.from("stories_content").select("*").order("created_at", { ascending: false });
    if (data) setItems(data);
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
    const payload = {
      type: form.type, titre: form.titre, contenu: form.contenu,
      emoji: form.emoji, question: form.question,
      reponses: form.reponses, explication: form.explication, actif: form.actif,
    };
    if (editing) {
      await sb.from("stories_content").update(payload).eq("id", editing);
      setItems(prev => prev.map(x => x.id === editing ? { ...x, ...payload } : x));
    } else {
      const { data } = await sb.from("stories_content").insert(payload).select().single();
      if (data) setItems(prev => [data, ...prev]);
    }
    setShowForm(false); setSaving(false); setEditing(null);
  }

  async function deleteItem(id) {
    if (!window.confirm("Supprimer ce contenu ?")) return;
    await sb.from("stories_content").delete().eq("id", id);
    setItems(prev => prev.filter(x => x.id !== id));
  }

  async function toggleActif(id, actif) {
    await sb.from("stories_content").update({ actif: !actif }).eq("id", id);
    setItems(prev => prev.map(x => x.id === id ? { ...x, actif: !actif } : x));
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

function HistoriqueSparkline({ pharmacieId }) {
  const [data,   setData]   = useState([]);
  const [metric, setMetric] = useState("ordos_jour");
  const [period, setPeriod] = useState(30);
  const [loading, setLoading] = useState(true);

  const METRICS = [
    { id:"ordos_jour",       label:"Ordos/jour",      color:"#60a5fa" },
    { id:"taux_traitement",  label:"Taux traitement",  color:"#4ade80" },
    { id:"score_activite",   label:"Score activité",   color:"#a78bfa" },
    { id:"canal_qr_pct",     label:"% QR code",        color:"#fbbf24" },
  ];

  useEffect(() => {
    setLoading(true);
    fetchHistoriqueMetriques(pharmacieId, period).then(d => {
      setData(d);
      setLoading(false);
    });
  }, [pharmacieId, period]);

  const currentMetric = METRICS.find(m => m.id === metric);
  const values = data.map(d => d[metric] || 0);
  const maxVal  = Math.max(...values, 1);
  const minVal  = Math.min(...values, 0);
  const range   = maxVal - minVal || 1;
  const avg     = values.length ? Math.round(values.reduce((a,b)=>a+b,0)/values.length) : 0;
  const last    = values[values.length-1] || 0;
  const trend   = values.length > 1 ? last - values[values.length-2] : 0;

  // SVG sparkline
  const W = 600, H = 80;
  const pts = values.map((v,i) => {
    const x = values.length > 1 ? (i/(values.length-1))*W : W/2;
    const y = H - ((v-minVal)/range)*(H-8) - 4;
    return `${x},${y}`;
  }).join(" ");

  return (
    <div style={{padding:"0 24px 20px"}}>
      <div style={{background:"#0f172a",borderRadius:12,padding:16}}>
        {/* Header */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
          <div style={{fontSize:11,fontWeight:700,color:"#64748b",letterSpacing:1,textTransform:"uppercase"}}>
            📈 Historique {period} jours
          </div>
          <div style={{display:"flex",gap:6}}>
            {[7,14,30,90].map(p => (
              <button key={p} onClick={()=>setPeriod(p)}
                style={{padding:"3px 10px",border:`1px solid ${period===p?"#60a5fa":"#334155"}`,borderRadius:20,
                  background:period===p?"#1e40af":"transparent",color:period===p?"#fff":"#64748b",
                  fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>
                {p}j
              </button>
            ))}
          </div>
        </div>

        {/* Sélecteur métrique */}
        <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>
          {METRICS.map(m => (
            <button key={m.id} onClick={()=>setMetric(m.id)}
              style={{padding:"4px 12px",border:`1px solid ${metric===m.id?m.color:"#334155"}`,borderRadius:20,
                background:metric===m.id?m.color+"22":"transparent",
                color:metric===m.id?m.color:"#64748b",
                fontSize:11,fontWeight:metric===m.id?700:400,cursor:"pointer",fontFamily:"inherit"}}>
              {m.label}
            </button>
          ))}
        </div>

        {/* Stats rapides */}
        <div style={{display:"flex",gap:20,marginBottom:14}}>
          {[
            { label:"Dernière valeur", value:last, suffix:currentMetric?.id.includes("pct")||currentMetric?.id.includes("taux")?"%" :currentMetric?.id==="score_activite"?"/100":"" },
            { label:"Moyenne",         value:avg,  suffix:"" },
            { label:"Tendance",        value:trend>=0?`+${trend}`:trend, suffix:"", color:trend>=0?"#4ade80":"#f87171" },
            { label:"Max",             value:maxVal, suffix:"" },
          ].map(s => (
            <div key={s.label}>
              <div style={{fontSize:20,fontWeight:900,color:s.color||currentMetric?.color||"#60a5fa"}}>{s.value}{s.suffix}</div>
              <div style={{fontSize:10,color:"#475569"}}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Graphique SVG */}
        {loading ? (
          <div style={{height:80,display:"flex",alignItems:"center",justifyContent:"center",color:"#475569",fontSize:12}}>Chargement…</div>
        ) : data.length === 0 ? (
          <div style={{height:80,display:"flex",alignItems:"center",justifyContent:"center",color:"#475569",fontSize:12}}>
            Aucune donnée — cliquez sur 📸 Snapshot pour initialiser
          </div>
        ) : (
          <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{display:"block",height:80}}>
            {/* Grille */}
            {[0,25,50,75,100].map(pct => (
              <line key={pct} x1={0} y1={H-(pct/100)*H} x2={W} y2={H-(pct/100)*H} stroke="#1e293b" strokeWidth={1}/>
            ))}
            {/* Zone remplie */}
            <defs>
              <linearGradient id={`grad-${metric}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={currentMetric?.color||"#60a5fa"} stopOpacity="0.3"/>
                <stop offset="100%" stopColor={currentMetric?.color||"#60a5fa"} stopOpacity="0"/>
              </linearGradient>
            </defs>
            <polygon
              points={`0,${H} ${pts} ${W},${H}`}
              fill={`url(#grad-${metric})`}/>
            {/* Ligne */}
            <polyline
              points={pts}
              fill="none"
              stroke={currentMetric?.color||"#60a5fa"}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"/>
            {/* Points */}
            {values.map((v,i) => {
              const x = values.length>1 ? (i/(values.length-1))*W : W/2;
              const y = H - ((v-minVal)/range)*(H-8) - 4;
              return <circle key={i} cx={x} cy={y} r={3} fill={currentMetric?.color||"#60a5fa"}/>;
            })}
          </svg>
        )}

        {/* Labels dates */}
        {data.length > 0 && (
          <div style={{display:"flex",justifyContent:"space-between",marginTop:6}}>
            <span style={{fontSize:10,color:"#334155"}}>{data[0]?.date}</span>
            <span style={{fontSize:10,color:"#334155"}}>{data[data.length-1]?.date}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function AdminDashboardLive({ adminToken } = {}) {
  const [tab,      setTab]      = useState("clients");
  const [clients,  setClients]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState("");
  const [selected, setSelected] = useState(null);
  const [saving,   setSaving]   = useState(false);
  const [msg,      setMsg]      = useState("");
  const [metrics,  setMetrics]  = useState(null); // métriques globales

  const PLANS = {
    starter:  { label:"Starter",  prix:19,  maxPostes:2,   color:"#0369a1" },
    standard: { label:"Standard", prix:39,  maxPostes:5,   color:"#1a3a6e" },
    pro:      { label:"Pro",      prix:79,  maxPostes:15,  color:"#4c1d95" },
    premium:  { label:"Premium",  prix:119, maxPostes:999, color:"#b45309" },
  };

  useEffect(() => { loadClients(); }, []);

  async function loadClients() {
    setLoading(true);
    if (isDemoMode) {
      const db = window._ordomailDB;
      const pharmacies = db?.pharmacies || [];
      const enriched = pharmacies.map(p => ({
        ...p,
        postesActifs:  (p.postes||[]).filter(x=>x.actif).length,
        postesTotal:   (p.postes||[]).length,
        ordos_total:   (p.ordonnances||[]).length,
        ordos_mois:    Math.floor(Math.random()*80)+10,
        ordos_semaine: Math.floor(Math.random()*20)+2,
        ordos_attente: Math.floor(Math.random()*5),
        taux_traitement: Math.floor(Math.random()*30)+70,
        delai_moyen_min: Math.floor(Math.random()*8)+1,
        canal_qr_pct:  Math.floor(Math.random()*60)+30,
        canal_email_pct: Math.floor(Math.random()*40)+10,
        last_login:    new Date(Date.now() - Math.random()*7*86400000).toISOString(),
        last_ordo:     new Date(Date.now() - Math.random()*3*86400000).toISOString(),
        score_activite: Math.floor(Math.random()*40)+60,
        offres_actives: Math.floor(Math.random()*3),
        pins_configures: Math.floor(Math.random()*3)+1,
        trial_ends_at: null,
      }));
      setClients(enriched);
      computeGlobalMetrics(enriched);
      setLoading(false);
      return;
    }
    try {
      // Route via secure-data (jeton admin) — l'ancien .select("*, postes(*)") en clé anon
      // renvoyait, entre autres, les PIN de vente en clair de toutes les pharmacies à
      // quiconque savait appeler l'API REST Supabase, connecté ou non au backoffice.
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const res = await fetch(`${supabaseUrl}/functions/v1/secure-data`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": supabaseKey,
          "Authorization": `Bearer ${adminToken || ""}`,
        },
        body: JSON.stringify({ resource: "admin_pharmacies" }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `secure-data ${res.status}`);
      const enriched = body.data || [];

      setClients(enriched);
      computeGlobalMetrics(enriched);
    } catch(e) { console.error(e); }
    setLoading(false);
  }

  function computeGlobalMetrics(data) {
    const actifs = data.filter(c => (c.ordos_mois||0) > 0);
    const mrr    = data.reduce((s,c) => s + (PLANS[c.plan]?.prix||0), 0);
    const arr    = mrr * 12;
    const total_ordos_mois = data.reduce((s,c) => s + (c.ordos_mois||0), 0);
    const churn_risk = data.filter(c => (c.score_activite||0) < 30).length;
    const upsell     = data.filter(c => c.plan === "starter" && (c.ordos_mois||0) > 150).length;
    setMetrics({ mrr, arr, total_ordos_mois, churn_risk, upsell, actifs: actifs.length, total: data.length });
  }

  function scoreColor(s) { return s>=70?"#15803d":s>=40?"#f59e0b":"#dc2626"; }
  function scoreBg(s)    { return s>=70?"#f0fdf4":s>=40?"#fef9f0":"#fff5f5"; }

  const filtered = clients.filter(c =>
    c.nom?.toLowerCase().includes(search.toLowerCase()) ||
    c.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{minHeight:"100vh",background:"#0f172a",fontFamily:"'Inter',system-ui,sans-serif",color:"#e2e8f0"}}>
      {/* Header */}
      <div style={{background:"#1e293b",borderBottom:"1px solid #334155",padding:"16px 24px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <span style={{fontSize:22}}>💊</span>
          <div>
            <div style={{fontWeight:900,fontSize:18,color:"#fff"}}>OrdoMail Admin</div>
            <div style={{fontSize:11,color:"#64748b"}}>Tableau de bord opérateur</div>
          </div>
        </div>
        <div style={{fontSize:11,color:"#64748b"}}>{new Date().toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long"})}</div>
      </div>

      <div style={{padding:24}}>

        {/* KPIs globaux */}
        {metrics && (
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:12,marginBottom:24}}>
            {[
              { label:"MRR",          value:`${metrics.mrr}€`,    sub:"revenu mensuel",    icon:"💰", color:"#4ade80" },
              { label:"ARR",          value:`${metrics.arr}€`,    sub:"revenu annuel",     icon:"📈", color:"#60a5fa" },
              { label:"Clients",      value:metrics.total,        sub:"pharmacies",        icon:"🏥", color:"#a78bfa" },
              { label:"Actifs/mois",  value:metrics.actifs,       sub:"avec activité",     icon:"✅", color:"#34d399" },
              { label:"Ordos/mois",   value:metrics.total_ordos_mois, sub:"total réseau", icon:"📋", color:"#fbbf24" },
              { label:"Risque churn", value:metrics.churn_risk,   sub:"score < 30",        icon:"⚠️", color:"#f87171" },
              { label:"Upsell",       value:metrics.upsell,       sub:"Starter saturés",   icon:"🚀", color:"#fb923c" },
            ].map(k => (
              <div key={k.label} style={{background:"#1e293b",border:"1px solid #334155",borderRadius:12,padding:"14px 16px"}}>
                <div style={{fontSize:18,marginBottom:4}}>{k.icon}</div>
                <div style={{fontSize:22,fontWeight:900,color:k.color}}>{k.value}</div>
                <div style={{fontSize:10,color:"#64748b",fontWeight:700,textTransform:"uppercase",letterSpacing:0.5}}>{k.label}</div>
                <div style={{fontSize:10,color:"#475569"}}>{k.sub}</div>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div style={{display:"flex",gap:8,marginBottom:20}}>
          {[["clients","👥 Clients"],["contrats","📋 Contrats"],["stories","📱 Stories"],["tarifs","🏷️ Tarifs"]].map(([k,l]) => (
            <button key={k} onClick={()=>{setTab(k);setSelected(null);}}
              style={{padding:"7px 16px",border:"none",borderRadius:8,cursor:"pointer",fontFamily:"inherit",fontSize:13,
                fontWeight:tab===k?700:500,
                background:tab===k?"#3b82f6":"#1e293b",
                color:tab===k?"#fff":"#94a3b8",
                outline:`1px solid ${tab===k?"#3b82f6":"#334155"}`}}>
              {l}
            </button>
          ))}
          <button onClick={loadClients}
            style={{marginLeft:"auto",padding:"7px 14px",border:"1px solid #334155",borderRadius:8,background:"#1e293b",color:"#64748b",fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>
            🔄 Actualiser
          </button>
        </div>

        {loading && <div style={{textAlign:"center",padding:48,color:"#64748b"}}>⏳ Chargement…</div>}

        {!loading && tab === "clients" ? (
          selected ? (
            /* ── Détail client ── */
            <ClientDetail client={selected} plans={PLANS} onClose={()=>setSelected(null)} onRefresh={loadClients}/>
          ) : (
            /* ── Liste clients ── */
            <div>
              <input value={search} onChange={e=>setSearch(e.target.value)}
                placeholder="🔍 Rechercher pharmacie ou email…"
                style={{width:"100%",padding:"10px 14px",background:"#1e293b",border:"1px solid #334155",borderRadius:9,color:"#fff",fontSize:13,outline:"none",fontFamily:"inherit",marginBottom:16,boxSizing:"border-box"}}/>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {filtered.map(ph => (
                  <div key={ph.id} onClick={()=>setSelected(ph)}
                    style={{background:"#1e293b",border:`1px solid ${(ph.ordos_attente||0)>0?"#f59e0b":"#334155"}`,borderRadius:12,padding:"14px 18px",cursor:"pointer",transition:"border 0.15s"}}>
                    <div style={{display:"flex",alignItems:"center",gap:14}}>
                      {/* Avatar */}
                      <div style={{width:44,height:44,borderRadius:11,background:ph.couleur||"#1a3a6e",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>💊</div>
                      {/* Infos */}
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
                          <span style={{fontWeight:800,fontSize:15,color:"#fff"}}>{ph.nom}</span>
                          <span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:20,background:PLANS[ph.plan]?.color||"#334155",color:"#fff"}}>{PLANS[ph.plan]?.label||ph.plan}</span>
                          {ph.trial_ends_at && new Date(ph.trial_ends_at)>new Date() && (
                            <span style={{fontSize:10,background:"#fef3c7",color:"#92400e",borderRadius:20,padding:"2px 8px",fontWeight:700}}>
                              Trial · {Math.ceil((new Date(ph.trial_ends_at)-new Date())/86400000)}j
                            </span>
                          )}
                          {(ph.ordos_attente||0)>0 && (
                            <span style={{fontSize:10,background:"#f59e0b",color:"#fff",borderRadius:20,padding:"2px 8px",fontWeight:700}}>
                              ⚠️ {ph.ordos_attente} en attente
                            </span>
                          )}
                        </div>
                        <div style={{fontSize:11,color:"#64748b"}}>{ph.email}</div>
                      </div>
                      {/* Métriques rapides */}
                      <div style={{display:"flex",gap:16,alignItems:"center",flexShrink:0}}>
                        <div style={{textAlign:"center"}}>
                          <div style={{fontSize:18,fontWeight:900,color:"#60a5fa"}}>{ph.ordos_mois||0}</div>
                          <div style={{fontSize:9,color:"#475569"}}>ordos/mois</div>
                        </div>
                        <div style={{textAlign:"center"}}>
                          <div style={{fontSize:18,fontWeight:900,color:"#4ade80"}}>{ph.taux_traitement||0}%</div>
                          <div style={{fontSize:9,color:"#475569"}}>traité</div>
                        </div>
                        <div style={{textAlign:"center"}}>
                          <div style={{fontSize:18,fontWeight:900,color:scoreColor(ph.score_activite||0)}}>{ph.score_activite||0}</div>
                          <div style={{fontSize:9,color:"#475569"}}>score</div>
                        </div>
                        <div style={{fontSize:11,color:"#475569"}}>→</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        ) : tab === "stories" ? (
          <StoriesContentAdmin/>
        ) : tab === "tarifs" ? (
          <PricingEditor adminToken={adminToken}/>
        ) : (
          selected ? (
            <ContratEditor
              pharmacie={selected}
              plans={PLANS}
              onSave={async (id,plan,postes)=>{
                setSaving(true);
                try {
                  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
                  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
                  await fetch(`${supabaseUrl}/functions/v1/secure-data`, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      "apikey": supabaseKey,
                      "Authorization": `Bearer ${adminToken || ""}`,
                    },
                    body: JSON.stringify({ resource: "admin_update_plan", params: { pharmacieId: id, plan } }),
                  });
                  setMsg("✅ Contrat mis à jour");
                } catch(e) {
                  setMsg("❌ Erreur : " + e.message);
                }
                setSaving(false);
                setTimeout(()=>setMsg(""),3000);
                loadClients();
              }}
              onClose={()=>setSelected(null)}
              saving={saving}
              msg={msg}
              onClearMsg={()=>setMsg("")}
            />
          ) : (
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {filtered.map(ph=>(
                <div key={ph.id} onClick={()=>setSelected(ph)}
                  style={{background:"#1e293b",border:"1px solid #334155",borderRadius:12,padding:"14px 18px",cursor:"pointer",display:"flex",alignItems:"center",gap:14}}>
                  <div style={{width:40,height:40,borderRadius:10,background:ph.couleur||"#1a3a6e",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>💊</div>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:700,color:"#fff"}}>{ph.nom}</div>
                    <div style={{fontSize:12,color:"#64748b"}}>{ph.email} · {PLANS[ph.plan]?.label||ph.plan} · {PLANS[ph.plan]?.prix||0}€/mois</div>
                  </div>
                  <div style={{fontSize:11,color:"#475569"}}>Modifier →</div>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}

function ClientDetail({ client: ph, plans, onClose, onRefresh }) {
  const planInfo = plans[ph.plan] || {};
  const trialLeft = ph.trial_ends_at ? Math.ceil((new Date(ph.trial_ends_at)-new Date())/86400000) : null;
  const scoreColor = (s) => s>=70?"#4ade80":s>=40?"#fbbf24":"#f87171";
  const scoreBg    = (s) => s>=70?"rgba(74,222,128,0.1)":s>=40?"rgba(251,191,36,0.1)":"rgba(248,113,113,0.1)";

  return (
    <div style={{background:"#1e293b",borderRadius:16,border:"1px solid #334155",overflow:"hidden"}}>
      {/* Header client */}
      <div style={{padding:"20px 24px",borderBottom:"1px solid #334155",display:"flex",alignItems:"center",gap:16}}>
        <div style={{width:52,height:52,borderRadius:14,background:ph.couleur||"#1a3a6e",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24}}>💊</div>
        <div style={{flex:1}}>
          <div style={{fontWeight:900,fontSize:20,color:"#fff"}}>{ph.nom}</div>
          <div style={{fontSize:13,color:"#64748b"}}>{ph.email} · {ph.adresse}</div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <span style={{padding:"4px 12px",borderRadius:20,background:planInfo.color||"#334155",color:"#fff",fontSize:12,fontWeight:700}}>{planInfo.label||ph.plan}</span>
          {trialLeft > 0 && <span style={{padding:"4px 12px",borderRadius:20,background:"#fef3c7",color:"#92400e",fontSize:12,fontWeight:700}}>Trial · {trialLeft}j restants</span>}
          {trialLeft <= 0 && ph.trial_ends_at && <span style={{padding:"4px 12px",borderRadius:20,background:"#fee2e2",color:"#dc2626",fontSize:12,fontWeight:700}}>Trial expiré</span>}
        </div>
        <button onClick={onClose} style={{background:"#0f172a",border:"1px solid #334155",color:"#64748b",padding:"6px 14px",borderRadius:8,cursor:"pointer",fontFamily:"inherit",fontSize:12}}>← Retour</button>
        <button onClick={()=>snapshotMetriquesJournalieres()} style={{background:"#1e40af",border:"none",color:"#fff",padding:"6px 14px",borderRadius:8,cursor:"pointer",fontFamily:"inherit",fontSize:12}}>
          📸 Snapshot
        </button>
      </div>

      {/* Graphique historique 30 jours */}
      <HistoriqueSparkline pharmacieId={ph.id}/>

      <div style={{padding:"0 24px 24px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>

        {/* ── Colonne gauche ── */}
        <div style={{display:"flex",flexDirection:"column",gap:16}}>

          {/* Score global */}
          <div style={{background:scoreBg(ph.score_activite||0),border:`1px solid ${scoreColor(ph.score_activite||0)}33`,borderRadius:12,padding:16,textAlign:"center"}}>
            <div style={{fontSize:11,fontWeight:700,color:"#94a3b8",letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>Score d'activité</div>
            <div style={{fontSize:52,fontWeight:900,color:scoreColor(ph.score_activite||0),lineHeight:1}}>{ph.score_activite||0}</div>
            <div style={{fontSize:11,color:"#64748b",marginTop:4}}>/100 · {(ph.score_activite||0)>=70?"🟢 Engagé":(ph.score_activite||0)>=40?"🟡 Modéré":"🔴 Risque churn"}</div>
          </div>

          {/* Métriques volume */}
          <div style={{background:"#0f172a",borderRadius:12,padding:16}}>
            <div style={{fontSize:11,fontWeight:700,color:"#64748b",letterSpacing:1,textTransform:"uppercase",marginBottom:12}}>📋 Volume ordonnances</div>
            {[
              ["Ce mois",    ph.ordos_mois||0,    "#60a5fa"],
              ["Cette semaine", ph.ordos_semaine||0, "#a78bfa"],
              ["Total",      ph.ordos_total||0,   "#94a3b8"],
              ["En attente", ph.ordos_attente||0, (ph.ordos_attente||0)>0?"#f87171":"#4ade80"],
            ].map(([label, val, color]) => (
              <div key={label} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <span style={{fontSize:13,color:"#94a3b8"}}>{label}</span>
                <span style={{fontSize:18,fontWeight:900,color}}>{val}</span>
              </div>
            ))}
          </div>

          {/* Canaux */}
          <div style={{background:"#0f172a",borderRadius:12,padding:16}}>
            <div style={{fontSize:11,fontWeight:700,color:"#64748b",letterSpacing:1,textTransform:"uppercase",marginBottom:12}}>📡 Canaux d'envoi (30j)</div>
            {[
              ["📱 QR Code",  ph.canal_qr_pct||0,    "#4ade80"],
              ["✉️ Email",    ph.canal_email_pct||0,  "#60a5fa"],
              ["⬇️ Upload",   100-(ph.canal_qr_pct||0)-(ph.canal_email_pct||0), "#a78bfa"],
            ].map(([label, pct, color]) => (
              <div key={label} style={{marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                  <span style={{fontSize:12,color:"#94a3b8"}}>{label}</span>
                  <span style={{fontSize:12,fontWeight:700,color}}>{Math.max(0,pct)}%</span>
                </div>
                <div style={{height:6,background:"#1e293b",borderRadius:3,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${Math.max(0,pct)}%`,background:color,borderRadius:3,transition:"width 0.5s"}}/>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Colonne droite ── */}
        <div style={{display:"flex",flexDirection:"column",gap:16}}>

          {/* Performance */}
          <div style={{background:"#0f172a",borderRadius:12,padding:16}}>
            <div style={{fontSize:11,fontWeight:700,color:"#64748b",letterSpacing:1,textTransform:"uppercase",marginBottom:12}}>⚡ Performance</div>
            {[
              ["Taux de traitement", `${ph.taux_traitement||0}%`,  (ph.taux_traitement||0)>=80?"#4ade80":"#f87171"],
              ["Ordos en attente +24h", ph.ordos_attente||0,       (ph.ordos_attente||0)===0?"#4ade80":"#f87171"],
              ["Postes actifs",     `${ph.postesActifs||0}/${planInfo.maxPostes||"∞"}`, "#60a5fa"],
              ["PINs configurés",   ph.pins_configures||0,          "#a78bfa"],
              ["Offres stories actives", ph.offres_actives||0,      "#fbbf24"],
            ].map(([label, val, color]) => (
              <div key={label} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <span style={{fontSize:12,color:"#94a3b8"}}>{label}</span>
                <span style={{fontSize:15,fontWeight:900,color}}>{val}</span>
              </div>
            ))}
          </div>

          {/* Commercial */}
          <div style={{background:"#0f172a",borderRadius:12,padding:16}}>
            <div style={{fontSize:11,fontWeight:700,color:"#64748b",letterSpacing:1,textTransform:"uppercase",marginBottom:12}}>💰 Commercial</div>
            {[
              ["Plan actuel",  `${planInfo.label||ph.plan} · ${planInfo.prix||0}€/mois`, "#fff"],
              ["MRR client",   `${planInfo.prix||0}€`,   "#4ade80"],
              ["ARR client",   `${(planInfo.prix||0)*12}€`, "#60a5fa"],
              ["Membre depuis", new Date(ph.created_at||Date.now()).toLocaleDateString("fr-FR"), "#94a3b8"],
            ].map(([label, val, color]) => (
              <div key={label} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <span style={{fontSize:12,color:"#94a3b8"}}>{label}</span>
                <span style={{fontSize:13,fontWeight:700,color}}>{val}</span>
              </div>
            ))}
          </div>

          {/* Alertes & opportunités */}
          <div style={{background:"#0f172a",borderRadius:12,padding:16}}>
            <div style={{fontSize:11,fontWeight:700,color:"#64748b",letterSpacing:1,textTransform:"uppercase",marginBottom:12}}>🎯 Alertes & Opportunités</div>
            {(ph.ordos_attente||0) > 2 && (
              <div style={{background:"rgba(248,113,113,0.1)",border:"1px solid #f8717133",borderRadius:8,padding:"8px 12px",marginBottom:8,fontSize:12,color:"#fca5a5"}}>
                ⚠️ {ph.ordos_attente} ordonnances non traitées depuis +24h
              </div>
            )}
            {ph.plan==="starter" && (ph.ordos_mois||0)>150 && (
              <div style={{background:"rgba(251,191,36,0.1)",border:"1px solid #fbbf2433",borderRadius:8,padding:"8px 12px",marginBottom:8,fontSize:12,color:"#fde68a"}}>
                🚀 Volume élevé — opportunité d'upgrade Standard
              </div>
            )}
            {(ph.score_activite||0) < 30 && (
              <div style={{background:"rgba(248,113,113,0.1)",border:"1px solid #f8717133",borderRadius:8,padding:"8px 12px",marginBottom:8,fontSize:12,color:"#fca5a5"}}>
                🔴 Faible activité — risque de churn
              </div>
            )}
            {(ph.pins_configures||0) === 0 && (ph.postesActifs||0) > 0 && (
              <div style={{background:"rgba(96,165,250,0.1)",border:"1px solid #60a5fa33",borderRadius:8,padding:"8px 12px",marginBottom:8,fontSize:12,color:"#93c5fd"}}>
                💡 Aucun PIN configuré — proposer la formation vendeur
              </div>
            )}
            {(ph.offres_actives||0) === 0 && (
              <div style={{background:"rgba(167,139,250,0.1)",border:"1px solid #a78bfa33",borderRadius:8,padding:"8px 12px",marginBottom:8,fontSize:12,color:"#c4b5fd"}}>
                🎯 Aucune offre stories créée — potentiel engagement patient
              </div>
            )}
            {(ph.ordos_attente||0)===0 && (ph.score_activite||0)>=70 && (
              <div style={{background:"rgba(74,222,128,0.1)",border:"1px solid #4ade8033",borderRadius:8,padding:"8px 12px",fontSize:12,color:"#86efac"}}>
                ✅ Client sain — aucune action requise
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ContratEditor({ pharmacie, plans, onSave, onClose, saving, msg, onClearMsg }) {
  const [plan,        setPlan]        = useState(pharmacie.plan || "starter");
  const [postesActifs, setPostesActifs] = useState(pharmacie.postesActifs || 1);

  const currentPlan = plans[plan];
  const maxPostes   = currentPlan?.maxPostes || 1;
  const prix        = currentPlan?.prix || 0;
  const oldPlan     = plans[pharmacie.plan];
  const delta       = prix - (oldPlan?.prix || 0);

  return (
    <div style={{background:"#1e293b",borderRadius:16,padding:24,border:"1px solid #334155"}}>
      {/* Header client */}
      <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:24,paddingBottom:16,borderBottom:"1px solid #334155"}}>
        <div style={{width:48,height:48,borderRadius:12,background:pharmacie.couleur||"#1a3a6e",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>💊</div>
        <div style={{flex:1}}>
          <div style={{fontWeight:900,fontSize:18,color:"#fff"}}>{pharmacie.nom}</div>
          <div style={{fontSize:13,color:"#64748b"}}>{pharmacie.email}</div>
        </div>
        <button onClick={onClose} style={{background:"transparent",border:"1px solid #334155",color:"#64748b",padding:"5px 12px",borderRadius:7,cursor:"pointer",fontFamily:"inherit",fontSize:12}}>← Retour</button>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>

        {/* ── Choix du plan ── */}
        <div>
          <div style={{fontSize:12,fontWeight:700,color:"#94a3b8",marginBottom:12,textTransform:"uppercase",letterSpacing:1}}>Plan tarifaire</div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {Object.entries(plans).map(([key, p]) => (
              <button key={key} onClick={()=>{ setPlan(key); setPostesActifs(Math.min(postesActifs, p.maxPostes)); }}
                style={{padding:"12px 16px",border:`2px solid ${plan===key?"#3b82f6":"#334155"}`,borderRadius:10,background:plan===key?"#1e3a5f":"transparent",cursor:"pointer",fontFamily:"inherit",textAlign:"left",transition:"all 0.15s"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontWeight:700,fontSize:14,color:plan===key?"#93c5fd":"#fff"}}>{p.label}</span>
                  <span style={{fontWeight:900,fontSize:15,color:plan===key?"#3b82f6":"#64748b"}}>{p.prix} €/mois</span>
                </div>
                <div style={{fontSize:11,color:"#64748b",marginTop:3}}>Jusqu'à {p.maxPostes} poste{p.maxPostes>1?"s":""}</div>
              </button>
            ))}
          </div>
        </div>

        {/* ── Postes actifs ── */}
        <div>
          <div style={{fontSize:12,fontWeight:700,color:"#94a3b8",marginBottom:12,textTransform:"uppercase",letterSpacing:1}}>Postes actifs</div>
          <div style={{background:"#0f172a",borderRadius:10,padding:16,marginBottom:12}}>
            <div style={{fontSize:13,color:"#64748b",marginBottom:8}}>Postes actuellement actifs</div>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <button onClick={()=>setPostesActifs(Math.max(1,postesActifs-1))}
                style={{width:32,height:32,border:"1px solid #334155",borderRadius:8,background:"#1e293b",color:"#fff",fontSize:18,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
              <div style={{fontWeight:900,fontSize:28,color:"#fff",minWidth:40,textAlign:"center"}}>{postesActifs}</div>
              <button onClick={()=>setPostesActifs(Math.min(maxPostes,postesActifs+1))}
                style={{width:32,height:32,border:"1px solid #334155",borderRadius:8,background:"#1e293b",color:"#fff",fontSize:18,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
              <span style={{fontSize:12,color:"#64748b"}}>/ {maxPostes} max</span>
            </div>
          </div>

          {/* Postes existants */}
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {(pharmacie.postes || []).map((p, i) => (
              <div key={p.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",background:"#0f172a",borderRadius:8,opacity:i<postesActifs?1:0.4}}>
                <div style={{width:8,height:8,borderRadius:4,background:i<postesActifs?"#10b981":"#334155",flexShrink:0}}/>
                <span style={{fontSize:13,color:i<postesActifs?"#fff":"#64748b",flex:1}}>{p.nom}</span>
                <span style={{fontSize:10,fontWeight:700,color:i<postesActifs?"#10b981":"#475569"}}>{i<postesActifs?"ACTIF":"INACTIF"}</span>
              </div>
            ))}
            {(pharmacie.postes||[]).length === 0 && (
              <div style={{fontSize:12,color:"#475569",textAlign:"center",padding:12}}>Aucun poste configuré</div>
            )}
          </div>
        </div>
      </div>

      {/* Récapitulatif + delta */}
      <div style={{marginTop:20,padding:"14px 18px",background:"#0f172a",borderRadius:10,border:"1px solid #334155"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:12,color:"#64748b",marginBottom:2}}>Nouveau contrat</div>
            <div style={{fontWeight:900,fontSize:18,color:"#fff"}}>{currentPlan?.label} — {prix} €/mois · {postesActifs} poste{postesActifs>1?"s":""}</div>
          </div>
          {delta !== 0 && (
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:11,color:"#64748b",marginBottom:2}}>Variation</div>
              <div style={{fontWeight:800,fontSize:16,color:delta>0?"#10b981":"#ef4444"}}>
                {delta>0?"+":""}{delta} €/mois
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Message + bouton */}
      {msg && (
        <div style={{marginTop:12,padding:"10px 14px",background:msg.startsWith("✅")?"#052e16":"#450a0a",border:`1px solid ${msg.startsWith("✅")?"#166534":"#7f1d1d"}`,borderRadius:8,fontSize:13,color:msg.startsWith("✅")?"#86efac":"#fca5a5"}} onClick={onClearMsg}>
          {msg}
        </div>
      )}
      {/* Toggle sonnette */}
      <div style={{marginTop:16,padding:"14px 16px",background:"#1e293b",borderRadius:12,border:"1px solid #334155",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div>
          <div style={{fontWeight:700,fontSize:13,color:"#fff"}}>🔔 Sonnette patient</div>
          <div style={{fontSize:11,color:"#64748b",marginTop:2}}>Appel du patient au comptoir</div>
        </div>
        <button
          onClick={async()=>{
            const newVal = pharmacie.sonnette_active === false ? true : false;
            await updateSonnetteActive(pharmacie.id, newVal);
            pharmacie.sonnette_active = newVal;
            onRefresh();
          }}
          style={{padding:"7px 14px",borderRadius:8,border:"none",cursor:"pointer",fontFamily:"inherit",fontWeight:700,fontSize:13,
            background:pharmacie.sonnette_active!==false?"#14532d":"#450a0a",
            color:pharmacie.sonnette_active!==false?"#86efac":"#fca5a5"}}>
          {pharmacie.sonnette_active!==false?"✅ Activée":"❌ Désactivée"}
        </button>
      </div>

      <button onClick={()=>onSave(pharmacie.id, plan, postesActifs)} disabled={saving}
        style={{width:"100%",marginTop:16,padding:"13px",border:"none",borderRadius:10,background:saving?"#1e3a5f":"#3b82f6",color:"#fff",fontWeight:800,fontSize:15,cursor:saving?"not-allowed":"pointer",fontFamily:"inherit"}}>
        {saving ? "Enregistrement…" : "✅ Valider le contrat"}
      </button>
    </div>
  );
}

function BillingAdmin() {
  const [tab,setTab]=useState("dashboard");
  const [filterStatus,setFilterStatus]=useState("all");
  const activeCount=MOCK_SUBSCRIPTIONS.filter(s=>s.status==="active").length;
  const trialCount=MOCK_SUBSCRIPTIONS.filter(s=>s.status==="trialing").length;
  const mrr=MOCK_SUBSCRIPTIONS.filter(s=>s.status==="active").reduce((s,sub)=>s+sub.mrr,0);

  return (
    <div style={{minHeight:"100vh",background:"#0f172a",fontFamily:"'Inter',system-ui,sans-serif",padding:24}}>
      <div style={{display:"flex",gap:6,marginBottom:24,flexWrap:"wrap"}}>
        {[["dashboard","📊 Dashboard"],["subscriptions","📋 Abonnements"],["invoices","🧾 Factures"],["pricing","🏷️ Pricing"]].map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)} style={{padding:"8px 16px",border:"none",borderRadius:8,cursor:"pointer",fontFamily:"inherit",fontSize:13,fontWeight:tab===k?700:500,background:tab===k?"#3b82f6":"#1e293b",color:tab===k?"#fff":"#64748b"}}>{l}</button>
        ))}
      </div>

      {tab==="dashboard"&&(
        <div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,200px),1fr))",gap:14,marginBottom:24}}>
            {[["MRR",`${mrr} €`,"#3b82f6"],["ARR",`${mrr*12} €`,"#10b981"],["Clients actifs",activeCount,"#6366f1"],["En essai",trialCount,"#f59e0b"]].map(([l,v,color])=>(
              <div key={l} style={{background:"#1e293b",borderRadius:12,padding:20,border:`1px solid #334155`}}>
                <div style={{fontSize:12,color:"#64748b",marginBottom:6}}>{l}</div>
                <div style={{fontWeight:900,fontSize:26,color}}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{background:"#1e293b",borderRadius:12,padding:20,border:"1px solid #334155"}}>
            <div style={{fontWeight:700,fontSize:14,color:"#fff",marginBottom:14}}>Derniers abonnements</div>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
              <thead><tr style={{borderBottom:"1px solid #334155"}}>{["Pharmacie","Plan","MRR","Statut","Renouvellement"].map(h=><th key={h} style={{textAlign:"left",padding:"6px 10px",fontSize:11,fontWeight:700,color:"#64748b",textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
              <tbody>{MOCK_SUBSCRIPTIONS.slice(0,5).map(s=>(
                <tr key={s.id} style={{borderBottom:"1px solid #1e293b"}}>
                  <td style={{padding:"9px 10px",color:"#e2e8f0",fontWeight:600}}>{s.pharmacie}</td>
                  <td style={{padding:"9px 10px"}}><span style={{fontSize:11,fontWeight:700,background:"#334155",color:"#94a3b8",padding:"2px 8px",borderRadius:20}}>{PLAN_LIMITS[s.plan]?.icon} {PLAN_LIMITS[s.plan]?.label}</span></td>
                  <td style={{padding:"9px 10px",fontWeight:700,color:"#10b981"}}>{s.mrr} €</td>
                  <td style={{padding:"9px 10px"}}><span style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:20,background:s.status==="active"?"#dcfce7":s.status==="trialing"?"#dbeafe":"#fee2e2",color:s.status==="active"?"#166534":s.status==="trialing"?"#1d4ed8":"#dc2626"}}>{s.status}</span></td>
                  <td style={{padding:"9px 10px",color:"#64748b",fontSize:12}}>{s.renewal}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      {tab==="subscriptions"&&(
        <div style={{background:"#1e293b",borderRadius:12,padding:20,border:"1px solid #334155"}}>
          <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"}}>
            {[["all","Tous"],["active","Actifs"],["trialing","Essai"],["past_due","Impayés"],["canceled","Annulés"]].map(([k,l])=>(
              <button key={k} onClick={()=>setFilterStatus(k)} style={{padding:"5px 12px",border:`1px solid ${filterStatus===k?"#3b82f6":"#334155"}`,borderRadius:7,background:filterStatus===k?"#3b82f6":"transparent",color:filterStatus===k?"#fff":"#64748b",fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>{l}</button>
            ))}
          </div>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
            <thead><tr style={{borderBottom:"1px solid #334155"}}>{["Pharmacie","Plan","Facturation","MRR","Statut","Renouvellement"].map(h=><th key={h} style={{textAlign:"left",padding:"6px 10px",fontSize:11,fontWeight:700,color:"#64748b",textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
            <tbody>{MOCK_SUBSCRIPTIONS.filter(s=>filterStatus==="all"||s.status===filterStatus).map(s=>(
              <tr key={s.id} style={{borderBottom:"1px solid #0f172a"}}>
                <td style={{padding:"9px 10px",color:"#e2e8f0",fontWeight:600}}>{s.pharmacie}</td>
                <td style={{padding:"9px 10px"}}><span style={{fontSize:11,background:"#334155",color:"#94a3b8",padding:"2px 8px",borderRadius:20,fontWeight:700}}>{PLAN_LIMITS[s.plan]?.icon} {PLAN_LIMITS[s.plan]?.label}</span></td>
                <td style={{padding:"9px 10px",color:"#64748b",fontSize:12,textTransform:"capitalize"}}>{s.billing}</td>
                <td style={{padding:"9px 10px",fontWeight:700,color:"#10b981"}}>{s.mrr} €</td>
                <td style={{padding:"9px 10px"}}><span style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:20,background:s.status==="active"?"#dcfce7":s.status==="trialing"?"#dbeafe":s.status==="past_due"?"#fef9c3":"#fee2e2",color:s.status==="active"?"#166534":s.status==="trialing"?"#1d4ed8":s.status==="past_due"?"#92400e":"#dc2626"}}>{s.status}</span></td>
                <td style={{padding:"9px 10px",color:"#64748b",fontSize:12}}>{s.renewal}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {tab==="invoices"&&(
        <div style={{background:"#1e293b",borderRadius:12,padding:20,border:"1px solid #334155"}}>
          <div style={{fontWeight:700,fontSize:14,color:"#fff",marginBottom:14}}>🧾 Factures</div>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
            <thead><tr style={{borderBottom:"1px solid #334155"}}>{["N°","Date","Description","Montant","Statut",""].map(h=><th key={h} style={{textAlign:"left",padding:"6px 10px",fontSize:11,fontWeight:700,color:"#64748b",textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
            <tbody>{MOCK_INVOICES.map(inv=>{
              const sub=MOCK_SUBSCRIPTIONS.find(s=>s.id===inv.subId);
              return (
                <tr key={inv.id} style={{borderBottom:"1px solid #0f172a"}}>
                  <td style={{padding:"9px 10px",fontFamily:"monospace",fontSize:11,color:"#64748b"}}>{inv.id}</td>
                  <td style={{padding:"9px 10px",color:"#94a3b8"}}>{inv.date}</td>
                  <td style={{padding:"9px 10px",color:"#e2e8f0"}}>{inv.desc}</td>
                  <td style={{padding:"9px 10px",fontWeight:800,color:"#fff"}}>{inv.amount} €</td>
                  <td style={{padding:"9px 10px"}}><span style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:20,background:"#dcfce7",color:"#166534"}}>✓ Payée</span></td>
                  <td style={{padding:"9px 10px",textAlign:"right"}}>
                    <button onClick={()=>openInvoicePDF({...inv,desc:inv.desc},{nom:sub?.pharmacie,email:sub?.email},sub?.plan||"starter")} style={{fontSize:12,color:"#3b82f6",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>📄 PDF</button>
                  </td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}

      {tab==="pricing"&&<PricingEditor/>}
    </div>
  );
}

function BillingModule({ initialView, planId, billing, onBack }) {
  const [view, setView] = useState(initialView||"pricing");
  const [step, setStep] = useState("details");
  const [checkoutPlan, setCheckoutPlan] = useState(planId||"standard");
  const [checkoutBilling, setCheckoutBilling] = useState(billing||"monthly");
  const [billingTab, setBillingTab] = useState("monthly");
  const [form, setForm] = useState({nom:"",email:"",password:"",pharmacie:"",adresse:""});
  const [errors, setErrors] = useState({});
  const [createError, setCreateError] = useState("");
  const [redirecting, setRedirecting] = useState(false);
  const [createdEmail, setCreatedEmail] = useState("");
  const [createdEmailReception, setCreatedEmailReception] = useState("");
  const [createdPlan, setCreatedPlan] = useState("");

  // Retour depuis Stripe Checkout (redirection pleine page — le state React d'avant
  // le départ vers Stripe est perdu, on lit juste le paramètre de retour).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get("checkout");
    if (checkout === "success") {
      window.history.replaceState({}, "", window.location.pathname);
      setView("success");
    } else if (checkout === "cancelled") {
      window.history.replaceState({}, "", window.location.pathname);
      setCreateError("Paiement annulé — votre compte a été créé mais l'abonnement n'a pas démarré. Réessayez ci-dessous.");
      setView("checkout"); setStep("card");
    }
  }, []);

  const plan = PLAN_LIMITS[checkoutPlan]||PLAN_LIMITS.standard;
  const price = checkoutBilling==="annual"?plan.priceAnnual:plan.price;

  if (view==="creating") return (
    <div style={{minHeight:"100vh",background:"linear-gradient(160deg,#1a3a6e,#15623a)",display:"flex",alignItems:"center",justifyContent:"center",padding:24,fontFamily:"'Inter',system-ui,sans-serif"}}>
      <div style={{background:"#fff",borderRadius:20,padding:"40px 36px",maxWidth:440,width:"100%",textAlign:"center",boxShadow:"0 24px 60px rgba(0,0,0,0.25)"}}>
        <div style={{fontSize:48,marginBottom:20,animation:"spin 1s linear infinite",display:"inline-block"}}>⚙️</div>
        <div style={{fontWeight:900,fontSize:22,color:"#0f172a",marginBottom:8}}>Création en cours…</div>
        <div style={{fontSize:14,color:"#64748b"}}>Votre espace est en cours de configuration</div>
      </div>
    </div>
  );

  if (view==="success") return (
    <div style={{minHeight:"100vh",background:"linear-gradient(160deg,#1a3a6e,#15623a)",display:"flex",alignItems:"center",justifyContent:"center",padding:24,fontFamily:"'Inter',system-ui,sans-serif"}}>
      <div style={{background:"#fff",borderRadius:20,padding:"40px 36px",maxWidth:440,width:"100%",textAlign:"center",boxShadow:"0 24px 60px rgba(0,0,0,0.25)"}}>
        <div style={{fontSize:64,marginBottom:16}}>🎉</div>
        <h2 style={{fontWeight:900,fontSize:24,color:"#0f172a",marginBottom:8}}>Compte créé !</h2>
        <p style={{color:"#64748b",fontSize:14,marginBottom:16,lineHeight:1.7}}>
          Essai gratuit 30 jours démarré.<br/>
          Un email de confirmation a été envoyé à<br/>
          <strong style={{color:"#1a3a6e"}}>{createdEmail}</strong>
        </p>
        {createdEmailReception && (
          <div style={{background:"#f0f7ff",border:"1px solid #dbeafe",borderRadius:10,padding:"12px 16px",marginBottom:16,textAlign:"left",fontSize:13}}>
            <div style={{fontWeight:700,color:"#1a3a6e",marginBottom:6}}>📋 Vos informations</div>
            <div style={{color:"#475569",marginBottom:4}}>✉️ Adresse ordonnances :<br/><strong style={{fontFamily:"monospace",fontSize:12}}>{createdEmailReception}</strong></div>
            <div style={{color:"#475569"}}>💳 Plan : <strong>{createdPlan}</strong> — 30 jours gratuits</div>
          </div>
        )}
        <div style={{background:"#fef9c3",border:"1px solid #fde68a",borderRadius:8,padding:"8px 12px",fontSize:12,color:"#92400e",marginBottom:16,textAlign:"left"}}>
          ⚠️ Cliquez le lien dans l'email pour activer votre compte avant de vous connecter.
        </div>
        <button onClick={onBack} style={{width:"100%",padding:14,border:"none",borderRadius:11,background:"#1a3a6e",color:"#fff",fontWeight:800,fontSize:16,cursor:"pointer",fontFamily:"inherit"}}>Aller à la connexion →</button>
      </div>
    </div>
  );

  if (view==="checkout") return (
    <div style={{minHeight:"100vh",background:"#f8fafc",fontFamily:"'Inter',system-ui,sans-serif"}}>
      <PersistentNav onBack={onBack} currentPage="checkout" secure/>
      <div style={{maxWidth:840,margin:"0 auto",padding:"24px 16px",display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,340px),1fr))",gap:18}}>
        <div style={{background:"#fff",borderRadius:16,padding:28,boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
          {step==="details"&&(
            <>
              <h3 style={{fontWeight:800,fontSize:18,color:"#0f172a",marginBottom:22,marginTop:0}}>Informations</h3>
              {[["nom","Votre nom *","text","Dr MARTIN Pierre"],["email","Email *","email","contact@pharmacie.fr"],["password","Mot de passe *","password","8 caractères minimum"],["pharmacie","Pharmacie *","text","Pharmacie de la Paix"],["adresse","Adresse","text","12 rue..."]].map(([k,l,t,ph])=>(
                <div key={k} style={{marginBottom:14}}>
                  <label style={{fontSize:12,fontWeight:700,color:"#374151",display:"block",marginBottom:5}}>{l}</label>
                  <input type={t} placeholder={ph} value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))}
                    style={{width:"100%",padding:"10px 12px",border:`1.5px solid ${errors[k]?"#ef4444":"#e2e8f0"}`,borderRadius:9,fontSize:14,outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}/>
                  {errors[k]&&<div style={{fontSize:12,color:"#ef4444",marginTop:3}}>{errors[k]}</div>}
                </div>
              ))}
              <button onClick={()=>{const e={};if(!form.nom)e.nom="Requis";if(!form.email.includes("@"))e.email="Email invalide";if(!form.pharmacie)e.pharmacie="Requis";setErrors(e);if(!Object.keys(e).length)setStep("card");}}
                style={{width:"100%",padding:12,border:"none",borderRadius:11,background:"#1a3a6e",color:"#fff",fontWeight:800,fontSize:15,cursor:"pointer",fontFamily:"inherit"}}>Continuer →</button>
            </>
          )}
          {step==="card"&&(
            <>
              <h3 style={{fontWeight:800,fontSize:18,color:"#0f172a",marginBottom:6,marginTop:0}}>Paiement</h3>
              <p style={{fontSize:13,color:"#94a3b8",marginBottom:18}}>Débitée uniquement après les 30 jours.</p>
              <div style={{background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:9,padding:"12px 14px",marginBottom:16,fontSize:13,color:"#166534",display:"flex",alignItems:"center",gap:10}}>
                <span style={{fontSize:20}}>🔒</span>
                <span>Le numéro de carte est saisi sur la page sécurisée de Stripe — il ne transite jamais par nos serveurs.</span>
              </div>
              {createError && (
                <div style={{background:"#fee2e2",border:"1px solid #fecaca",borderRadius:8,padding:"9px 12px",marginBottom:12,fontSize:13,color:"#dc2626"}}>⚠️ {createError}</div>
              )}
              <button disabled={redirecting} onClick={async ()=>{
                const e={};
                if(!form.nom) e.nom="Requis";
                if(!form.email||!form.email.includes("@")) e.email="Email invalide";
                if(!form.password||form.password.length<8) e.password="8 caractères minimum";
                if(!form.pharmacie) e.pharmacie="Requis";
                if(Object.keys(e).length){setErrors(e);return;}
                setView("creating");
                try {
                  const sb = getSupabaseClient();
                  // 1. Créer le compte Supabase Auth
                  const { data: authData, error: authErr } = await sb.auth.signUp({
                    email: form.email,
                    password: form.password,
                    options: { emailRedirectTo: window.location.origin }
                  });
                  if (authErr) throw authErr;

                  // 2. Générer slug email réception
                  const slug = form.pharmacie.toLowerCase()
                    .normalize("NFD").replace(/[̀-ͯ]/g,"")
                    .replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,20);
                  const emailReception = slug + "@in.ordomail.fr";

                  // 3. Créer la pharmacie via Edge Function (service_role)
                  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
                  const session = authData?.session;
                  const token = session?.access_token || "";

                  const regRes = await fetch(`${supabaseUrl}/functions/v1/register-pharmacie`, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      ...(token ? { "Authorization": `Bearer ${token}` } : {})
                    },
                    body: JSON.stringify({
                      nom: form.nom,
                      pharmacie: form.pharmacie,
                      adresse: form.adresse || "",
                      email: form.email,
                      plan: checkoutPlan,
                      emailReception,
                    }),
                  });

                  const regData = await regRes.json();
                  if (!regRes.ok && regRes.status !== 409) {
                    // 409 = pharmacie déjà créée (email confirmation pending) = OK
                    throw new Error(regData.error || "Erreur création pharmacie");
                  }

                  // 4. Rediriger vers Stripe Checkout (carte réelle, essai 30 jours)
                  setRedirecting(true);
                  const ckRes = await fetch(`${supabaseUrl}/functions/v1/create-checkout-session`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", ...(token ? { "Authorization": `Bearer ${token}` } : {}) },
                    body: JSON.stringify({
                      pharmacieId: regData.pharmacie_id,
                      plan: checkoutPlan,
                      billing: checkoutBilling,
                      email: form.email,
                      appUrl: window.location.origin,
                    }),
                  });
                  const ckData = await ckRes.json();
                  if (!ckRes.ok || !ckData.url) throw new Error(ckData.error || "Erreur lors de la préparation du paiement");

                  setCreatedEmail(form.email);
                  setCreatedEmailReception(emailReception);
                  setCreatedPlan(checkoutPlan);
                  window.location.href = ckData.url; // quitte l'app vers Stripe Checkout
                } catch(err) {
                  setCreateError(err.message || "Erreur lors de la création");
                  setRedirecting(false);
                  setView("checkout");
                }
              }} style={{width:"100%",padding:12,border:"none",borderRadius:11,background:redirecting?"#94a3b8":"#1a3a6e",color:"#fff",fontWeight:800,fontSize:15,cursor:redirecting?"default":"pointer",fontFamily:"inherit"}}>
                {redirecting ? "Redirection vers Stripe…" : "Continuer vers le paiement sécurisé →"}
              </button>
            </>
          )}
        </div>
        <div style={{background:"#fff",borderRadius:16,padding:20,boxShadow:"0 2px 8px rgba(0,0,0,0.06)",alignSelf:"start"}}>
          <div style={{fontSize:11,fontWeight:700,color:"#94a3b8",letterSpacing:1,marginBottom:12}}>RÉCAPITULATIF</div>
          <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:14,paddingBottom:14,borderBottom:"1px solid #f1f5f9"}}>
            <div style={{width:36,height:36,borderRadius:9,background:`${plan.color}18`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>{plan.icon}</div>
            <div><div style={{fontWeight:800,fontSize:14,color:"#0f172a"}}>OrdoMail {plan.label}</div><div style={{fontSize:12,color:"#94a3b8"}}>{checkoutBilling==="annual"?"Annuel (−20%)":"Mensuel"}</div></div>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><span style={{fontSize:12,color:"#94a3b8"}}>Aujourd'hui</span><span style={{fontSize:12,fontWeight:700,color:"#16a34a"}}>0 € — Gratuit</span></div>
          <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:12,color:"#94a3b8"}}>Après 30 jours</span><span style={{fontSize:12,fontWeight:700,color:"#0f172a"}}>{price} €/mois</span></div>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",background:"#f8fafc",fontFamily:"'Inter',system-ui,sans-serif"}}>
      <PersistentNav onBack={onBack} currentPage="pricing"/>
      <div style={{maxWidth:980,margin:"0 auto",padding:"40px 16px"}}>
        <div style={{textAlign:"center",marginBottom:36}}>
          <h1 style={{fontSize:"clamp(24px,6vw,38px)",fontWeight:900,color:"#0f172a",marginBottom:12}}>Choisissez votre plan</h1>
          <p style={{color:"#64748b",fontSize:16,marginBottom:20}}>30 jours gratuits · Sans carte bancaire</p>
          <div style={{display:"inline-flex",background:"#fff",borderRadius:10,padding:4,gap:4,border:"1px solid #e2e8f0"}}>
            {[["monthly","Mensuel"],["annual","Annuel −20%"]].map(([k,l])=>(
              <button key={k} onClick={()=>setBillingTab(k)} style={{padding:"8px 18px",border:"none",borderRadius:8,cursor:"pointer",fontFamily:"inherit",fontSize:13,fontWeight:billingTab===k?700:500,background:billingTab===k?"#1a3a6e":"transparent",color:billingTab===k?"#fff":"#94a3b8",transition:"all 0.15s"}}>{l}</button>
            ))}
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,280px),1fr))",gap:14,marginBottom:32}}>
          {PLAN_ORDER.map(pid=>{
            const p=PLAN_LIMITS[pid]; const pr=billingTab==="annual"?p.priceAnnual:p.price; const isPopular=pid==="standard";
            return (
              <div key={pid} style={{background:"#fff",borderRadius:16,padding:"24px 20px",border:isPopular?`2px solid ${p.color}`:"2px solid #e2e8f0",position:"relative"}}>
                {isPopular&&<div style={{position:"absolute",top:-12,left:"50%",transform:"translateX(-50%)",background:p.color,color:"#fff",fontSize:10,fontWeight:800,padding:"3px 12px",borderRadius:20}}>LE PLUS CHOISI</div>}
                <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:12}}><span style={{fontSize:20}}>{p.icon}</span><span style={{fontWeight:800,fontSize:17,color:"#0f172a"}}>{p.label}</span></div>
                <div style={{marginBottom:14}}><span style={{fontSize:34,fontWeight:900,color:p.color}}>{pr}</span><span style={{fontSize:13,color:"#94a3b8"}}> €/mois</span></div>
                <button onClick={()=>{setCheckoutPlan(pid);setCheckoutBilling(billingTab);setStep("details");setView("checkout");}}
                  style={{width:"100%",padding:"10px",border:`1.5px solid ${p.color}`,borderRadius:10,background:isPopular?p.color:"transparent",color:isPopular?"#fff":p.color,fontWeight:700,fontSize:14,cursor:"pointer",fontFamily:"inherit",marginBottom:12}}>
                  Commencer gratuitement</button>
                <div style={{fontSize:12,color:"#475569"}}>{p.maxPostes===999?"Postes illimités":`${p.maxPostes} postes`} · {p.maxOrdos===99999?"Volume illimité":`${p.maxOrdos.toLocaleString("fr-FR")} ordo/mois`}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// pricing_plans (Supabase) est la source de vérité durable pour cet éditeur — avant le
// 24/07/2026, "Sauvegarder" ne faisait que muter PLAN_LIMITS en mémoire : un rechargement
// de page perdait tout changement, alors que l'écran affichait "✅ Sauvegardé".
function PricingEditor({ adminToken } = {}) {
  const [plans,setPlans]=useState(()=>Object.entries(PLAN_LIMITS).map(([id,p])=>({...p,id})));
  const [saved,setSaved]=useState(false);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [err,setErr]=useState("");

  async function callSecureData(resource, params) {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    const res = await fetch(`${supabaseUrl}/functions/v1/secure-data`, {
      method: "POST",
      headers: { "Content-Type":"application/json", "apikey":supabaseKey, "Authorization":`Bearer ${adminToken||""}` },
      body: JSON.stringify({ resource, params }),
    });
    const body = await res.json().catch(()=>({}));
    if (!res.ok) throw new Error(body?.error || `secure-data ${resource} : erreur ${res.status}`);
    return body;
  }

  useEffect(() => {
    (async () => {
      try {
        const { data } = await callSecureData("admin_pricing");
        if (data && data.length) {
          setPlans(data.map(p => ({
            id: p.id, label: p.label, icon: p.icon, color: p.color,
            price: p.price, priceAnnual: p.price_annual,
            maxPostes: p.max_postes, maxOrdos: p.max_ordos,
          })));
        }
        // Si la table est vide (première utilisation), on garde les valeurs par défaut
        // de PLAN_LIMITS déjà chargées dans le state initial — rien à faire.
      } catch(e) {
        setErr("Chargement impossible — valeurs par défaut affichées (" + e.message + ")");
      }
      setLoading(false);
    })();
  }, []);

  function update(planId,field,value){setPlans(prev=>prev.map(p=>p.id===planId?{...p,[field]:field.includes("price")||field.includes("max")?Number(value):value}:p));setSaved(false);}

  async function save(){
    setSaving(true); setErr("");
    try {
      await callSecureData("admin_update_pricing", { plans });
      // Répercuter immédiatement dans PLAN_LIMITS pour le reste de l'app dans cette session
      // (dashboard pharmacie, page tarifs) — sans attendre un rechargement.
      plans.forEach(p=>{ PLAN_LIMITS[p.id]={...p}; });
      setSaved(true); setTimeout(()=>setSaved(false),3000);
    } catch(e) {
      setErr("Échec de la sauvegarde : " + e.message);
    }
    setSaving(false);
  }

  return (
    <div style={{maxWidth:900,margin:"0 auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div><div style={{fontWeight:800,fontSize:20,color:"#fff"}}>Éditeur de pricing</div><div style={{fontSize:13,color:"#64748b",marginTop:2}}>{loading?"Chargement…":"Persisté en base — visible par tous les admins"}</div></div>
        <button onClick={save} disabled={loading||saving} style={{padding:"10px 24px",border:"none",borderRadius:10,background:saved?"#15803d":"#3b82f6",color:"#fff",fontWeight:800,fontSize:14,cursor:loading||saving?"default":"pointer",fontFamily:"inherit",opacity:loading||saving?0.6:1}}>{saved?"✅ Sauvegardé":saving?"Sauvegarde…":"💾 Sauvegarder"}</button>
      </div>
      {err && <div style={{background:"#450a0a",border:"1px solid #7f1d1d",borderRadius:8,padding:"8px 12px",color:"#fca5a5",fontSize:12,marginBottom:16}}>{err}</div>}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,260px),1fr))",gap:16,marginBottom:24}}>
        {plans.map(plan=>(
          <div key={plan.id} style={{background:"#1e293b",borderRadius:14,padding:20,border:`2px solid #334155`}}>
            <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:14}}>
              <input value={plan.icon} onChange={e=>update(plan.id,"icon",e.target.value)} style={{width:34,textAlign:"center",background:"#0f172a",border:"1px solid #334155",borderRadius:6,fontSize:18,padding:"3px 4px",color:"#fff"}}/>
              <input value={plan.label} onChange={e=>update(plan.id,"label",e.target.value)} style={{flex:1,background:"#0f172a",border:"1px solid #334155",borderRadius:6,fontSize:15,fontWeight:700,padding:"5px 10px",color:"#fff",fontFamily:"inherit"}}/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
              {[["price","Mensuel €"],["priceAnnual","Annuel €"]].map(([field,lbl])=>(
                <div key={field}><div style={{fontSize:10,color:"#475569",marginBottom:3}}>{lbl}</div>
                  <input type="number" value={plan[field]} onChange={e=>update(plan.id,field,e.target.value)} style={{width:"100%",background:"#0f172a",border:"1px solid #334155",borderRadius:6,padding:"5px 8px",color:plan.color,fontWeight:900,fontSize:16,fontFamily:"monospace",outline:"none"}}/></div>
              ))}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
              {[["maxPostes","Postes"],["maxOrdos","Ordo/mois"]].map(([field,lbl])=>(
                <div key={field}><div style={{fontSize:10,color:"#475569",marginBottom:3}}>{lbl}</div>
                  <input type="number" value={plan[field]} onChange={e=>update(plan.id,field,e.target.value)} style={{width:"100%",background:"#0f172a",border:"1px solid #334155",borderRadius:6,padding:"5px 8px",color:"#e2e8f0",fontWeight:700,fontSize:13,fontFamily:"monospace",outline:"none"}}/></div>
              ))}
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <input type="color" value={plan.color} onChange={e=>update(plan.id,"color",e.target.value)} style={{width:30,height:30,border:"none",cursor:"pointer",borderRadius:5}}/>
              <input value={plan.color} onChange={e=>update(plan.id,"color",e.target.value)} style={{flex:1,background:"#0f172a",border:"1px solid #334155",borderRadius:6,padding:"4px 8px",color:plan.color,fontWeight:700,fontSize:12,fontFamily:"monospace",outline:"none"}}/>
              <div style={{width:26,height:26,borderRadius:7,background:plan.color}}/>
            </div>
          </div>
        ))}
      </div>
      <div style={{background:"#1e293b",borderRadius:12,padding:18,border:"1px solid #334155"}}>
        <div style={{fontSize:11,fontWeight:700,color:"#64748b",letterSpacing:1,marginBottom:14}}>APERÇU TEMPS RÉEL</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,200px),1fr))",gap:12}}>
          {plans.map(plan=>(
            <div key={plan.id} style={{background:"#fff",borderRadius:10,padding:"14px 12px",border:`2px solid ${plan.color}33`}}>
              <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:8}}><span style={{fontSize:16}}>{plan.icon}</span><span style={{fontWeight:800,fontSize:13,color:"#0f172a"}}>{plan.label}</span></div>
              <div style={{fontWeight:900,fontSize:22,color:plan.color}}>{plan.price}<span style={{fontSize:11,fontWeight:400,color:"#94a3b8"}}> €/mois</span></div>
              <div style={{fontSize:11,color:"#64748b",marginTop:3}}>{plan.maxPostes===999?"Illimité":`${plan.maxPostes} postes`}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export { AdminDashboardLive, ClientDetail, StoriesContentAdmin,
  HistoriqueSparkline, ContratEditor, BillingAdmin, BillingModule, PricingEditor, BackofficeAdmin };
export default AdminDashboardLive;