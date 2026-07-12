import { useState, useEffect, useRef } from "react";
import { PLAN_LIMITS, PLAN_ORDER, getNextPlan, computeImpact } from "../lib/plans.js";
import { changePlan, getSupabaseClient, isDemoMode } from "../supabase.js";

function UpgradeModal({ currentPlan, reason, onConfirm, onClose }) {
  const nextPlan = getNextPlan(currentPlan);
  const next = PLAN_LIMITS[nextPlan];
  const curr = PLAN_LIMITS[currentPlan];
  if (!next) return null;
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:2000,padding:24}}>
      <div style={{background:"#fff",borderRadius:20,padding:32,maxWidth:440,width:"100%",boxShadow:"0 24px 60px rgba(0,0,0,0.25)",fontFamily:"'Inter',system-ui,sans-serif"}}>
        <div style={{fontSize:44,textAlign:"center",marginBottom:16}}>🚀</div>
        <h2 style={{fontWeight:900,fontSize:22,color:"#0f172a",textAlign:"center",marginBottom:8}}>Limite atteinte</h2>
        <p style={{fontSize:14,color:"#64748b",textAlign:"center",marginBottom:24,lineHeight:1.7}}>{reason}</p>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:24}}>
          <div style={{borderRadius:12,padding:"14px 16px",background:"#f8fafc",border:"1.5px solid #e2e8f0",opacity:0.7}}>
            <div style={{fontSize:11,fontWeight:700,color:"#94a3b8",marginBottom:6}}>Actuel</div>
            <div style={{fontWeight:900,fontSize:18,color:curr.color}}>{curr.icon} {curr.label}</div>
            <div style={{fontSize:13,color:"#64748b",marginTop:4}}>{curr.maxPostes} postes · {curr.price} €/mois</div>
          </div>
          <div style={{borderRadius:12,padding:"14px 16px",background:`${next.color}08`,border:`1.5px solid ${next.color}`,position:"relative"}}>
            <div style={{position:"absolute",top:-10,left:"50%",transform:"translateX(-50%)",background:next.color,color:"#fff",fontSize:10,fontWeight:800,padding:"2px 10px",borderRadius:20}}>RECOMMANDÉ</div>
            <div style={{fontSize:11,fontWeight:700,color:next.color,marginBottom:6}}>Supérieur</div>
            <div style={{fontWeight:900,fontSize:18,color:next.color}}>{next.icon} {next.label}</div>
            <div style={{fontSize:13,color:"#64748b",marginTop:4}}>{next.maxPostes===999?"Illimité":next.maxPostes} postes · {next.price} €/mois</div>
          </div>
        </div>
        <div style={{display:"flex",gap:10}}>
          <button onClick={onClose} style={{flex:1,padding:"11px",border:"1.5px solid #e2e8f0",borderRadius:10,background:"#fff",color:"#475569",fontWeight:600,fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>Rester</button>
          <button onClick={()=>onConfirm(nextPlan)} style={{flex:2,padding:"11px",border:"none",borderRadius:10,background:next.color,color:"#fff",fontWeight:800,fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>Passer en {next.label} →</button>
        </div>
      </div>
    </div>
  );
}

function PlanSwitcherModal({ pharmacie, postes, onConfirm, onClose }) {
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:2000,padding:24}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"#fff",borderRadius:20,padding:28,maxWidth:520,width:"100%",maxHeight:"90vh",overflowY:"auto",boxShadow:"0 24px 60px rgba(0,0,0,0.3)",fontFamily:"'Inter',system-ui,sans-serif"}}>
        <PlanSwitcher pharmacie={pharmacie} postes={postes} onConfirm={onConfirm} onClose={onClose}/>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ABONNEMENT & COMPTE (ParametresTab sub-sections)
// ═══════════════════════════════════════════════════════════════════════════════


// ─── Section Offres Stories (Premium) ────────────────────────────────────────
function OffresSection({ pharmacie, planInfo }) {
  const isPremium = planInfo?.offresStories === true;
  const [offres, setOffres]     = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState({ type:"promo", titre:"", description:"", emoji:"🎁", badge:"", couleur:"#1a3a6e", actif:true, date_fin:"" });
  const [saving, setSaving]     = useState(false);
  const sb = getSupabaseClient();

  // Types d'offres
  const TYPES = [
    { id:"promo",    label:"Promotion",   emoji:"🏷️", desc:"Réduction sur un produit" },
    { id:"service",  label:"Service",     emoji:"🩺", desc:"Mise en avant d'un service" },
    { id:"fidelite", label:"Fidélité",    emoji:"🎁", desc:"Offre de fidélité" },
  ];

  useEffect(() => {
    if (!isPremium || !sb) return;
    sb.from("offres_stories").select("*").eq("pharmacie_id", pharmacie.id).order("created_at", { ascending: false })
      .then(({ data }) => { if (data) setOffres(data); });
  }, [isPremium]);

  async function saveOffre() {
    if (!form.titre.trim()) return;
    setSaving(true);
    const payload = { ...form, pharmacie_id: pharmacie.id };
    if (sb && !isDemoMode) {
      const { data } = await sb.from("offres_stories").insert(payload).select().single();
      if (data) setOffres(prev => [data, ...prev]);
    } else {
      setOffres(prev => [{ ...payload, id: `o${Date.now()}`, created_at: new Date().toISOString() }, ...prev]);
    }
    setForm({ type:"promo", titre:"", description:"", emoji:"🎁", badge:"", couleur:"#1a3a6e", actif:true, date_fin:"" });
    setShowForm(false);
    setSaving(false);
  }

  async function toggleOffre(id, actif) {
    setOffres(prev => prev.map(o => o.id === id ? { ...o, actif: !actif } : o));
    if (sb && !isDemoMode) await sb.from("offres_stories").update({ actif: !actif }).eq("id", id);
  }

  async function deleteOffre(id) {
    setOffres(prev => prev.filter(o => o.id !== id));
    if (sb && !isDemoMode) await sb.from("offres_stories").delete().eq("id", id);
  }

  // Paywall si pas premium
  if (!isPremium) return (
    <div style={{ background:"#fff", borderRadius:14, padding:28, boxShadow:"0 2px 10px rgba(0,0,0,0.07)", textAlign:"center" }}>
      <div style={{ fontSize:48, marginBottom:12 }}>💎</div>
      <div style={{ fontWeight:900, fontSize:18, color:"#1a1a1a", marginBottom:8 }}>Offres & Promotions en Stories</div>
      <div style={{ fontSize:14, color:"#64748b", lineHeight:1.7, marginBottom:20, maxWidth:340, margin:"0 auto 20px" }}>
        Diffusez vos promotions, services et offres de fidélité directement dans les stories vues par vos patients pendant leur attente.<br/><br/>
        Fonctionnalité disponible avec le plan <strong>Premium</strong>.
      </div>
      <div style={{ background:"#fef9f0", border:"1.5px solid #f59e0b", borderRadius:12, padding:"16px 20px", marginBottom:20, display:"inline-block", textAlign:"left" }}>
        <div style={{ fontWeight:800, fontSize:15, color:"#92400e", marginBottom:8 }}>💎 Plan Premium — 119€/mois</div>
        {["Postes illimités","Offres & Promotions en Stories","Ordonnances illimitées","Support prioritaire"].map(f=>(
          <div key={f} style={{ fontSize:13, color:"#78350f", marginBottom:4 }}>✅ {f}</div>
        ))}
      </div>
      <br/>
      <button style={{ padding:"12px 28px", border:"none", borderRadius:12, background:"#b45309", color:"#fff", fontWeight:800, fontSize:15, cursor:"pointer", fontFamily:"inherit" }}>
        Passer en Premium →
      </button>
    </div>
  );

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
          <div style={{ fontWeight:700, fontSize:14, marginBottom:14 }}>Créer une offre</div>

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
              {saving ? "Enregistrement…" : "✅ Publier l'offre"}
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
      {offres.map(offre => (
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
          </div>
          <div style={{ display:"flex", gap:6, flexShrink:0 }}>
            <button onClick={()=>toggleOffre(offre.id, offre.actif)}
              style={{ padding:"5px 10px", border:`1.5px solid ${offre.actif?"#e0e7ff":"#bbf7d0"}`, borderRadius:8, background:offre.actif?"#fff":"#f0fdf4", color:offre.actif?"#64748b":"#15803d", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
              {offre.actif?"Pause":"▶ Activer"}
            </button>
            <button onClick={()=>deleteOffre(offre.id)}
              style={{ padding:"5px 8px", border:"1.5px solid #fee2e2", borderRadius:8, background:"#fff5f5", color:"#dc2626", fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}



function PlanSwitcher({ pharmacie, postes, onConfirm, onClose }) {
  const [billingCycle, setBillingCycle] = useState("monthly");
  const [selected, setSelected] = useState(null);
  const [step, setStep] = useState("choose");

  const impact = selected ? computeImpact(pharmacie, postes, selected.id) : null;

  if (step === "done") return (
    <div style={{textAlign:"center",padding:"24px 0"}}>
      <div style={{fontSize:64,marginBottom:16}}>✅</div>
      <div style={{fontWeight:900,fontSize:20,color:"#0f172a",marginBottom:8}}>Plan mis à jour !</div>
      <div style={{fontSize:14,color:"#64748b",marginBottom:24,lineHeight:1.7}}>
        Vous êtes sur le plan <strong style={{color:selected.color}}>{selected.icon} {selected.label}</strong>.<br/>
        {impact.isUpgrade?"Accès immédiat.":"Effet au prochain renouvellement."}
      </div>
      <button onClick={onClose} style={{padding:"11px 28px",border:"none",borderRadius:10,background:"#1a3a6e",color:"#fff",fontWeight:800,fontSize:15,cursor:"pointer",fontFamily:"inherit"}}>Fermer</button>
    </div>
  );

  if (step === "processing") return (
    <div style={{textAlign:"center",padding:"32px 0"}}>
      <div style={{fontSize:48,marginBottom:16,animation:"spin 1s linear infinite",display:"inline-block"}}>⚙️</div>
      <div style={{fontWeight:700,fontSize:16,color:"#1a3a6e"}}>Mise à jour en cours…</div>
    </div>
  );

  if (step === "confirm" && selected && impact) return (
    <div>
      <button onClick={()=>setStep("choose")} style={{border:"none",background:"none",cursor:"pointer",color:"#64748b",fontSize:13,marginBottom:20,fontFamily:"inherit"}}>← Retour</button>
      <h3 style={{fontWeight:900,fontSize:18,color:"#0f172a",marginBottom:4}}>{impact.isUpgrade?"↑ Passer en":"↓ Rétrograder en"} {selected.label}</h3>
      <p style={{fontSize:13,color:"#64748b",marginBottom:20}}>{impact.isUpgrade?"Effet immédiat · Prorata facturé.":"Effet au prochain renouvellement."}</p>
      <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",gap:12,alignItems:"center",marginBottom:20}}>
        <div style={{borderRadius:12,padding:"14px 16px",background:"#f8fafc",border:"1.5px solid #e2e8f0",opacity:0.7}}>
          <div style={{fontSize:10,fontWeight:700,color:"#94a3b8",marginBottom:4}}>Actuel</div>
          <div style={{fontWeight:900,color:impact.curr.color}}>{impact.curr.icon} {impact.curr.label}</div>
          <div style={{fontSize:12,color:"#64748b",marginTop:3}}>{impact.curr.price} €/mois</div>
        </div>
        <div style={{fontSize:20}}>→</div>
        <div style={{borderRadius:12,padding:"14px 16px",background:`${selected.color}08`,border:`1.5px solid ${selected.color}`}}>
          <div style={{fontSize:10,fontWeight:700,color:selected.color,marginBottom:4}}>Nouveau</div>
          <div style={{fontWeight:900,color:selected.color}}>{selected.icon} {selected.label}</div>
          <div style={{fontSize:12,color:"#64748b",marginTop:3}}>{selected.price} €/mois</div>
        </div>
      </div>
      <div style={{borderRadius:12,padding:"14px 16px",background:impact.isUpgrade?"#f0fdf4":"#fff7ed",border:`1px solid ${impact.isUpgrade?"#bbf7d0":"#fed7aa"}`,marginBottom:16}}>
        <div style={{fontWeight:700,fontSize:13,color:impact.isUpgrade?"#15803d":"#92400e",marginBottom:8}}>{impact.isUpgrade?"✅ Gains":"⚠️ Impacts"}</div>
        {[["💰 Prix",`${impact.curr.price} € → ${selected.price} € (${impact.isUpgrade?"+":""}${impact.priceDiff} €/mois)`],
          ["🖥️ Postes",`${impact.curr.maxPostes===999?"∞":impact.curr.maxPostes} → ${selected.maxPostes===999?"∞":selected.maxPostes}`],
          ["📋 Volume",`${impact.curr.maxOrdos===99999?"∞":impact.curr.maxOrdos} → ${selected.maxOrdos===99999?"∞":selected.maxOrdos}/mois`],
        ].map(([l,v])=>(
          <div key={l} style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:4}}>
            <span style={{color:"#374151"}}>{l}</span><span style={{fontWeight:700}}>{v}</span>
          </div>
        ))}
        {impact.postesASusprimer>0&&(
          <div style={{marginTop:10,padding:"8px 12px",background:"#fee2e2",borderRadius:8,fontSize:12,color:"#dc2626",fontWeight:600}}>
            🚫 {impact.postesASusprimer} poste(s) seront désactivés automatiquement
          </div>
        )}
      </div>
      <div style={{display:"flex",gap:10}}>
        <button onClick={onClose} style={{flex:1,padding:"11px",border:"1.5px solid #e2e8f0",borderRadius:10,background:"#fff",color:"#475569",fontWeight:600,fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>Annuler</button>
        <button onClick={()=>{
          setStep("processing");
          (async () => {
            try {
              // Si downgrade : désactiver les postes excédentaires en Supabase
              if (impact && impact.postesASusprimer > 0 && !isDemoMode) {
                const sb = getSupabaseClient();
                const actifs = (pharmacie.postes||[]).filter(p=>p.actif);
                for (let i = actifs.length-1; i >= selected.maxPostes; i--) {
                  await sb.from("postes").update({ actif: false }).eq("id", actifs[i].id);
                }
              }
              await onConfirm(selected.id);
              setStep("done");
            } catch(e) {
              console.error("[PlanSwitcher]", e.message);
              setStep("done"); // afficher done quand même
            }
          })();
        }} style={{flex:2,padding:"11px",border:"none",borderRadius:10,background:impact.isUpgrade?selected.color:"#92400e",color:"#fff",fontWeight:800,fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>
          {impact.isUpgrade?`↑ Passer en ${selected.label}`:`↓ Rétrograder en ${selected.label}`}
        </button>
      </div>
    </div>
  );

  return (
    <div>
      <div style={{marginBottom:18}}>
        <h3 style={{fontWeight:900,fontSize:18,color:"#0f172a",marginBottom:4,marginTop:0}}>Changer de plan</h3>
        <div style={{display:"inline-flex",background:"#f1f5f9",borderRadius:10,padding:3,gap:3}}>
          {[["monthly","Mensuel"],["annual","Annuel −20%"]].map(([k,l])=>(
            <button key={k} onClick={()=>setBillingCycle(k)} style={{padding:"5px 14px",border:"none",borderRadius:8,cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:billingCycle===k?700:500,background:billingCycle===k?"#fff":"transparent",color:billingCycle===k?"#1a1a1a":"#94a3b8"}}>{l}</button>
          ))}
        </div>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:18}}>
        {PLAN_ORDER.map(planId=>{
          const plan=PLAN_LIMITS[planId]; const isCurrent=pharmacie.plan===planId;
          const isSelected=selected?.id===planId; const price=billingCycle==="annual"?plan.priceAnnual:plan.price;
          const isUpgrade=PLAN_ORDER.indexOf(planId)>PLAN_ORDER.indexOf(pharmacie.plan);
          const isDowngrade=PLAN_ORDER.indexOf(planId)<PLAN_ORDER.indexOf(pharmacie.plan);
          const imp=computeImpact(pharmacie,postes||[],planId);
          return (
            <div key={planId} onClick={()=>!isCurrent&&setSelected(plan)}
              style={{borderRadius:12,padding:"14px 16px",border:isSelected?`2px solid ${plan.color}`:isCurrent?`2px solid ${plan.color}55`:"2px solid #e2e8f0",background:isSelected?`${plan.color}08`:isCurrent?`${plan.color}04`:"#fff",cursor:isCurrent?"default":"pointer",display:"flex",alignItems:"center",gap:14}}>
              <div style={{width:42,height:42,borderRadius:10,background:isCurrent?plan.color:`${plan.color}18`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{plan.icon}</div>
              <div style={{flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2}}>
                  <span style={{fontWeight:800,fontSize:14,color:"#0f172a"}}>{plan.label}</span>
                  {isCurrent&&<span style={{fontSize:9,fontWeight:800,background:plan.color,color:"#fff",padding:"1px 7px",borderRadius:20}}>ACTUEL</span>}
                  {isUpgrade&&!isCurrent&&<span style={{fontSize:9,fontWeight:700,background:"#dcfce7",color:"#15803d",padding:"1px 7px",borderRadius:20}}>↑ HAUSSE</span>}
                  {isDowngrade&&<span style={{fontSize:9,fontWeight:700,background:"#fff7ed",color:"#92400e",padding:"1px 7px",borderRadius:20}}>↓ BAISSE</span>}
                </div>
                <div style={{fontSize:11,color:"#64748b"}}>{plan.maxPostes===999?"Illimité":`${plan.maxPostes} postes`} · {plan.maxOrdos===99999?"∞":`${plan.maxOrdos}`} ordo/mois</div>
                {isDowngrade&&imp.postesASusprimer>0&&<div style={{fontSize:11,color:"#dc2626",fontWeight:600,marginTop:2}}>⚠️ {imp.postesASusprimer} poste(s) désactivé(s)</div>}
              </div>
              <div style={{textAlign:"right",flexShrink:0}}>
                <div style={{fontWeight:900,fontSize:20,color:isCurrent?"#94a3b8":plan.color}}>{price}</div>
                <div style={{fontSize:11,color:"#94a3b8"}}>€/mois</div>
              </div>
              <div style={{width:20,height:20,borderRadius:"50%",border:`2px solid ${isSelected?plan.color:"#e2e8f0"}`,background:isSelected?plan.color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                {(isSelected||isCurrent)&&<div style={{width:7,height:7,borderRadius:"50%",background:isSelected?"#fff":plan.color}}/>}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{display:"flex",gap:10}}>
        <button onClick={onClose} style={{flex:1,padding:"11px",border:"1.5px solid #e2e8f0",borderRadius:10,background:"#fff",color:"#475569",fontWeight:600,fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>Annuler</button>
        <button disabled={!selected} onClick={()=>selected&&setStep("confirm")}
          style={{flex:2,padding:"11px",border:"none",borderRadius:10,background:!selected?"#e2e8f0":selected.color,color:!selected?"#94a3b8":"#fff",fontWeight:800,fontSize:14,cursor:!selected?"default":"pointer",fontFamily:"inherit"}}>
          {!selected?"Sélectionnez un plan":`Continuer avec ${selected.label} →`}
        </button>
      </div>
    </div>
  );
}

export { UpgradeModal, PlanSwitcher, PlanSwitcherModal };
