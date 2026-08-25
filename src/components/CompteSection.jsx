// Extrait de Dashboard.jsx (phase 4) — composant autonome (props + état local
// uniquement). Découpage des gros fichiers, voir DEPLOIEMENT_PHASE2.md/PHASE4.md.
import { useState, useEffect } from "react";
import { PLAN_LIMITS } from "../lib/plans.js";
import { openInvoicePDF } from "../lib/print.jsx";
import { Btn, Input } from "./ui.jsx";
import { PlanSwitcherModal } from "./UpgradeModal.jsx";
import { isDemoMode, getSupabaseClient, fetchFactures } from "../supabase.js";

function CompteSection({ pharmacie, postes, planInfo, onUpgrade }) {
  const [pwdOld,setPwdOld]=useState(""); const [pwdNew,setPwdNew]=useState(""); const [pwdMsg,setPwdMsg]=useState(null);
  const [pwdLoading,setPwdLoading]=useState(false);
  const [showPlanSwitcher,setShowPlanSwitcher]=useState(false);

  // ─── MFA (double authentification) — 07/08/2026 ──────────────────────────
  // API native Supabase Auth (auth.mfa.*), pas de TOTP maison. Le compte
  // titulaire est le seul concerné ici : il voit l'intégralité des ordonnances
  // (données de santé) de la pharmacie, c'est la cible la plus sensible en cas
  // de mot de passe compromis. Non disponible en mode démo (pas de vraie
  // session Supabase Auth à enrôler).
  const [mfaFactors, setMfaFactors]   = useState([]);
  const [mfaLoading, setMfaLoading]   = useState(!isDemoMode);
  const [mfaEnrolling, setMfaEnrolling] = useState(false);
  const [mfaQr, setMfaQr]             = useState(null);
  const [mfaFactorId, setMfaFactorId] = useState(null);
  const [mfaCode, setMfaCode]         = useState("");
  const [mfaMsg, setMfaMsg]           = useState(null);
  const [mfaBusy, setMfaBusy]         = useState(false);

  useEffect(() => {
    if (isDemoMode) return;
    const sb = getSupabaseClient();
    sb.auth.mfa.listFactors().then(({ data, error }) => {
      if (!error && data) setMfaFactors(data.totp || []);
      setMfaLoading(false);
    }).catch(() => setMfaLoading(false));
  }, []);

  const activeFactor = mfaFactors.find(f => f.status === "verified");

  async function startMfaEnroll() {
    setMfaBusy(true); setMfaMsg(null);
    try {
      const sb = getSupabaseClient();
      const { data, error } = await sb.auth.mfa.enroll({ factorType: "totp" });
      if (error) { setMfaMsg({ok:false,text:error.message}); setMfaBusy(false); return; }
      setMfaFactorId(data.id);
      setMfaQr(data.totp.qr_code);
      setMfaEnrolling(true);
    } catch(e) {
      setMfaMsg({ok:false,text:e.message});
    }
    setMfaBusy(false);
  }

  async function confirmMfaEnroll() {
    if (mfaCode.length !== 6) return;
    setMfaBusy(true); setMfaMsg(null);
    try {
      const sb = getSupabaseClient();
      const { data: challenge, error: chErr } = await sb.auth.mfa.challenge({ factorId: mfaFactorId });
      if (chErr) { setMfaMsg({ok:false,text:chErr.message}); setMfaBusy(false); return; }
      const { error: verErr } = await sb.auth.mfa.verify({ factorId: mfaFactorId, challengeId: challenge.id, code: mfaCode });
      if (verErr) { setMfaMsg({ok:false,text:"Code incorrect — réessayez"}); setMfaBusy(false); return; }
      setMfaEnrolling(false); setMfaQr(null); setMfaCode(""); setMfaFactorId(null);
      setMfaMsg({ok:true,text:"Double authentification activée ✓"});
      const { data } = await sb.auth.mfa.listFactors();
      if (data) setMfaFactors(data.totp || []);
    } catch(e) {
      setMfaMsg({ok:false,text:e.message});
    }
    setMfaBusy(false);
    setTimeout(()=>setMfaMsg(null),4000);
  }

  function cancelMfaEnroll() {
    setMfaEnrolling(false); setMfaQr(null); setMfaCode(""); setMfaFactorId(null); setMfaMsg(null);
  }

  async function disableMfa() {
    if (!activeFactor) return;
    if (!window.confirm("Désactiver la double authentification sur ce compte ?")) return;
    setMfaBusy(true); setMfaMsg(null);
    try {
      const sb = getSupabaseClient();
      const { error } = await sb.auth.mfa.unenroll({ factorId: activeFactor.id });
      if (error) { setMfaMsg({ok:false,text:error.message}); setMfaBusy(false); return; }
      setMfaFactors(prev => prev.filter(f => f.id !== activeFactor.id));
      setMfaMsg({ok:true,text:"Double authentification désactivée"});
    } catch(e) {
      setMfaMsg({ok:false,text:e.message});
    }
    setMfaBusy(false);
    setTimeout(()=>setMfaMsg(null),4000);
  }
  const plan=planInfo||PLAN_LIMITS[pharmacie.plan]||PLAN_LIMITS.starter;
  const postesActifs=(postes||[]).filter(p=>p.actif).length;
  const ordosTraitees=(pharmacie.ordonnances||[]).filter(o=>o.status==="imprime").length;

  // Factures — en démo, données fictives (pas de vraie facturation Stripe à montrer).
  // En production, on lit la table `factures` (alimentée par stripe-webhook avec le
  // montant RÉELLEMENT payé à l'époque) plutôt que de fabriquer des lignes au prix du
  // plan ACTUEL : sinon un changement d'abonnement réécrivait rétroactivement le prix
  // affiché sur toutes les factures passées, y compris celles d'avant le changement.
  const demoInvoices=[
    {id:"INV-2025-006",date:"15/06/2025",desc:`OrdoMail ${plan.label} — Juin 2025`,amount:plan.price,statut:"paid"},
    {id:"INV-2025-005",date:"15/05/2025",desc:`OrdoMail ${plan.label} — Mai 2025`,amount:plan.price,statut:"paid"},
    {id:"INV-2025-004",date:"15/04/2025",desc:`OrdoMail ${plan.label} — Avril 2025`,amount:plan.price,statut:"paid"},
    {id:"INV-2025-003",date:"15/03/2025",desc:`OrdoMail ${plan.label} — Mars 2025`,amount:plan.price,statut:"paid"},
    {id:"INV-2025-002",date:"15/02/2025",desc:`OrdoMail ${plan.label} — Fév. 2025`,amount:plan.price,statut:"paid"},
    {id:"INV-2025-001",date:"15/01/2025",desc:`OrdoMail ${plan.label} — Jan. 2025`,amount:plan.price,statut:"paid"},
  ];
  const [realInvoices,setRealInvoices]=useState(null); // null = pas encore chargé
  useEffect(()=>{
    if (isDemoMode) return;
    fetchFactures(pharmacie.id).then(rows=>{
      setRealInvoices(rows.map(f=>({
        id: f.numero || f.stripe_invoice_id,
        date: new Date(f.created_at).toLocaleDateString("fr-FR"),
        desc: f.period_start
          ? `OrdoMail — ${new Date(f.period_start).toLocaleDateString("fr-FR",{month:"long",year:"numeric"})}`
          : "Abonnement OrdoMail",
        amount: (f.montant_ttc||0)/100,
        statut: f.statut,
        pdfUrl: f.pdf_url,
      })));
    }).catch(()=>setRealInvoices([]));
  },[pharmacie.id]);
  const invoices = isDemoMode ? demoInvoices : (realInvoices||[]);
  const statutLabel = {paid:{txt:"✓",bg:"#dcfce7",color:"#166534"},open:{txt:"⏳",bg:"#fef9c3",color:"#854d0e"},void:{txt:"✕",bg:"#f1f5f9",color:"#64748b"},uncollectible:{txt:"⚠",bg:"#fee2e2",color:"#dc2626"},draft:{txt:"…",bg:"#f1f5f9",color:"#64748b"}};
  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      {/* Infos compte */}
      <div style={{background:"#fff",borderRadius:14,padding:22,boxShadow:"0 2px 10px rgba(0,0,0,0.07)"}}>
        <div style={{fontWeight:800,fontSize:15,marginBottom:16}}>👤 Informations du compte</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:18}}>
          {[["Email",pharmacie.email],["Pharmacie",pharmacie.nom],["Membre depuis",new Date(pharmacie.created_at||pharmacie.createdAt).toLocaleDateString("fr-FR")],["Ordonnances traitées",ordosTraitees],["Postes configurés",`${postesActifs} actifs / ${(postes||[]).length} total`]].map(([l,v])=>(
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
              // Supabase Auth invalide les jetons de session existants lors d'un changement
              // de mot de passe (événement de sécurité) — sans ce refresh explicite, le client
              // continue d'utiliser un access_token désormais rejeté (401) par les requêtes
              // suivantes (RLS, edge functions comme update-pin) jusqu'à sa reconnexion.
              const { error: refreshErr } = await sb.auth.refreshSession();
              if (refreshErr) {
                setPwdMsg({ok:true,text:"Mot de passe mis à jour ✓ — reconnexion nécessaire…"});
                setPwdOld("");setPwdNew("");setPwdLoading(false);
                await sb.auth.signOut().catch(()=>{});
                setTimeout(()=>window.location.reload(), 1500);
                return;
              }
              setPwdMsg({ok:true,text:"Mot de passe mis à jour ✓"});setPwdOld("");setPwdNew("");
            } catch(e) {
              setPwdMsg({ok:false,text:"Erreur : " + e.message});
            }
            setPwdLoading(false);
            setTimeout(()=>setPwdMsg(null),3000);
          }}>{pwdLoading?"Mise à jour…":"Mettre à jour"}</Btn>
          {pwdMsg&&<div style={{marginTop:8,fontSize:12,fontWeight:600,color:pwdMsg.ok?"#15803d":"#dc2626",padding:"6px 10px",background:pwdMsg.ok?"#dcfce7":"#fee2e2",borderRadius:7}}>{pwdMsg.text}</div>}
        </div>
        {/* Double authentification (MFA) */}
        <div style={{borderTop:"1px solid #f0f4ff",paddingTop:14,marginTop:14}}>
          <div style={{fontSize:13,fontWeight:700,color:"#374151",marginBottom:10}}>🛡️ Double authentification</div>
          {isDemoMode ? (
            <div style={{fontSize:12,color:"#94a3b8",background:"#f8fafc",borderRadius:8,padding:"10px 12px"}}>
              Non disponible en mode démo — nécessite un compte réel.
            </div>
          ) : mfaLoading ? (
            <div style={{fontSize:12,color:"#94a3b8"}}>Chargement…</div>
          ) : mfaEnrolling ? (
            <div style={{background:"#f8faff",borderRadius:10,padding:16}}>
              <div style={{fontSize:12,color:"#475569",marginBottom:10,lineHeight:1.6}}>
                Scannez ce QR code avec une application d'authentification (Google Authenticator, Authy…), puis saisissez le code à 6 chiffres généré.
              </div>
              {mfaQr && (
                <div style={{display:"flex",justifyContent:"center",marginBottom:12}}>
                  <img src={mfaQr} alt="QR code MFA" style={{width:160,height:160,background:"#fff",padding:8,borderRadius:8,border:"1px solid #e2e8f0"}}/>
                </div>
              )}
              <div style={{display:"flex",gap:8,alignItems:"flex-end"}}>
                <div style={{flex:1}}>
                  <Input label="Code à 6 chiffres" value={mfaCode} onChange={v=>setMfaCode(v.replace(/\D/g,"").slice(0,6))} placeholder="123456" icon="🔢"/>
                </div>
                <Btn small disabled={mfaBusy||mfaCode.length!==6} onClick={confirmMfaEnroll}>{mfaBusy?"…":"Confirmer"}</Btn>
                <Btn variant="secondary" small disabled={mfaBusy} onClick={cancelMfaEnroll}>Annuler</Btn>
              </div>
            </div>
          ) : activeFactor ? (
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"#dcfce7",borderRadius:8,padding:"10px 12px"}}>
              <span style={{fontSize:12,fontWeight:700,color:"#15803d"}}>✓ Activée</span>
              <Btn variant="danger" small disabled={mfaBusy} onClick={disableMfa}>{mfaBusy?"…":"Désactiver"}</Btn>
            </div>
          ) : (
            <Btn variant="secondary" small disabled={mfaBusy} onClick={startMfaEnroll}>{mfaBusy?"…":"Activer la double authentification"}</Btn>
          )}
          {mfaMsg&&<div style={{marginTop:8,fontSize:12,fontWeight:600,color:mfaMsg.ok?"#15803d":"#dc2626",padding:"6px 10px",background:mfaMsg.ok?"#dcfce7":"#fee2e2",borderRadius:7}}>{mfaMsg.text}</div>}
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
        {!isDemoMode && realInvoices===null ? (
          <div style={{fontSize:12,color:"#94a3b8",padding:"12px 0"}}>Chargement…</div>
        ) : invoices.length===0 ? (
          <div style={{fontSize:12,color:"#94a3b8",padding:"12px 0"}}>Aucune facture pour l'instant.</div>
        ) : (
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
          <thead><tr style={{borderBottom:"2px solid #f0f4ff"}}>{["N°","Date","Description","Montant","",""].map((h,i)=><th key={i} style={{padding:"0 0 8px",textAlign:"left",fontSize:10,fontWeight:700,color:"#94a3b8",textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
          <tbody>{invoices.map(inv=>{
            const st = statutLabel[inv.statut] || statutLabel.paid;
            return (
            <tr key={inv.id} style={{borderBottom:"1px solid #f8fafc"}}>
              <td style={{padding:"8px 0",fontFamily:"monospace",fontSize:10,color:"#94a3b8"}}>{inv.id}</td>
              <td style={{padding:"8px 0",color:"#475569"}}>{inv.date}</td>
              <td style={{padding:"8px 0",fontWeight:500}}>{inv.desc}</td>
              <td style={{padding:"8px 0",fontWeight:800}}>{inv.amount.toFixed(2)} €</td>
              <td style={{padding:"8px 0"}}><span style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:20,background:st.bg,color:st.color}}>{st.txt}</span></td>
              <td style={{padding:"8px 0",textAlign:"right"}}>
                {isDemoMode
                  ? <button onClick={()=>openInvoicePDF(inv,pharmacie,pharmacie.plan)} style={{fontSize:11,color:"#3b82f6",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>📄</button>
                  : inv.pdfUrl && <a href={inv.pdfUrl} target="_blank" rel="noopener noreferrer" style={{fontSize:11,color:"#3b82f6",fontWeight:600,textDecoration:"none"}}>📄</a>}
              </td>
            </tr>
          );})}</tbody>
        </table>
        )}
        {invoices.length>0 && (
        <div style={{marginTop:12,padding:"8px 12px",background:"#f8fafc",borderRadius:8,fontSize:12,color:"#94a3b8",display:"flex",justifyContent:"space-between"}}>
          <span>Total</span><span style={{fontWeight:700,color:"#1a1a1a"}}>{invoices.reduce((s,i)=>s+i.amount,0).toFixed(2)} €</span>
        </div>
        )}
      </div>
      {/* Zone danger */}
      <div style={{background:"#fff",borderRadius:14,padding:20,border:"1px solid #fee2e2"}}>
        <div style={{fontWeight:700,fontSize:14,color:"#dc2626",marginBottom:10}}>⚠️ Zone de danger</div>
        <div style={{fontSize:13,color:"#64748b",marginBottom:12}}>La suppression est définitive. Les données sont conservées 90 jours.</div>
        <Btn variant="danger" small>🗑 Supprimer mon compte</Btn>
      </div>
      {showPlanSwitcher&&<PlanSwitcherModal pharmacie={pharmacie} postes={postes||[]} onConfirm={onUpgrade} onClose={()=>setShowPlanSwitcher(false)}/>}
    </div>
  );
}

export { CompteSection };
export default CompteSection;
