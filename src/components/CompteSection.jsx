// Extrait de Dashboard.jsx (phase 4) — composant autonome (props + état local
// uniquement). Découpage des gros fichiers, voir DEPLOIEMENT_PHASE2.md/PHASE4.md.
import { useState } from "react";
import { PLAN_LIMITS } from "../lib/plans.js";
import { openInvoicePDF } from "../lib/print.jsx";
import { Btn, Input } from "./ui.jsx";
import { PlanSwitcherModal } from "./UpgradeModal.jsx";
import { isDemoMode, getSupabaseClient } from "../supabase.js";

function CompteSection({ pharmacie, postes, planInfo, onUpgrade }) {
  const [pwdOld,setPwdOld]=useState(""); const [pwdNew,setPwdNew]=useState(""); const [pwdMsg,setPwdMsg]=useState(null);
  const [pwdLoading,setPwdLoading]=useState(false);
  const [showPlanSwitcher,setShowPlanSwitcher]=useState(false);
  const plan=planInfo||PLAN_LIMITS[pharmacie.plan]||PLAN_LIMITS.starter;
  const postesActifs=(postes||[]).filter(p=>p.actif).length;
  const ordosTraitees=(pharmacie.ordonnances||[]).filter(o=>o.status==="imprime").length;
  const invoices=[
    {id:"INV-2025-006",date:"15/06/2025",desc:`OrdoMail ${plan.label} — Juin 2025`,amount:plan.price},
    {id:"INV-2025-005",date:"15/05/2025",desc:`OrdoMail ${plan.label} — Mai 2025`,amount:plan.price},
    {id:"INV-2025-004",date:"15/04/2025",desc:`OrdoMail ${plan.label} — Avril 2025`,amount:plan.price},
    {id:"INV-2025-003",date:"15/03/2025",desc:`OrdoMail ${plan.label} — Mars 2025`,amount:plan.price},
    {id:"INV-2025-002",date:"15/02/2025",desc:`OrdoMail ${plan.label} — Fév. 2025`,amount:plan.price},
    {id:"INV-2025-001",date:"15/01/2025",desc:`OrdoMail ${plan.label} — Jan. 2025`,amount:plan.price},
  ];
  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      {/* Infos compte */}
      <div style={{background:"#fff",borderRadius:14,padding:22,boxShadow:"0 2px 10px rgba(0,0,0,0.07)"}}>
        <div style={{fontWeight:800,fontSize:15,marginBottom:16}}>👤 Informations du compte</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:18}}>
          {[["Email",pharmacie.email],["Pharmacie",pharmacie.nom],["Membre depuis",new Date(pharmacie.createdAt).toLocaleDateString("fr-FR")],["Ordonnances traitées",ordosTraitees],["Postes configurés",`${postesActifs} actifs / ${(postes||[]).length} total`]].map(([l,v])=>(
            <div key={l} style={{background:"#f8f9ff",borderRadius:10,padding:"10px 13px"}}>
              <div style={{fontSize:10,color:"#94a3b8",fontWeight:700,textTransform:"uppercase",letterSpacing:0.5,marginBottom:3}}>{l}</div>
              <div style={{fontSize:13,fontWeight:600,color:"#1a1a1a"}}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{borderTop:"1px solid #f0f4ff",paddingTop:14}}>
          <div style={{fontSize:13,fontWeight:700,color:"#374151",marginBottom:10}}>🔑 Mot de passe</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
            <Input label="Actuel" value={pwdOld} onChange={setPwdOld} type="password" placeholder="••••••••" icon="🔒"/>
            <Input label="Nouveau" value={pwdNew} onChange={setPwdNew} type="password" placeholder="••••••••" icon="🔒"/>
          </div>
          <Btn variant="secondary" small disabled={pwdLoading} onClick={async ()=>{
            if(!pwdOld||!pwdNew){setPwdMsg({ok:false,text:"Remplissez les deux champs"});return;}
            if(pwdNew.length<6){setPwdMsg({ok:false,text:"6 caractères minimum"});return;}
            if(isDemoMode){
              setPwdMsg({ok:true,text:"Mot de passe mis à jour ✓ (démo — non persisté)"});setPwdOld("");setPwdNew("");setTimeout(()=>setPwdMsg(null),3000);
              return;
            }
            setPwdLoading(true); setPwdMsg(null);
            try {
              const sb = getSupabaseClient();
              // Ré-authentifier avec l'ancien mot de passe pour le vérifier — Supabase Auth
              // n'a pas d'endpoint dédié "vérifier le mot de passe actuel" séparé du login.
              const { error: reauthErr } = await sb.auth.signInWithPassword({ email: pharmacie.email, password: pwdOld });
              if (reauthErr) { setPwdMsg({ok:false,text:"Mot de passe actuel incorrect"}); setPwdLoading(false); return; }
              const { error: updErr } = await sb.auth.updateUser({ password: pwdNew });
              if (updErr) { setPwdMsg({ok:false,text:updErr.message || "Erreur lors de la mise à jour"}); setPwdLoading(false); return; }
              setPwdMsg({ok:true,text:"Mot de passe mis à jour ✓"});setPwdOld("");setPwdNew("");
            } catch(e) {
              setPwdMsg({ok:false,text:"Erreur : " + e.message});
            }
            setPwdLoading(false);
            setTimeout(()=>setPwdMsg(null),3000);
          }}>{pwdLoading?"Mise à jour…":"Mettre à jour"}</Btn>
          {pwdMsg&&<div style={{marginTop:8,fontSize:12,fontWeight:600,color:pwdMsg.ok?"#15803d":"#dc2626",padding:"6px 10px",background:pwdMsg.ok?"#dcfce7":"#fee2e2",borderRadius:7}}>{pwdMsg.text}</div>}
        </div>
      </div>
      {/* Abonnement */}
      <div style={{background:"#fff",borderRadius:14,padding:22,boxShadow:"0 2px 10px rgba(0,0,0,0.07)",border:`2px solid ${plan.color}22`}}>
        <div style={{fontWeight:800,fontSize:15,marginBottom:14}}>💳 Abonnement</div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:`${plan.color}08`,borderRadius:12,padding:"14px 16px",marginBottom:12}}>
          <div style={{display:"flex",gap:10,alignItems:"center"}}>
            <div style={{width:40,height:40,borderRadius:10,background:plan.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>{plan.icon}</div>
            <div><div style={{fontWeight:900,fontSize:16}}>OrdoMail {plan.label}</div><div style={{fontSize:12,color:"#64748b"}}>{plan.price} €/mois</div></div>
          </div>
          <button onClick={()=>setShowPlanSwitcher(true)} style={{padding:"9px 16px",border:"none",borderRadius:9,background:"#1a3a6e",color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>↕ Changer</button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          {[[`🖥️ Postes`,postesActifs,plan.maxPostes===999?null:plan.maxPostes],[`📋 Ordonnances`,ordosTraitees,plan.maxOrdos===99999?null:plan.maxOrdos]].map(([l,u,m])=>(
            <div key={l} style={{background:"#f8fafc",borderRadius:9,padding:"10px 12px"}}>
              <div style={{fontSize:11,color:"#64748b",marginBottom:3}}>{l}</div>
              <div style={{fontWeight:800,fontSize:17}}>{u}{m?<span style={{fontSize:11,fontWeight:400,color:"#94a3b8"}}> / {m}</span>:<span style={{fontSize:11,fontWeight:400,color:"#94a3b8"}}> / ∞</span>}</div>
            </div>
          ))}
        </div>
      </div>
      {/* Factures */}
      <div style={{background:"#fff",borderRadius:14,padding:22,boxShadow:"0 2px 10px rgba(0,0,0,0.07)"}}>
        <div style={{fontWeight:800,fontSize:15,marginBottom:14}}>🧾 Historique factures</div>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
          <thead><tr style={{borderBottom:"2px solid #f0f4ff"}}>{["N°","Date","Description","Montant","",""].map(h=><th key={h} style={{padding:"0 0 8px",textAlign:"left",fontSize:10,fontWeight:700,color:"#94a3b8",textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
          <tbody>{invoices.map(inv=>(
            <tr key={inv.id} style={{borderBottom:"1px solid #f8fafc"}}>
              <td style={{padding:"8px 0",fontFamily:"monospace",fontSize:10,color:"#94a3b8"}}>{inv.id}</td>
              <td style={{padding:"8px 0",color:"#475569"}}>{inv.date}</td>
              <td style={{padding:"8px 0",fontWeight:500}}>{inv.desc}</td>
              <td style={{padding:"8px 0",fontWeight:800}}>{inv.amount} €</td>
              <td style={{padding:"8px 0"}}><span style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:20,background:"#dcfce7",color:"#166534"}}>✓</span></td>
              <td style={{padding:"8px 0",textAlign:"right"}}><button onClick={()=>openInvoicePDF(inv,pharmacie,pharmacie.plan)} style={{fontSize:11,color:"#3b82f6",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>📄</button></td>
            </tr>
          ))}</tbody>
        </table>
        <div style={{marginTop:12,padding:"8px 12px",background:"#f8fafc",borderRadius:8,fontSize:12,color:"#94a3b8",display:"flex",justifyContent:"space-between"}}>
          <span>Total 2025</span><span style={{fontWeight:700,color:"#1a1a1a"}}>{invoices.reduce((s,i)=>s+i.amount,0)} €</span>
        </div>
      </div>
      {/* Zone danger */}
      <div style={{background:"#fff",borderRadius:14,padding:20,border:"1px solid #fee2e2"}}>
        <div style={{fontWeight:700,fontSize:14,color:"#dc2626",marginBottom:10}}>⚠️ Zone de danger</div>
        <div style={{fontSize:13,color:"#64748b",marginBottom:12}}>La suppression est définitive. Les données sont conservées 90 jours.</div>
        <Btn variant="danger" small>🗑 Supprimer mon compte</Btn>
      </div>
      {showPlanSwitcher&&<PlanSwitcherModal pharmacie={pharmacie} postes={postes||[]} onConfirm={(p)=>{onUpgrade(p);setShowPlanSwitcher(false);}} onClose={()=>setShowPlanSwitcher(false)}/>}
    </div>
  );
}

export { CompteSection };
export default CompteSection;
