// Extrait de AdminPage.jsx (phase 4) — composant autonome (props + état local
// uniquement). Découpage des gros fichiers, voir DEPLOIEMENT_PHASE2.md/PHASE4.md.
//
// pricing_plans (Supabase) est la source de vérité durable pour cet éditeur — avant le
// 24/07/2026, "Sauvegarder" ne faisait que muter PLAN_LIMITS en mémoire : un rechargement
// de page perdait tout changement, alors que l'écran affichait "✅ Sauvegardé".
import { useState, useEffect } from "react";
import { PLAN_LIMITS, PLAN_ORDER, KIT_RULES } from "../lib/plans.js";

const BILLING_INTERVALS = ["monthly", "annual"];

function PricingEditor({ adminToken } = {}) {
  const [plans,setPlans]=useState(()=>Object.entries(PLAN_LIMITS).map(([id,p])=>({...p,id})));
  const [kitRules,setKitRules]=useState(()=>PLAN_ORDER.flatMap(planId=>BILLING_INTERVALS.map(billingInterval=>({planId,billingInterval,...KIT_RULES[planId]?.[billingInterval]}))));
  const [saved,setSaved]=useState(false);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [err,setErr]=useState("");

  async function callSecureData(resource, params) {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    const res = await fetch(`${supabaseUrl}/functions/v1/secure-data-admin`, {
      method: "POST",
      headers: { "Content-Type":"application/json", "apikey":supabaseKey, "Authorization":`Bearer ${adminToken||""}` },
      body: JSON.stringify({ resource, params }),
    });
    const body = await res.json().catch(()=>({}));
    if (!res.ok) throw new Error(body?.error || `secure-data-admin ${resource} : erreur ${res.status}`);
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
            offresStories: !!p.feature_offres_stories, sonnette: !!p.feature_sonnette,
          })));
        }
        // Si la table est vide (première utilisation), on garde les valeurs par défaut
        // de PLAN_LIMITS déjà chargées dans le state initial — rien à faire.
        const { data: kitData } = await callSecureData("admin_kit_materiel_rules");
        if (kitData && kitData.length) {
          setKitRules(kitData.map(r => ({ planId: r.plan_id, billingInterval: r.billing_interval, label: r.label, contenu: r.contenu, prix: r.prix, offert: r.offert })));
        }
      } catch(e) {
        setErr("Chargement impossible — valeurs par défaut affichées (" + e.message + ")");
      }
      setLoading(false);
    })();
  }, []);

  function update(planId,field,value){setPlans(prev=>prev.map(p=>p.id===planId?{...p,[field]:field.includes("price")||field.includes("max")?Number(value):value}:p));setSaved(false);}
  function updateKit(planId,billingInterval,field,value){
    setKitRules(prev=>prev.map(r=>r.planId===planId&&r.billingInterval===billingInterval?{...r,[field]:field==="prix"?Number(value):value}:r));
    setSaved(false);
  }

  async function save(){
    setSaving(true); setErr("");
    try {
      await callSecureData("admin_update_pricing", { plans });
      await callSecureData("admin_update_kit_materiel_rules", { rules: kitRules });
      // Répercuter immédiatement dans PLAN_LIMITS/KIT_RULES pour cette session
      // (fusionne, ne remplace pas : préserve les champs propres au frontend et
      // absents de `pricing_plans`, ex. offresStories — voir loadPlanLimits()).
      // Les autres onglets/visiteurs déjà chargés ne verront le changement
      // qu'au prochain chargement de page (main.jsx appelle loadPlanLimits()
      // au démarrage).
      plans.forEach(p=>{ PLAN_LIMITS[p.id]={...PLAN_LIMITS[p.id], ...p}; });
      kitRules.forEach(r=>{
        if (!KIT_RULES[r.planId]) KIT_RULES[r.planId] = {};
        KIT_RULES[r.planId][r.billingInterval] = { label: r.label, contenu: r.contenu, prix: r.prix, offert: r.offert };
      });
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
              {[["price","Mensuel €"],["priceAnnual","Annuel € (total facturé 1×/an)"]].map(([field,lbl])=>(
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
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
              <input type="color" value={plan.color} onChange={e=>update(plan.id,"color",e.target.value)} style={{width:30,height:30,border:"none",cursor:"pointer",borderRadius:5}}/>
              <input value={plan.color} onChange={e=>update(plan.id,"color",e.target.value)} style={{flex:1,background:"#0f172a",border:"1px solid #334155",borderRadius:6,padding:"4px 8px",color:plan.color,fontWeight:700,fontSize:12,fontFamily:"monospace",outline:"none"}}/>
              <div style={{width:26,height:26,borderRadius:7,background:plan.color}}/>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:6,paddingTop:10,borderTop:"1px solid #334155"}}>
              <label style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:"#e2e8f0",cursor:"pointer"}}>
                <input type="checkbox" checked={plan.offresStories} onChange={e=>update(plan.id,"offresStories",e.target.checked)}/>
                Offres & Stories
              </label>
              <label style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:"#e2e8f0",cursor:"pointer"}}>
                <input type="checkbox" checked={plan.sonnette} onChange={e=>update(plan.id,"sonnette",e.target.checked)}/>
                Sonnette patient
              </label>
            </div>
          </div>
        ))}
      </div>
      <div style={{background:"#1e293b",borderRadius:14,padding:20,border:"1px solid #334155",marginBottom:24}}>
        <div style={{fontWeight:800,fontSize:15,color:"#fff",marginBottom:4}}>📦 Kit matériel</div>
        <div style={{fontSize:12,color:"#64748b",marginBottom:16}}>Une règle par plan et par intervalle de facturation — Essentiel n'est jamais offert, Fluidité/Performance peuvent l'être en engagement annuel.</div>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          {plans.map(plan=>(
            <div key={plan.id} style={{border:"1px solid #334155",borderRadius:10,padding:14}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}><span>{plan.icon}</span><span style={{fontWeight:700,fontSize:13,color:"#fff"}}>{plan.label}</span></div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,220px),1fr))",gap:12}}>
                {BILLING_INTERVALS.map(billingInterval=>{
                  const rule = kitRules.find(r=>r.planId===plan.id&&r.billingInterval===billingInterval) || {};
                  return (
                    <div key={billingInterval} style={{background:"#0f172a",borderRadius:8,padding:10}}>
                      <div style={{fontSize:10,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:0.5,marginBottom:8}}>{billingInterval==="monthly"?"Mensuel":"Annuel"}</div>
                      <input value={rule.label||""} onChange={e=>updateKit(plan.id,billingInterval,"label",e.target.value)} placeholder="Libellé (ex: Kit QR Code)"
                        style={{width:"100%",background:"#1e293b",border:"1px solid #334155",borderRadius:6,padding:"4px 8px",color:"#e2e8f0",fontSize:12,marginBottom:6,outline:"none",boxSizing:"border-box"}}/>
                      <div style={{display:"flex",gap:8,alignItems:"center"}}>
                        <input type="number" value={rule.prix||0} onChange={e=>updateKit(plan.id,billingInterval,"prix",e.target.value)}
                          style={{width:70,background:"#1e293b",border:"1px solid #334155",borderRadius:6,padding:"4px 8px",color:"#e2e8f0",fontWeight:900,fontSize:14,fontFamily:"monospace",outline:"none"}}/>
                        <label style={{display:"flex",alignItems:"center",gap:6,fontSize:11,color:"#94a3b8",cursor:"pointer"}}>
                          <input type="checkbox" checked={!!rule.offert} onChange={e=>updateKit(plan.id,billingInterval,"offert",e.target.checked)}/>
                          Offert
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
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

export { PricingEditor };
export default PricingEditor;
