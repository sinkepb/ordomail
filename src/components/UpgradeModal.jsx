import { useState } from "react";
import { PLAN_LIMITS, PLAN_ORDER, getNextPlan, computeImpact } from "../lib/plans.js";
import { getSupabaseClient, isDemoMode } from "../supabase.js";

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


// ─── Section Offres Stories (Premium) — dead code, dupliqué de
// components/OffresSection.jsx extrait en phase 2, plus importé nulle part ───
function PlanSwitcher({ pharmacie, postes, onConfirm, onClose }) {
  const [billingCycle, setBillingCycle] = useState("monthly");
  const [selected, setSelected] = useState(null);
  const [step, setStep] = useState("choose");
  const [errorMsg, setErrorMsg] = useState("");
  // Figé à l'ouverture : `pharmacie` est une prop qui se met à jour en direct une fois
  // le changement confirmé (le parent refetch après onConfirm), donc recalculer
  // computeImpact contre pharmacie.plan en direct ferait dire, une fois l'étape "done"
  // atteinte, que le NOUVEAU plan == plan courant → isUpgrade devient faussement false.
  const [initialPlan] = useState(pharmacie.plan);

  const impact = selected ? computeImpact({ ...pharmacie, plan: initialPlan }, postes, selected.id) : null;

  if (step === "error") return (
    <div style={{textAlign:"center",padding:"24px 0"}}>
      <div style={{fontSize:64,marginBottom:16}}>⚠️</div>
      <div style={{fontWeight:900,fontSize:20,color:"#0f172a",marginBottom:8}}>Échec du changement de plan</div>
      <div style={{fontSize:14,color:"#64748b",marginBottom:24,lineHeight:1.7}}>{errorMsg || "Une erreur est survenue — rien n'a été modifié."}</div>
      <div style={{display:"flex",gap:10,justifyContent:"center"}}>
        <button onClick={onClose} style={{padding:"11px 28px",border:"1.5px solid #e2e8f0",borderRadius:10,background:"#fff",color:"#475569",fontWeight:600,fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>Fermer</button>
        <button onClick={()=>setStep("confirm")} style={{padding:"11px 28px",border:"none",borderRadius:10,background:"#1a3a6e",color:"#fff",fontWeight:800,fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>Réessayer</button>
      </div>
    </div>
  );

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
              // Si downgrade : désactiver les postes excédentaires en Supabase.
              // ⚠️ Utilise `postes` (prop, source de l'avertissement affiché à l'écran
              // précédent) et non `pharmacie.postes` (peut être obsolète — pas
              // resynchronisé avec les modifications faites dans l'onglet Postes tant
              // qu'un refetch de la pharmacie n'a pas eu lieu).
              if (impact && impact.postesASusprimer > 0 && !isDemoMode) {
                const sb = getSupabaseClient();
                const actifs = (postes||[]).filter(p=>p.actif);
                for (let i = actifs.length-1; i >= selected.maxPostes; i--) {
                  const { error } = await sb.from("pharmacie_postes").update({ actif: false }).eq("id", actifs[i].id);
                  if (error) throw error;
                }
              }
              // @fix 29/08/2026 (Phase 5) — billingCycle pilotait uniquement
              // l'affichage des prix dans cette modale, jamais envoyé à
              // onConfirm : "passer en annuel" n'avait aucun effet réel.
              await onConfirm(selected.id, billingCycle);
              setStep("done");
            } catch(e) {
              console.error("[PlanSwitcher]", e.message);
              setErrorMsg(e.message);
              setStep("error");
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
          {[["monthly","Mensuel"],["annual","Annuel (2 mois offerts)"]].map(([k,l])=>(
            <button key={k} onClick={()=>setBillingCycle(k)} style={{padding:"5px 14px",border:"none",borderRadius:8,cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:billingCycle===k?700:500,background:billingCycle===k?"#fff":"transparent",color:billingCycle===k?"#1a1a1a":"#94a3b8"}}>{l}</button>
          ))}
        </div>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:18}}>
        {PLAN_ORDER.map(planId=>{
          const plan=PLAN_LIMITS[planId]; const isCurrent=pharmacie.plan===planId;
          const isSelected=selected?.id===planId;
          // @fix 29/08/2026 (Phase 5) — priceAnnual est le TOTAL annuel réel
          // (voir Phase 1) : le prix affiché ici reste un €/mois comparable,
          // pas le total brut.
          const price=billingCycle==="annual"?Math.round(plan.priceAnnual/12):plan.price;
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
                {billingCycle==="annual" && <div style={{fontSize:10,color:"#94a3b8"}}>{plan.priceAnnual} €/an</div>}
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
