// Extrait de Dashboard.jsx (phase 4) — composant autonome (props + état local
// uniquement). Découpage des gros fichiers, voir DEPLOIEMENT_PHASE2.md/PHASE4.md.
import { useState, useEffect } from "react";
import { getSupabaseClient, isDemoMode, fetchStoryMetrics, callSecureData, subscribeToOffres } from "../supabase.js";
import { fileToBase64 } from "../lib/utils.js";
import { QRCode } from "./QRCode.jsx";
import { OffreTemplatesPanel } from "./OffreTemplatesPanel.jsx";
import { OffreReservationsPanel } from "./OffreReservationsPanel.jsx";

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
  const [form, setForm]           = useState({ type:"promo", titre:"", description:"", emoji:"🎁", badge:"", couleur:"#1a3a6e", actif:true, date_fin:"", image_url:"", lien_url:"", prix:"" });
  const [saving, setSaving]       = useState(false);
  const [uploadingImg, setUploadingImg] = useState(false);
  const [imgError, setImgError]   = useState("");
  const [tab, setTab]             = useState("mes-offres"); // mes-offres | modeles | commandes
  const [mobileQR, setMobileQR]   = useState(null); // { url, expiresAt } | null
  const [mobileQRLoading, setMobileQRLoading] = useState(false);
  const [mobileQRError, setMobileQRError]     = useState("");
  const [epuiseBusyId, setEpuiseBusyId]       = useState(null);
  const sb = getSupabaseClient();

  // Offres mobile (03/09/2026) — une offre publiée depuis le téléphone (ou une
  // rupture signalée) doit apparaître ici sans rafraîchissement manuel. Les
  // événements INSERT/UPDATE/DELETE sont fusionnés dans la liste locale plutôt
  // que de tout recharger à chaque fois.
  useEffect(() => {
    if (!pharmacie?.id || isDemoMode) return;
    return subscribeToOffres(pharmacie.id, ({ eventType, new: row, old }) => {
      setOffres(prev => {
        if (eventType === "INSERT") return prev.some(o => o.id === row.id) ? prev : [row, ...prev];
        if (eventType === "UPDATE") return prev.map(o => o.id === row.id ? { ...o, ...row } : o);
        if (eventType === "DELETE") return prev.filter(o => o.id !== old.id);
        return prev;
      });
    });
  }, [pharmacie?.id]);

  async function genererLienMobile() {
    setMobileQRLoading(true); setMobileQRError("");
    try {
      const { url, expiresInSeconds } = await callSecureData("offre_mint_mobile_token", { appUrl: window.location.origin });
      setMobileQR({ url, expiresAt: Date.now() + expiresInSeconds * 1000 });
    } catch (e) {
      setMobileQRError("Échec de la génération : " + e.message);
    }
    setMobileQRLoading(false);
  }

  async function toggleEpuise(offre) {
    setEpuiseBusyId(offre.id);
    setOffres(prev => prev.map(o => o.id === offre.id ? { ...o, epuise: !o.epuise } : o));
    try {
      if (sb && !isDemoMode) await callSecureData("offre_mark_epuise", { offreId: offre.id, epuise: !offre.epuise });
    } catch (e) {
      // Retour arrière si l'appel échoue — ne pas laisser l'UI mentir sur l'état réel.
      setOffres(prev => prev.map(o => o.id === offre.id ? { ...o, epuise: offre.epuise } : o));
      console.error("[toggleEpuise]", e.message);
    }
    setEpuiseBusyId(null);
  }

  async function handleImageUpload(file) {
    if (!file || isDemoMode) return;
    setUploadingImg(true);
    setImgError("");
    try {
      const fileBase64 = await fileToBase64(file);
      const { url } = await callSecureData("offre_upload_image", { fileName: file.name, fileType: file.type, fileBase64 });
      setForm(f => ({ ...f, image_url: url }));
    } catch (e) {
      setImgError("Échec de l'envoi de l'image : " + e.message);
    }
    setUploadingImg(false);
  }

  const TYPES = [
    { id:"promo",       label:"Promotion",   emoji:"🏷️" },
    { id:"service",     label:"Service",     emoji:"🩺" },
    { id:"fidelite",    label:"Fidélité",    emoji:"🎁" },
    { id:"avis_google", label:"Avis Google", emoji:"⭐" },
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
      actif:offre.actif, date_fin:offre.date_fin||"", image_url:offre.image_url||"",
      lien_url:offre.lien_url||"", prix:offre.prix!=null?String(offre.prix):"" });
    setShowForm(true);
  }

  async function saveOffre() {
    if (!form.titre.trim()) return;
    if (form.type === "avis_google" && !form.lien_url.trim()) return;
    setSaving(true);
    const payload = { ...form, prix: form.prix!==""?Number(form.prix):null, pharmacie_id: pharmacie.id };
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
    setForm({ type:"promo", titre:"", description:"", emoji:"🎁", badge:"", couleur:"#1a3a6e", actif:true, date_fin:"", image_url:"", lien_url:"", prix:"" });
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
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14, flexWrap:"wrap", gap:10 }}>
        <div>
          <div style={{ fontWeight:800, fontSize:15 }}>🎯 Offres & Promotions</div>
          <div style={{ fontSize:12, color:"#64748b", marginTop:2 }}>Affichées dans les stories de vos patients en attente</div>
        </div>
        {tab==="mes-offres" && (
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={()=>{ setMobileQR(null); setMobileQRError(""); genererLienMobile(); }}
              style={{ padding:"8px 14px", border:"1.5px solid #1a3a6e", borderRadius:10, background:"#fff", color:"#1a3a6e", fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>
              📱 Créer depuis mobile
            </button>
            <button onClick={()=>setShowForm(true)}
              style={{ padding:"8px 16px", border:"none", borderRadius:10, background:"#1a3a6e", color:"#fff", fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>
              + Nouvelle offre
            </button>
          </div>
        )}
      </div>

      {/* Sous-onglets */}
      <div style={{ display:"flex", gap:6, marginBottom:18, borderBottom:"1.5px solid #f0f4ff" }}>
        {[["mes-offres","🎯 Mes offres"],["modeles","🗂️ Modèles"],["commandes","🛒 Commandes"]].map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)}
            style={{ padding:"8px 14px", border:"none", borderBottom:tab===k?"2.5px solid #1a3a6e":"2.5px solid transparent",
              background:"none", color:tab===k?"#1a3a6e":"#94a3b8", fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>
            {l}
          </button>
        ))}
      </div>

      {/* Lien magique mobile — QR à scanner, zéro connexion côté téléphone */}
      {mobileQR && (
        <div style={{ background:"#f8faff", border:"1.5px solid #e0e7ff", borderRadius:12, padding:18, marginBottom:18, textAlign:"center" }}>
          <div style={{ fontWeight:700, fontSize:14, marginBottom:4 }}>📱 Scannez pour créer une offre depuis votre téléphone</div>
          <div style={{ fontSize:12, color:"#64748b", marginBottom:14 }}>Aucune connexion nécessaire — l'appareil photo s'ouvre directement. Valable 15 minutes.</div>
          <div style={{ display:"flex", justifyContent:"center", marginBottom:12 }}>
            <QRCode url={mobileQR.url} size={200}/>
          </div>
          <div style={{ display:"flex", gap:8, justifyContent:"center" }}>
            <button onClick={genererLienMobile} disabled={mobileQRLoading}
              style={{ padding:"7px 14px", border:"1.5px solid #e0e7ff", borderRadius:8, background:"#fff", color:"#1a3a6e", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
              {mobileQRLoading?"…":"🔄 Nouveau lien"}
            </button>
            <button onClick={()=>setMobileQR(null)}
              style={{ padding:"7px 14px", border:"1.5px solid #e0e7ff", borderRadius:8, background:"#fff", color:"#64748b", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
              Fermer
            </button>
          </div>
        </div>
      )}
      {mobileQRError && <div style={{ fontSize:12, color:"#dc2626", marginBottom:14 }}>⚠️ {mobileQRError}</div>}

      {tab==="modeles" && <OffreTemplatesPanel onChanged={()=>{}}/>}
      {tab==="commandes" && <OffreReservationsPanel/>}

      {tab==="mes-offres" && <>
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

          {/* Lien vers la page d'avis (uniquement pour le type "Avis Google") */}
          {form.type === "avis_google" && (
            <div style={{ marginBottom:10 }}>
              <input value={form.lien_url} onChange={e=>setForm(f=>({...f,lien_url:e.target.value}))}
                placeholder="Lien vers votre page d'avis Google (ex: https://g.page/r/.../review)"
                style={{ width:"100%", border:`1.5px solid ${!form.lien_url.trim()?"#fecaca":"#e0e7ff"}`, borderRadius:8, padding:"8px 12px", fontSize:13, fontFamily:"inherit", boxSizing:"border-box" }}/>
              <div style={{ fontSize:11, color:"#94a3b8", marginTop:4 }}>
                Trouvez ce lien via "Demander des avis" dans votre fiche Google Business Profile.
              </div>
            </div>
          )}

          {/* Image (optionnelle) */}
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
            {form.image_url ? (
              <div style={{ position:"relative" }}>
                <img src={form.image_url} alt="" style={{ width:64, height:64, borderRadius:8, objectFit:"cover", border:"1.5px solid #e0e7ff" }}/>
                <button onClick={()=>setForm(f=>({...f,image_url:""}))} title="Retirer l'image"
                  style={{ position:"absolute", top:-6, right:-6, width:20, height:20, borderRadius:"50%", border:"none", background:"#dc2626", color:"#fff", fontSize:11, cursor:"pointer", lineHeight:"20px" }}>✕</button>
              </div>
            ) : (
              <label style={{ display:"flex", alignItems:"center", justifyContent:"center", width:64, height:64, borderRadius:8, border:"1.5px dashed #c7d2fe", cursor:uploadingImg?"wait":"pointer", fontSize:20, color:"#94a3b8", background:"#fff" }}>
                {uploadingImg ? "…" : "🖼️"}
                <input type="file" accept="image/jpeg,image/png,image/webp" style={{ display:"none" }} disabled={uploadingImg}
                  onChange={e=>{ const f=e.target.files?.[0]; if(f) handleImageUpload(f); e.target.value=""; }}/>
              </label>
            )}
            <div style={{ fontSize:11, color:"#94a3b8", lineHeight:1.5 }}>Image optionnelle affichée en fond de la story<br/>(JPG, PNG ou WebP — 15 Mo max)</div>
          </div>
          {imgError && <div style={{ fontSize:12, color:"#dc2626", marginBottom:10 }}>⚠️ {imgError}</div>}

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

          {/* Prix (optionnel) — affiche le bouton "Ajouter à la commande" côté patient */}
          <div style={{ marginBottom:14 }}>
            <input type="number" min="0" step="0.01" value={form.prix} onChange={e=>setForm(f=>({...f,prix:e.target.value}))}
              placeholder="Prix en € (optionnel)"
              style={{ width:"100%", border:"1.5px solid #e0e7ff", borderRadius:8, padding:"8px 12px", fontSize:13, fontFamily:"inherit", boxSizing:"border-box" }}/>
            <div style={{ fontSize:11, color:"#94a3b8", marginTop:4 }}>Avec un prix, le patient voit un bouton "Ajouter à la commande" (réservation — encaissement au comptoir, jamais de paiement en ligne pour ce produit).</div>
          </div>

          {/* Preview story */}
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:11, fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>Aperçu story</div>
            <div style={{ width:120, height:200, borderRadius:16,
              background: form.image_url
                ? `linear-gradient(160deg,${form.couleur}cc,${form.couleur}cc), url(${form.image_url}) center/cover`
                : `linear-gradient(160deg,${form.couleur},${form.couleur}99)`,
              backgroundBlendMode: form.image_url ? "multiply" : "normal",
              display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:10, textAlign:"center", boxShadow:"0 4px 16px rgba(0,0,0,0.15)" }}>
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
            <button onClick={saveOffre} disabled={!form.titre.trim()||saving||(form.type==="avis_google"&&!form.lien_url.trim())}
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
        <div key={offre.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 14px", border:`1.5px solid ${offre.epuise?"#fecaca":offre.actif?"#e0e7ff":"#f1f5f9"}`, borderRadius:12, marginBottom:8, background:offre.epuise?"#fff5f5":offre.actif?"#f8faff":"#f8f9fa" }}>
          <div style={{ width:44, height:44, borderRadius:10,
            background: offre.image_url
              ? `linear-gradient(135deg,${offre.couleur||"#1a3a6e"}cc,${offre.couleur||"#1a3a6e"}cc), url(${offre.image_url}) center/cover`
              : `linear-gradient(135deg,${offre.couleur||"#1a3a6e"},${offre.couleur||"#1a3a6e"}88)`,
            backgroundBlendMode: offre.image_url ? "multiply" : "normal",
            display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, flexShrink:0 }}>
            {offre.emoji||"🎁"}
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontWeight:700, fontSize:14, color:offre.actif?"#1a1a1a":"#94a3b8", display:"flex", alignItems:"center", gap:6 }}>
              {offre.titre}
              {offre.badge && <span style={{ fontSize:10, background:"#fef3c7", color:"#92400e", borderRadius:20, padding:"1px 7px", fontWeight:800 }}>{offre.badge}</span>}
              <span style={{ fontSize:10, background:offre.type==="promo"?"#fee2e2":offre.type==="service"?"#dbeafe":offre.type==="avis_google"?"#fef9c3":"#dcfce7", color:offre.type==="promo"?"#dc2626":offre.type==="service"?"#1e40af":offre.type==="avis_google"?"#92400e":"#15803d", borderRadius:20, padding:"1px 7px", fontWeight:700 }}>
                {offre.type==="promo"?"Promotion":offre.type==="service"?"Service":offre.type==="avis_google"?"Avis Google":"Fidélité"}
              </span>
              {offre.epuise && <span style={{ fontSize:10, background:"#fee2e2", color:"#dc2626", borderRadius:20, padding:"1px 7px", fontWeight:800 }}>🚫 Rupture</span>}
              {offre.created_via==="mobile" && <span title="Créée depuis mobile" style={{ fontSize:10 }}>📱</span>}
            </div>
            {offre.description && <div style={{ fontSize:12, color:"#64748b", marginTop:2, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{offre.description}</div>}
            {offre.prix!=null && <div style={{ fontSize:12, color:"#1a3a6e", fontWeight:700, marginTop:2 }}>{offre.prix} € · réservable</div>}
            {offre.date_fin && <div style={{ fontSize:11, color:"#f59e0b", marginTop:2 }}>Jusqu'au {new Date(offre.date_fin).toLocaleDateString("fr-FR")}</div>}
            <div style={{ fontSize:11, color:"#64748b", marginTop:4, display:"flex", gap:12, flexWrap:"wrap" }}>
              <span>👁️ {stats.vues} vue{stats.vues>1?"s":""}</span>
              <span>⏱️ {formatDuree(stats.dureeMoyenne)} en moyenne</span>
              <span>❤️ {stats.interets} intéressé{stats.interets>1?"s":""}</span>
            </div>
          </div>
          <div style={{ display:"flex", gap:6, flexShrink:0 }}>
            {offre.prix!=null && (
              <button onClick={()=>toggleEpuise(offre)} disabled={epuiseBusyId===offre.id}
                style={{ padding:"5px 10px", border:`1.5px solid ${offre.epuise?"#fecaca":"#e0e7ff"}`, borderRadius:8,
                  background:offre.epuise?"#fee2e2":"#fff", color:offre.epuise?"#dc2626":"#374151",
                  fontSize:11, fontWeight:700, cursor:epuiseBusyId===offre.id?"default":"pointer", fontFamily:"inherit", opacity:epuiseBusyId===offre.id?0.6:1 }}>
                {offre.epuise?"↺ Réassort":"🚫 Épuisé"}
              </button>
            )}
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
      </>}
    </div>
  );
}

export { OffresSection };
export default OffresSection;
