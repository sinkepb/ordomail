// Extrait de Dashboard.jsx (phase 4) — composant autonome (props + état local
// uniquement). Découpage des gros fichiers, voir DEPLOIEMENT_PHASE2.md/PHASE4.md.
import { useState } from "react";
import { PLAN_LIMITS } from "../lib/plans.js";
import { openInvoicePDF } from "../lib/print.jsx";
import { PlanSwitcherModal } from "./UpgradeModal.jsx";

function AbonnementSection({ pharmacie, onUpgrade }) {
  const [showPlanSwitcher, setShowPlanSwitcher] = useState(false);
  const plan = PLAN_LIMITS[pharmacie.plan] || PLAN_LIMITS.starter;
  const postes = pharmacie.postes || [];
  const postesActifs = postes.filter(p=>p.actif).length;
  const ordos = (pharmacie.ordonnances||[]).length;
  const invoices = [
    {id:"INV-2025-006",date:"15/06/2025",desc:`OrdoMail ${plan.label} — Juin 2025`,amount:plan.price,status:"paid"},
    {id:"INV-2025-005",date:"15/05/2025",desc:`OrdoMail ${plan.label} — Mai 2025`,amount:plan.price,status:"paid"},
    {id:"INV-2025-004",date:"15/04/2025",desc:`OrdoMail ${plan.label} — Avril 2025`,amount:plan.price,status:"paid"},
  ];
  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{background:"#fff",borderRadius:14,padding:22,boxShadow:"0 2px 10px rgba(0,0,0,0.07)",border:`2px solid ${plan.color}22`}}>
        <div style={{fontWeight:800,fontSize:15,marginBottom:14,display:"flex",alignItems:"center",gap:8}}>💳 Abonnement actuel</div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:`${plan.color}08`,border:`1px solid ${plan.color}33`,borderRadius:12,padding:"14px 16px",marginBottom:14}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{width:42,height:42,borderRadius:11,background:plan.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>{plan.icon}</div>
            <div><div style={{fontWeight:900,fontSize:17,color:"#0f172a"}}>OrdoMail {plan.label}</div><div style={{fontSize:12,color:"#64748b"}}>Facturation mensuelle</div></div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontWeight:900,fontSize:24,color:plan.color}}>{plan.price} <span style={{fontSize:13,fontWeight:400,color:"#94a3b8"}}>€/mois</span></div>
            <div style={{fontSize:11,color:"#94a3b8"}}>Prochain : 15/07/2025</div>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
          {[[`🖥️ Postes actifs`,postesActifs,plan.maxPostes===999?null:plan.maxPostes,plan.maxPostes===999?0.1:postesActifs/plan.maxPostes],
            [`📋 Ordonnances`,ordos,plan.maxOrdos===99999?null:plan.maxOrdos,plan.maxOrdos===99999?0.1:ordos/plan.maxOrdos]
          ].map(([label,used,max,ratio])=>(
            <div key={label} style={{background:"#f8fafc",borderRadius:10,padding:"12px 14px"}}>
              <div style={{fontSize:12,color:"#64748b",marginBottom:4}}>{label}</div>
              <div style={{fontWeight:800,fontSize:18,color:ratio>0.8?"#ef4444":"#1a1a1a"}}>{used}{max?<span style={{fontSize:12,fontWeight:400,color:"#94a3b8"}}> / {max}</span>:<span style={{fontSize:12,fontWeight:400,color:"#94a3b8"}}> / ∞</span>}</div>
              <div style={{marginTop:5,height:4,background:"#e2e8f0",borderRadius:4}}><div style={{width:`${Math.min(ratio*100,100)}%`,height:"100%",background:ratio>0.8?"#ef4444":plan.color,borderRadius:4}}/></div>
            </div>
          ))}
        </div>
        <div style={{borderTop:"1px solid #f0f4ff",paddingTop:12,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <button onClick={()=>setShowPlanSwitcher(true)} style={{padding:"10px 18px",border:"none",borderRadius:10,background:"#1a3a6e",color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>↕ Changer de plan</button>
          {plan.id!=="starter"&&<button onClick={()=>setShowPlanSwitcher(true)} style={{padding:"8px 14px",border:"1.5px solid #e2e8f0",borderRadius:10,background:"#fff",color:"#94a3b8",fontWeight:600,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>↓ Rétrograder</button>}
        </div>
      </div>
      <div style={{background:"#fff",borderRadius:14,padding:22,boxShadow:"0 2px 10px rgba(0,0,0,0.07)"}}>
        <div style={{fontWeight:800,fontSize:15,marginBottom:14}}>🧾 Historique</div>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
          <thead><tr style={{borderBottom:"2px solid #f0f4ff"}}>
            {["N°","Date","Description","Montant","",""].map(h=><th key={h} style={{padding:"0 0 8px",textAlign:"left",fontSize:10,fontWeight:700,color:"#94a3b8",textTransform:"uppercase"}}>{h}</th>)}
          </tr></thead>
          <tbody>{invoices.map(inv=>(
            <tr key={inv.id} style={{borderBottom:"1px solid #f8fafc"}}>
              <td style={{padding:"9px 0",fontFamily:"monospace",fontSize:10,color:"#94a3b8"}}>{inv.id}</td>
              <td style={{padding:"9px 0",color:"#475569"}}>{inv.date}</td>
              <td style={{padding:"9px 0",color:"#1a1a1a",fontWeight:500}}>{inv.desc}</td>
              <td style={{padding:"9px 0",fontWeight:800}}>{inv.amount} €</td>
              <td style={{padding:"9px 0"}}><span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:20,background:"#dcfce7",color:"#166534"}}>✓ Payée</span></td>
              <td style={{padding:"9px 0",textAlign:"right"}}><button onClick={()=>openInvoicePDF(inv,pharmacie,pharmacie.plan)} style={{fontSize:11,color:"#3b82f6",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>📄 PDF</button></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {showPlanSwitcher&&<PlanSwitcherModal pharmacie={pharmacie} postes={pharmacie.postes||[]} onConfirm={onUpgrade} onClose={()=>setShowPlanSwitcher(false)}/>}
    </div>
  );
}

export { AbonnementSection };
export default AbonnementSection;
