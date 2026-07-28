// Extrait de Dashboard.jsx (phase 2) — composant autonome (props uniquement,
// pas d'état partagé avec PharmacieDashboard), premier pas du découpage des
// gros fichiers. Voir DEPLOIEMENT_PHASE2.md.
import { useState, useEffect } from "react";
import { getAuditLogs, exportLogsCSV } from "../supabase.js";

function LogsPanel({ pharmacieId, onClose }) {
  const [logs, setLogs] = useState([]);
  useEffect(() => { getAuditLogs(pharmacieId).then(setLogs); }, [pharmacieId]);
  const actionLabel = { view:"Consultation", print:"Impression", upload:"Import", reopen:"Remise en file", login:"Connexion", logout:"Déconnexion" };
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:500,display:"flex",flexDirection:"column"}}>
      <div style={{background:"#fff",flex:1,overflow:"auto",marginTop:52,padding:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div style={{fontWeight:800,fontSize:16,color:"#1a3a6e"}}>🗒️ Journal d'activité</div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>exportLogsCSV(pharmacieId).catch(()=>{})} style={{padding:"6px 14px",border:"1px solid #e2e8f0",borderRadius:8,background:"#fff",fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>⬇️ Export CSV</button>
            <button onClick={onClose} style={{padding:"6px 14px",border:"none",borderRadius:8,background:"#1a3a6e",color:"#fff",fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>✕ Fermer</button>
          </div>
        </div>
        {logs.length===0?(
          <div style={{textAlign:"center",padding:"40px 0",color:"#bbb"}}><div style={{fontSize:32,marginBottom:8}}>📋</div><div>Aucune action enregistrée</div></div>
        ):(
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
            <thead><tr style={{borderBottom:"2px solid #f0f0f0"}}>
              {["Heure","Utilisateur","Rôle","Action","ID Ordonnance"].map(h=><th key={h} style={{textAlign:"left",padding:"6px 10px",fontSize:11,color:"#94a3b8",fontWeight:700,textTransform:"uppercase"}}>{h}</th>)}
            </tr></thead>
            <tbody>{logs.map(l=>(
              <tr key={l.id} style={{borderBottom:"1px solid #f8fafc"}}>
                <td style={{padding:"8px 10px",color:"#64748b"}}>{new Date(l.ts).toLocaleTimeString("fr-FR")}</td>
                <td style={{padding:"8px 10px",fontFamily:"monospace",fontSize:11}}>{l.userId}</td>
                <td style={{padding:"8px 10px"}}><span style={{fontSize:10,fontWeight:700,background:l.userRole==="admin"?"#dbeafe":"#dcfce7",color:l.userRole==="admin"?"#1d4ed8":"#15803d",padding:"2px 7px",borderRadius:20}}>{l.userRole}</span></td>
                <td style={{padding:"8px 10px",fontWeight:600}}>{actionLabel[l.action]||l.action}</td>
                <td style={{padding:"8px 10px",fontFamily:"monospace",fontSize:11,color:"#94a3b8"}}>{l.ordonnanceId||"—"}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export { LogsPanel };
export default LogsPanel;
