// Extrait de AdminPage.jsx (phase 4) — composant autonome (props + état local
// uniquement). Découpage des gros fichiers, voir DEPLOIEMENT_PHASE2.md/PHASE4.md.
import { useState } from "react";
import { updateSonnetteActive } from "../supabase.js";
import { callSecureDataAdmin } from "../lib/supabase/adminApi.js";
import { FONCTIONNALITES, fonctionnaliteActive } from "../lib/featureRegistry.js";

function ContratEditor({ pharmacie, plans, onSave, onClose, saving, msg, onClearMsg, adminToken }) {
  const [plan,        setPlan]        = useState(pharmacie.plan || "starter");
  const [postesActifs, setPostesActifs] = useState(pharmacie.postesActifs || 1);
  // Repéré par le linter (phase 2) : ce bouton mutait directement la prop `pharmacie`
  // (sans effet sur le rendu) puis appelait un onRefresh inexistant dans les props de
  // ce composant — ReferenceError garantie au clic. État local à la place.
  const [sonnetteActive, setSonnetteActive] = useState(pharmacie.sonnette_active !== false);

  // Fonctionnalités réglables par pharmacie (06/10/2026) — voir
  // lib/featureRegistry.js. État local reflété depuis la pharmacie ouverte,
  // mis à jour seulement après confirmation du serveur (jamais optimiste
  // avant : une fonctionnalité mal activée peut changer le comportement vu
  // par le patient, donc pas d'affichage d'un état qui ne serait pas encore
  // réellement enregistré).
  const [overrides, setOverrides] = useState(pharmacie.feature_overrides || {});
  const [enregistrement, setEnregistrement] = useState(null); // clé en cours d'écriture, ou null
  const [erreurFonctionnalite, setErreurFonctionnalite] = useState("");

  async function basculerFonctionnalite(cle, valeur) {
    setEnregistrement(cle);
    setErreurFonctionnalite("");
    try {
      const { data } = await callSecureDataAdmin("admin_set_feature_pharmacie", { pharmacieId: pharmacie.id, cle, valeur }, adminToken);
      setOverrides(data?.feature_overrides || {});
    } catch (e) {
      setErreurFonctionnalite(e.message);
    }
    setEnregistrement(null);
  }

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
            const newVal = !sonnetteActive;
            await updateSonnetteActive(pharmacie.id, newVal);
            setSonnetteActive(newVal);
          }}
          style={{padding:"7px 14px",borderRadius:8,border:"none",cursor:"pointer",fontFamily:"inherit",fontWeight:700,fontSize:13,
            background:sonnetteActive?"#14532d":"#450a0a",
            color:sonnetteActive?"#86efac":"#fca5a5"}}>
          {sonnetteActive?"✅ Activée":"❌ Désactivée"}
        </button>
      </div>

      {/* Fonctionnalités réglables par pharmacie — un interrupteur par entrée
          du catalogue (lib/featureRegistry.js), sans écran dédié à écrire
          pour chaque nouvelle fonctionnalité de ce type. */}
      <div style={{marginTop:16,padding:"14px 16px",background:"#1e293b",borderRadius:12,border:"1px solid #334155"}}>
        <div style={{fontWeight:700,fontSize:13,color:"#fff",marginBottom:erreurFonctionnalite?6:12}}>🧩 Fonctionnalités</div>
        {erreurFonctionnalite && <div style={{fontSize:12,color:"#f87171",marginBottom:10}}>{erreurFonctionnalite}</div>}
        {FONCTIONNALITES.map((f, i) => {
          const active = fonctionnaliteActive({ feature_overrides: overrides }, f.cle);
          const enCours = enregistrement === f.cle;
          return (
            <div key={f.cle} style={{display:"flex",alignItems:"center",gap:12,padding:"8px 0",borderTop:i>0?"1px solid #334155":"none"}}>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:700,color:"#fff"}}>{f.label}</div>
                <div style={{fontSize:11,color:"#64748b",marginTop:2}}>{f.description}</div>
              </div>
              <button type="button" disabled={enCours} onClick={()=>basculerFonctionnalite(f.cle, !active)}
                style={{padding:"7px 14px",borderRadius:8,border:"none",cursor:enCours?"default":"pointer",fontFamily:"inherit",fontWeight:700,fontSize:13,opacity:enCours?0.6:1,
                  background:active?"#14532d":"#450a0a",
                  color:active?"#86efac":"#fca5a5"}}>
                {active?"✅ Activée":"❌ Désactivée"}
              </button>
            </div>
          );
        })}
      </div>

      <button onClick={()=>onSave(pharmacie.id, plan, postesActifs)} disabled={saving}
        style={{width:"100%",marginTop:16,padding:"13px",border:"none",borderRadius:10,background:saving?"#1e3a5f":"#3b82f6",color:"#fff",fontWeight:800,fontSize:15,cursor:saving?"not-allowed":"pointer",fontFamily:"inherit"}}>
        {saving ? "Enregistrement…" : "✅ Valider le contrat"}
      </button>
    </div>
  );
}

export { ContratEditor };
export default ContratEditor;
