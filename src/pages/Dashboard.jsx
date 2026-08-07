// @version 17/07/2026 13:36 — audit-logs
// @ordomail-deploy 15/07/2026 02:22
import { useState, useEffect, useRef } from "react";
import { PLAN_LIMITS } from "../lib/plans.js";
import { timeAgo, getOrdoAccent, isSameDay, toDateKey, formatDateLabel } from "../lib/utils.js";
import { extractFromFile, prewarmTesseract } from "../lib/ocr.js";
import { OrdoCard, OrdoRow, OrdoGroup } from "../components/OrdoCard.jsx";
import { PrintConfirmModal, ViewerModal } from "../components/PrintModal.jsx";
import { UpgradeModal } from "../components/UpgradeModal.jsx";
import { OffresSection } from "../components/OffresSection.jsx";
import { AbonnementSection } from "../components/AbonnementSection.jsx";
import { CompteSection } from "../components/CompteSection.jsx";
import { StoriesSection } from "../components/StoriesSection.jsx";
import { Btn, Input } from "../components/ui.jsx";
import { LogsPanel } from "../components/LogsPanel.jsx";
import { QRCode } from "../components/QRCode.jsx";
import {
  fetchPharmacie,
  savePharmacie,
  savePostes,
  fetchOrdonnances,
  updateOrdoStatus,
  updateOrdoExtracted,
  uploadOrdoFile,
  subscribeToPharmacy,
  addAuditLog,
  changePlan,
  isDemoMode,
  getSupabaseClient,
  getSignedUrl,
  fetchInteretsDuJour,
  appellerPatient,
} from "../supabase.js";

const APP_VERSION = "v6.1 · 13/07/2026 16:10";

function ParametresTab({ pharmacie, onSave, onPlanChanged }) {
  const [section, setSection] = useState("pharmacie");
  const [showUpgrade, setShowUpgrade] = useState(null);
  const [nom, setNom] = useState(pharmacie.nom||"");
  const [adresse, setAdresse] = useState(pharmacie.adresse||"");
  const [couleur, setCouleur] = useState(pharmacie.couleur||"#1a3a6e");
  const [emailNotif, setEmailNotif] = useState(pharmacie.email||"");
  const [smtpHost, setSmtpHost] = useState(pharmacie.smtp?.host||"");
  const [postes, setPostes] = useState(pharmacie.postes||[]);
  const [saved, setSaved] = useState(false);
  const planInfo = PLAN_LIMITS[pharmacie.plan] || PLAN_LIMITS.starter;

  async function addPoste() {
    // Utiliser le planInfo à jour (basé sur pharmacie.plan actuel)
    const currentPlanInfo = PLAN_LIMITS[pharmacie.plan] || planInfo;
    const actifs = postes.filter(p=>p.actif).length;
    if (actifs >= currentPlanInfo.maxPostes) {
      setShowUpgrade({reason:`Votre plan ${currentPlanInfo.label} est limité à ${currentPlanInfo.maxPostes} poste(s) actif(s). Passez au plan supérieur pour en ajouter davantage.`});
      return;
    }
    const nom = `Poste ${postes.length + 1}`;
    if (isDemoMode) {
      const db = window._ordomailDB;
      const ph = db?.pharmacies?.find(p => p.id === pharmacie.id);
      const newPoste = { id:`p${Date.now()}`, nom, pin:null, actif:true };
      if (ph) ph.postes = [...(ph.postes||[]), newPoste];
      setPostes(prev => [...prev, newPoste]);
    } else {
      const sb = getSupabaseClient();
      const { data, error } = await sb.from("pharmacie_postes")
        .insert({ pharmacie_id: pharmacie.id, nom, actif: true })
        .select().single();
      if (!error && data) {
        setPostes(prev => [...prev, data]);
      }
    }
  }
  function removePoste(id) {
    if (postes.length <= 1) return;
    setPostes(prev=>prev.filter(p=>p.id!==id));
  }
  async function handleSave() {
    // Collecter les PINs modifiés (pour les hasher via Edge Function en prod)
    const pinChanges = {};
    postes.forEach(p => { if (p.pin && p.pin.length === 4 && /^\d{4}$/.test(p.pin)) pinChanges[p.id] = p.pin; });
    await Promise.all([
      onSave({nom,adresse,couleur,email:emailNotif}),
      savePostes(pharmacie.id, postes.map(p=>({...p,pin:undefined})), pinChanges),
    ]);
    setSaved(true); setTimeout(()=>setSaved(false),2500);
  }

  const tabs = [["pharmacie","🏥","Pharmacie"],["postes","🖥️","Postes"],["offres","🎯","Offres"],["stories","📊","Stories"],["email","✉️","Email"],["abonnement","💳","Abonnement"],["compte","👤","Compte"]];

  return (
    <div style={{flex:1,overflow:"auto",display:"flex",flexDirection:"column"}}>
      <div style={{background:"#fff",borderBottom:"1px solid #e0e7ff",padding:"10px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0,flexWrap:"wrap",gap:8}}>
        <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
          {tabs.map(([k,icon,label])=>(
            <button key={k} onClick={()=>setSection(k)} style={{padding:"6px 12px",border:`1.5px solid ${section===k?"#1a3a6e":"#e0e7ff"}`,borderRadius:8,background:section===k?"#1a3a6e":"#fff",color:section===k?"#fff":"#64748b",fontWeight:section===k?700:500,fontSize:12,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:5}}>
              <span>{icon}</span><span className="hide-mobile">{label}</span>
            </button>
          ))}
        </div>
        <Btn onClick={handleSave} small style={{background:saved?"#15803d":"#1a3a6e",color:"#fff"}}>
          {saved?"✅ Sauvegardé":"💾 Sauvegarder"}
        </Btn>
      </div>
      <div style={{flex:1,overflow:"auto",padding:16}}>

        {section==="pharmacie"&&(
          <div style={{background:"#fff",borderRadius:14,padding:22,boxShadow:"0 2px 10px rgba(0,0,0,0.07)"}}>
            <Input label="Nom de la pharmacie" value={nom} onChange={setNom} placeholder="Pharmacie..." icon="🏥"/>
            <Input label="Adresse" value={adresse} onChange={setAdresse} placeholder="12 rue..." icon="📍"/>
            <div style={{marginBottom:14}}>
              <label style={{fontSize:12,fontWeight:700,color:"#374151",display:"block",marginBottom:5}}>Couleur de la pharmacie</label>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <input type="color" value={couleur} onChange={e=>setCouleur(e.target.value)} style={{width:40,height:40,border:"none",cursor:"pointer",borderRadius:8}}/>
                <span style={{fontSize:14,fontFamily:"monospace",fontWeight:700,color:couleur}}>{couleur}</span>
                <div style={{width:32,height:32,borderRadius:8,background:couleur}}/>
              </div>
            </div>
          </div>
        )}

        {section==="postes"&&(
          <div style={{background:"#fff",borderRadius:14,padding:22,boxShadow:"0 2px 10px rgba(0,0,0,0.07)"}}>
            <div style={{fontWeight:800,fontSize:15,marginBottom:14}}>🖥️ Gestion des postes</div>
            {/* Code pharmacie pour connexion vendeurs */}
            <div style={{background:"#f0fdf4",border:"1.5px solid #bbf7d0",borderRadius:12,padding:"12px 16px",marginBottom:16,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div>
                <div style={{fontSize:11,fontWeight:700,color:"#15803d",textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>Code de connexion vendeurs</div>
                <div style={{fontSize:30,fontWeight:900,color:"#1a3a2a",fontFamily:"monospace",letterSpacing:6}}>{pharmacie.code_vendeur||pharmacie.codeVendeur||"------"}</div>
                <div style={{fontSize:11,color:"#64748b",marginTop:4}}>Communiquez ce code à vos vendeurs — ils le saisissent avant leur code PIN</div>
              </div>
              <div style={{fontSize:40}}>🔑</div>
            </div>
            {postes.map((poste,i)=>(
              <div key={poste.id} style={{background:"#f8faff",borderRadius:10,padding:"12px 14px",marginBottom:8,border:"1px solid #e0e7ff"}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                  <div style={{width:30,height:30,borderRadius:7,background:poste.actif?"#1a3a6e":"#ddd",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:12,flexShrink:0}}>{i+1}</div>
                  <input value={poste.nom} onChange={e=>setPostes(prev=>prev.map(p=>p.id===poste.id?{...p,nom:e.target.value}:p))}
                    style={{flex:1,border:"none",background:"transparent",fontSize:14,fontWeight:600,outline:"none",fontFamily:"inherit"}}/>
                  <div onClick={()=>setPostes(prev=>prev.map(p=>p.id===poste.id?{...p,actif:!p.actif}:p))}
                    style={{width:40,height:22,borderRadius:11,background:poste.actif?"#1a3a6e":"#ddd",cursor:"pointer",position:"relative",flexShrink:0}}>
                    <div style={{position:"absolute",top:3,left:poste.actif?21:3,width:16,height:16,borderRadius:"50%",background:"#fff",transition:"left 0.2s"}}/>
                  </div>
                  <button onClick={()=>removePoste(poste.id)} style={{background:"none",border:"none",color:"#e53e3e",cursor:"pointer",fontSize:16,padding:"0 4px"}}>✕</button>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8,paddingTop:8,borderTop:"1px solid #e0e7ff",flexWrap:"wrap"}}>
                  <span style={{fontSize:11,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:0.5}}>PIN vendeur</span>
                  <input type="password" maxLength={4}
                    value={poste.pin||""}
                    onChange={e=>{
                      const v=e.target.value.replace(/[^0-9]/g,"").slice(0,4);
                      setPostes(prev=>prev.map(p=>p.id===poste.id?{...p,pin:v,_pinSaved:false}:p));
                    }}
                    onBlur={async e=>{
                      const v=e.target.value.replace(/[^0-9]/g,"").slice(0,4);
                      if(v.length!==4) return;
                      // Sauvegarder le PIN en Supabase via Edge Function update-pin
                      try {
                        const sb = getSupabaseClient();
                        if(isDemoMode) {
                          // Mode démo : sauvegarder le PIN dans la DB mémoire
                          const db = window._ordomailDB || window.__ordomailDB;
                          if (db) {
                            const ph = db.pharmacies?.find(p => p.id === pharmacie.id);
                            if (ph) {
                              const posteIdx = (ph.postes || []).findIndex(p => p.id === poste.id);
                              if (posteIdx !== -1) ph.postes[posteIdx].pin = v;
                            }
                          }
                        } else {
                          // update-pin exige désormais le jeton du titulaire connecté (phase 1 sécurité)
                          const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
                          const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
                          const { data: { session } } = await sb.auth.getSession();
                          await fetch(`${supabaseUrl}/functions/v1/update-pin`, {
                            method: 'POST',
                            headers: {
                              'Content-Type': 'application/json',
                              'apikey': supabaseKey,
                              'Authorization': `Bearer ${session?.access_token || ''}`,
                            },
                            body: JSON.stringify({ posteId: poste.id, pin: v }),
                          });
                        }
                        setPostes(prev=>prev.map(p=>p.id===poste.id?{...p,_pinSaved:true,pin:v}:p));
                      } catch(err) {
                        console.error("[PIN save]", err.message);
                      }
                    }}
                    placeholder="••••"
                    style={{width:80,border:`1.5px solid ${poste._pinSaved?"#15803d":poste.pin&&poste.pin.length===4?"#f59e0b":"#c7d2fe"}`,borderRadius:6,padding:"4px 10px",fontSize:16,fontFamily:"monospace",textAlign:"center",outline:"none",transition:"border 0.2s"}}/>
                  <span style={{fontSize:11,fontWeight:600,color:poste._pinSaved?"#15803d":poste.pin&&poste.pin.length===4?"#f59e0b":"#94a3b8"}}>
                    {poste._pinSaved ? "✅ Enregistré" : poste.pin && poste.pin.length===4 ? "En attente..." : "⚠️ PIN manquant"}
                  </span>
                  {poste.pin && poste.pin.length === 4 && !poste._pinSaved && (
                    <button
                      onClick={async () => {
                        const v = poste.pin;
                        try {
                          const sb = getSupabaseClient();
                          if (isDemoMode) {
                            const db = window._ordomailDB || window.__ordomailDB;
                            if (db) {
                              const ph = db.pharmacies?.find(p => p.id === pharmacie.id);
                              if (ph) {
                                const idx = (ph.postes||[]).findIndex(p => p.id === poste.id);
                                if (idx !== -1) ph.postes[idx].pin = v;
                              }
                            }
                          } else {
                            await sb.functions.invoke("update-pin", { body: { posteId: poste.id, pin: v } });
                          }
                          setPostes(prev => prev.map(p => p.id===poste.id ? {...p, _pinSaved:true} : p));
                        } catch(err) { console.error("[PIN save]", err.message); }
                      }}
                      style={{
                        padding:"3px 10px", border:"none", borderRadius:6,
                        background:"#1a3a6e", color:"#fff", fontWeight:700,
                        fontSize:12, cursor:"pointer", fontFamily:"inherit",
                      }}>
                      Sauvegarder
                    </button>
                  )}
                  <span style={{fontSize:10,color:"#94a3b8",marginLeft:"auto"}}>Rôle : Vendeur</span>
                </div>
              </div>
            ))}
            <Btn variant="ghost" small onClick={addPoste} style={{width:"100%",justifyContent:"center",borderStyle:"dashed",marginTop:4}}>+ Ajouter un poste</Btn>
            <div style={{marginTop:16,background:"#f0f7ff",borderRadius:12,padding:"14px 16px",border:"1px solid #dbeafe"}}>
              <div style={{fontWeight:700,fontSize:13,color:"#1a3a6e",marginBottom:8}}>Qui accède à quoi ?</div>
              <div style={{display:"flex",flexDirection:"column",gap:5}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"6px 10px",background:"#fff",borderRadius:8}}>
                  <span style={{fontWeight:700,color:"#1a3a6e"}}>👑 Titulaire (PSC)</span>
                  <span style={{color:"#15803d",fontWeight:600}}>Accès complet</span>
                </div>
                {postes.filter(p=>p.actif).map(p=>(
                  <div key={p.id} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"6px 10px",background:"#fff",borderRadius:8}}>
                    <span style={{fontWeight:600,color:"#475569"}}>🖥️ {p.nom} · PIN {p.pin?"•".repeat(p.pin.length):"—"}</span>
                    <span style={{color:"#0369a1",fontWeight:600}}>Ordonnances + Impression</span>
                  </div>
                ))}
              </div>
              <div style={{marginTop:8,fontSize:11,color:"#64748b",lineHeight:1.6}}>ℹ️ C'est le titulaire qui crée et modifie les codes PIN depuis cette page.</div>
            </div>
          </div>
        )}

        {section==="email"&&(
          <div style={{background:"#fff",borderRadius:14,padding:22,boxShadow:"0 2px 10px rgba(0,0,0,0.07)"}}>
            <div style={{fontWeight:800,fontSize:15,marginBottom:14}}>✉️ Configuration email</div>
            <div style={{background:"#f0f7ff",borderRadius:10,padding:"10px 14px",marginBottom:14,border:"1px solid #dbeafe",fontSize:13}}>
              <div style={{fontWeight:700,color:"#1a3a6e",marginBottom:4}}>Adresse de réception ordonnances</div>
              <code style={{fontSize:13,color:"#0369a1"}}>{pharmacie.emailReception||`${pharmacie.id}@in.ordomail.fr`}</code>
              <div style={{fontSize:11,color:"#64748b",marginTop:4}}>Les patients envoient leurs ordonnances à cette adresse. Elle est automatiquement traitée par OrdoMail.</div>
            </div>
            <Input label="Email de notification" value={emailNotif} onChange={setEmailNotif} type="email" placeholder="contact@pharmacie.fr" icon="✉️"/>
            <div style={{borderTop:"1px solid #f0f4ff",paddingTop:14,marginTop:4}}>
              <div style={{fontSize:13,fontWeight:700,color:"#374151",marginBottom:10}}>SMTP personnalisé (optionnel)</div>
              <Input label="Serveur SMTP" value={smtpHost} onChange={setSmtpHost} placeholder="smtp.gmail.com" icon="🌐"/>
            </div>
          </div>
        )}

        {section==="offres"&&(
          <OffresSection pharmacie={pharmacie} planInfo={planInfo}/>
        )}
        {section==="stories"&&(
          <StoriesSection pharmacie={pharmacie}/>
        )}
        {section==="abonnement"&&(
          <AbonnementSection pharmacie={pharmacie} onUpgrade={async (newPlan)=>{
            try {
              await changePlan(pharmacie.id, newPlan);
              // Recharger la pharmacie (plan à jour) depuis le parent, qui possède l'état
              const ph = await onPlanChanged?.();
              if (ph) setPostes(ph.postes || []);
            } catch(e) {
              console.error("[changePlan]", e.message);
            }
          }}/>
        )}

        {section==="compte"&&(
          <CompteSection pharmacie={pharmacie} postes={postes} planInfo={planInfo} onUpgrade={async (newPlan)=>{
            try {
              await changePlan(pharmacie.id, newPlan);
              const ph = await onPlanChanged?.();
              if (ph) setPostes(ph.postes || []);
            } catch(e) { console.error("[changePlan]", e.message); }
          }}/>
        )}

      </div>

      {showUpgrade&&(
        <UpgradeModal currentPlan={pharmacie.plan} reason={showUpgrade.reason}
          onConfirm={async (newPlan)=>{
            try {
              await changePlan(pharmacie.id, newPlan);
              setShowUpgrade(null);
              const ph = await onPlanChanged?.();
              if (ph) setPostes(ph.postes || []);
              await addPoste();
            } catch(e) {
              console.error("[upgrade]", e.message);
              setShowUpgrade(null);
            }
          }}
          onClose={()=>setShowUpgrade(null)}/>
      )}
    </div>
  );
}

function QRNFCTab({ pharmacie, couleur, qrUrl, onPatientPage }) {
  const [nfcStatus, setNfcStatus] = useState("idle");
  const [activeSection, setActiveSection] = useState("qr");
  const isLocal = typeof window !== "undefined" &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

  async function handleNFCWrite() {
    if (!("NDEFReader" in window)) { setNfcStatus("unsupported"); return; }
    try {
      setNfcStatus("writing");
      const ndef = new window.NDEFReader();
      await ndef.write({ records: [{ recordType: "url", data: qrUrl }] });
      setNfcStatus("success");
    } catch { setNfcStatus("error"); }
  }

  async function handlePrint() {
    // Récupérer le QR code déjà généré
    const qrImg = document.querySelector("#qr-print-img");
    let qrSrc = qrImg?.src || "";

    // Générer si pas encore chargé
    if (!qrSrc || !qrSrc.startsWith("data:")) {
      try {
        const mod = await import("qrcode");
        const QR = mod.default || mod;
        qrSrc = await QR.toDataURL(qrUrl, {
          errorCorrectionLevel: "H",
          margin: 1,
          width: 600,
          color: { dark: "#000000", light: "#ffffff" },
        });
      } catch { qrSrc = ""; }
    }

    const nom = pharmacie?.nom?.toUpperCase() || "VOTRE PHARMACIE";
    const bg  = "#d6e8e0"; // vert menthe clair comme sur le design

    const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8">
<title>OrdoMail — ${nom}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;800;900&display=swap');
@page { size: A4 portrait; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: 'Inter', Arial, sans-serif;
  background: ${bg};
  width: 210mm; height: 297mm;
  display: flex; flex-direction: column;
  align-items: center;
  padding: 8mm 12mm 5mm;
  overflow: hidden;
  print-color-adjust: exact;
  -webkit-print-color-adjust: exact;
}
.logo-row { display: flex; align-items: center; gap: 8px; margin-bottom: 4mm; }
.logo-pill { width: 26px; height: 26px; background: linear-gradient(135deg, #1a6e3a, #2d9d5e); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; }
.logo-text { font-size: 20px; font-weight: 900; color: #1a1a1a; }
.logo-text span { color: #1a6e3a; }
.title-band { background: #1a4a35; width: 100%; border-radius: 10px 10px 0 0; padding: 7px 16px; display: flex; align-items: center; justify-content: center; gap: 10px; }
.cross { font-size: 18px; color: rgba(255,255,255,0.4); }
.title-text { font-size: 21px; font-weight: 900; color: #fff; letter-spacing: 1px; text-transform: uppercase; }
.pharma-band { background: #c8ddd5; width: 100%; padding: 6px 16px; text-align: center; margin-bottom: 3mm; border-radius: 0 0 6px 6px; }
.pharma-name { font-size: 17px; font-weight: 900; color: #1a3a2a; letter-spacing: 1.5px; text-transform: uppercase; }

/* QR — flex:1 pour prendre tout l'espace disponible */
.qr-card { background: #e8f2ee; border-radius: 14px; width: 100%; padding: 3mm 4mm; display: flex; flex-direction: column; align-items: center; margin-bottom: 1.5mm; flex: 0; }
.method-badge { background: #1a4a35; border-radius: 8px; padding: 6px 20px; font-size: 22px; font-weight: 900; color: #fff; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 3mm; width: 100%; text-align: center; }
.qr-wrap { background: #fff; border-radius: 12px; padding: 4mm; display: inline-block; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
.qr-wrap img { width: 122mm; height: 122mm; display: block; }

/* NFC card */
.nfc-card { background: linear-gradient(135deg, #1a4a35 0%, #2d6e50 100%); border-radius: 14px; width: 100%; overflow: hidden; flex-shrink: 0; }
.nfc-top { padding: 4mm 7mm; display: flex; align-items: center; gap: 5mm; }

/* Logo NFC officiel : cercle blanc avec ondes + texte NFC */
.nfc-logo-wrap {
  width: 62px; height: 62px; flex-shrink: 0;
  background: #fff;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
}

.nfc-method-text { flex: 1; }

/* Titre sur UNE seule ligne */
.nfc-method-title { font-size: 22px; font-weight: 900; color: #fff; text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap; }

.nfc-bottom { background: #c8ddd5; padding: 4mm 7mm; text-align: center; }
.nfc-instruction { font-size: 21px; font-weight: 800; color: #1a3a2a; line-height: 1.45; }

@media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } .no-print { display: none !important; } }
</style></head>
<body>

<div class="logo-row">
  <div class="logo-pill">&#128138;</div>
  <div class="logo-text">Ordo<span>Mail</span></div>
</div>

<div class="title-band">
  <span class="cross">&#10010;</span>
  <span class="title-text">Envoyez votre ordonnance</span>
  <span class="cross">&#10010;</span>
</div>

<div class="pharma-band">
  <div class="pharma-name">${nom}</div>
</div>

<div class="qr-card">
  <div class="method-badge">M&#233;thode 1 : Scannez le code QR</div>
  <div class="qr-wrap">
    ${qrSrc ? `<img src="${qrSrc}" alt="QR"/>` : `<div style="width:122mm;height:122mm;display:flex;align-items:center;justify-content:center;color:#aaa">QR non disponible</div>`}
  </div>
</div>

<div class="nfc-card">
  <div class="nfc-top">

    <!-- Logo NFC officiel : cercle blanc + ondes wifi + NFC -->
    <div class="nfc-logo-wrap">
      <svg width="46" height="46" viewBox="0 0 46 46" fill="none" xmlns="http://www.w3.org/2000/svg">
        <!-- Cercle extérieur -->
        <circle cx="23" cy="23" r="21" stroke="#111" stroke-width="2.5" fill="white"/>
        <!-- Arc externe (grand) -->
        <path d="M10.5 20 C10.5 13.1 16.2 7.5 23 7.5 C29.8 7.5 35.5 13.1 35.5 20" stroke="#111" stroke-width="2.8" stroke-linecap="round" fill="none"/>
        <!-- Arc moyen -->
        <path d="M14 21.5 C14 16.8 18.1 13 23 13 C27.9 13 32 16.8 32 21.5" stroke="#111" stroke-width="2.8" stroke-linecap="round" fill="none"/>
        <!-- Arc interne (petit) -->
        <path d="M17.5 23 C17.5 20.5 20 18.5 23 18.5 C26 18.5 28.5 20.5 28.5 23" stroke="#111" stroke-width="2.8" stroke-linecap="round" fill="none"/>
        <!-- Point central -->
        <circle cx="23" cy="25.5" r="2.2" fill="#111"/>
        <!-- Texte NFC -->
        <text x="23" y="38.5" text-anchor="middle" font-family="Arial, sans-serif" font-weight="900" font-size="8.5" fill="#111" letter-spacing="1.5">NFC</text>
      </svg>
    </div>

    <div class="nfc-method-text">
      <div class="nfc-method-title">M&#233;thode 2 : Ouverture automatique</div>
    </div>
  </div>
  <div class="nfc-bottom">
    <div class="nfc-instruction">Approchez votre t&#233;l&#233;phone du badge<br>pour ouvrir la page d'envoi automatiquement</div>
  </div>
</div>

</body>
<button class="no-print" onclick="window.print()" style="position:fixed;bottom:16px;right:16px;background:#1a4a35;color:#fff;border:none;border-radius:10px;padding:10px 22px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit">
  &#128438; Imprimer / PDF
</button>
</html>`;

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const blobUrl = URL.createObjectURL(blob);
    const win = window.open(blobUrl, "_blank");
    if (win) { win.focus(); setTimeout(() => URL.revokeObjectURL(blobUrl), 30000); }
  }

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "20px" }}>
      {/* Toggle QR / NFC */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {[["qr", "📱 QR Code"], ["nfc", "🏷️ Badge NFC"]].map(([k, l]) => (
          <button key={k} onClick={() => setActiveSection(k)} style={{
            padding: "8px 18px", border: `1.5px solid ${activeSection === k ? couleur : "#e0e0e0"}`,
            borderRadius: 20, background: activeSection === k ? couleur : "#fff",
            color: activeSection === k ? "#fff" : "#555", fontWeight: 700, fontSize: 13,
            cursor: "pointer", fontFamily: "inherit",
          }}>{l}</button>
        ))}
      </div>

      {/* ── Section QR ── */}
      {activeSection === "qr" && (
        <div style={{ maxWidth: 420, margin: "0 auto" }}>
          {/* Badge environnement */}
          <div style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"4px 12px", borderRadius:20, fontSize:11, fontWeight:700, marginBottom:12,
            background: isLocal ? "#fef9c3" : "#dcfce7",
            color: isLocal ? "#92400e" : "#166534" }}>
            {isLocal ? "🧪 Mode test local — localhost:5173" : "🌐 Production"}
          </div>

          {/* QR Code */}
          <div style={{ textAlign: "center", marginBottom: 16 }}>
            <div id="qr-container" style={{ display: "inline-block", background: "#fff", padding: 16, borderRadius: 14, boxShadow: `0 4px 20px ${couleur}22`, border: `2px solid ${couleur}18` }}>
              <QRCode url={qrUrl} size={220} color={couleur} printId="qr-print-img" />
            </div>
          </div>

          {/* Nom pharmacie */}
          <div style={{ textAlign: "center", fontWeight: 800, fontSize: 16, marginBottom: 4 }}>{pharmacie?.nom}</div>



          {/* Avertissement local */}
          {isLocal && (
            <div style={{ marginBottom: 14, fontSize: 12, color: "#92400e", background: "#fef9c3", border: "1px solid #fde68a", borderRadius: 8, padding: "10px 14px", lineHeight: 1.7 }}>
              <div style={{ fontWeight: 800, marginBottom: 5 }}>🧪 Mode test local</div>
              <div style={{ marginBottom: 4 }}>Le QR code encode <code style={{background:"#fff",padding:"1px 5px",borderRadius:3}}>localhost</code> — illisible depuis un téléphone.</div>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Pour tester sur téléphone :</div>
              <div>1. Repérer l'adresse <strong>Network</strong> dans le terminal après <code style={{background:"#fff",padding:"1px 4px",borderRadius:3}}>npm run dev</code></div>
              <div>2. Elle ressemble à : <code style={{background:"#fff",padding:"2px 5px",borderRadius:3}}>http://192.168.1.X:5173</code></div>
              <div>3. Scanner le QR code depuis votre téléphone sur le même réseau Wi-Fi</div>
            </div>
          )}

          {/* Mode d'emploi */}
          <div style={{ background: "#f8f9ff", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#555", marginBottom: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 6, color: couleur }}>📷 Mode d'emploi</div>
            <div style={{ lineHeight: 1.9 }}>
              <div>1. Imprimez et affichez ce QR code à l'accueil</div>
              <div>2. Le patient scanne avec l'appareil photo de son téléphone</div>
              <div>3. La page s'ouvre directement — sans application</div>
              <div>4. Il prend une photo et envoie son ordonnance</div>
            </div>
          </div>

          {/* Boutons */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <button onClick={() => onPatientPage(pharmacie)} style={{
              padding: "13px", border: "none", borderRadius: 10, background: couleur,
              color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}>📱 Tester la page</button>
            <button onClick={handlePrint} style={{
              padding: "13px", border: `1.5px solid ${couleur}`, borderRadius: 10,
              background: "#fff", color: couleur, fontWeight: 700, fontSize: 14,
              cursor: "pointer", fontFamily: "inherit",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}>🖨️ Imprimer</button>
          </div>
        </div>
      )}

      {/* ── Section NFC ── */}
      {activeSection === "nfc" && (
        <div style={{ maxWidth: 420, margin: "0 auto" }}>
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <div style={{ fontSize: 52, marginBottom: 16 }}>🏷️</div>
            <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 8 }}>Badge NFC</div>
            <div style={{ fontSize: 14, color: "#64748b", marginBottom: 24, lineHeight: 1.7 }}>
              Programmez un badge NTAG213 (~0,50€). Le patient approche son téléphone — la page s'ouvre instantanément.
            </div>
            {nfcStatus === "idle" && (
              <button onClick={handleNFCWrite} style={{ padding: "13px 28px", border: "none", borderRadius: 12, background: couleur, color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}>
                📡 Programmer un badge NFC
              </button>
            )}
            {nfcStatus === "writing" && <div style={{ color: couleur, fontWeight: 700 }}>📡 Approchez le badge…</div>}
            {nfcStatus === "success" && <div style={{ color: "#15803d", fontWeight: 800, fontSize: 16 }}>✅ Badge programmé !</div>}
            {nfcStatus === "error"   && <div style={{ color: "#dc2626", fontWeight: 700 }}>⚠️ Erreur — Réessayez</div>}
            {nfcStatus === "unsupported" && (
              <div style={{ background: "#fef9c3", border: "1px solid #fde68a", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#92400e", textAlign: "left" }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>NFC non disponible dans ce navigateur</div>
                <div>Utilisez Chrome sur Android. Sur iPhone, la programmation NFC n'est pas prise en charge (lecture seule).</div>
              </div>
            )}
          </div>
          <div style={{ background: "#f8f9ff", borderRadius: 10, padding: "12px 14px", fontSize: 12, color: "#64748b", lineHeight: 1.8 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Compatibilité</div>
            <div>📱 Programmation : Chrome Android uniquement</div>
            <div>✅ Lecture : iPhone 7+ et Android avec NFC</div>
            <div>🛒 Badge NTAG213 : ~0,50€ sur Amazon</div>
          </div>
        </div>
      )}
    </div>
  );
}

function BottomNav({ tab, showLogs, canAdmin, setTab, setShowLogs }) {
  const items = [
    { id: "ordonnances", icon: "📋", label: "Ordo", always: true },
    { id: "qrcode",      icon: "📱", label: "QR Code", adminOnly: true },
    { id: "parametres",  icon: "⚙️", label: "Paramètres", adminOnly: true },
    { id: "logs",        icon: "🗒️", label: "Logs", adminOnly: true },
  ].filter(it => !it.adminOnly || canAdmin);
  const active = showLogs ? "logs" : tab;
  return (
    <nav style={{ position:"fixed", bottom:0, left:0, right:0, zIndex:200, background:"#fff", borderTop:"1px solid #e2e8f0", display:"flex", justifyContent:"space-around", alignItems:"stretch", height:60 }} className="bottom-nav">
      {items.map(it => {
        const isActive = active === it.id;
        return (
          <button key={it.id} onClick={() => { if(it.id==="logs"){setShowLogs(true);}else{setTab(it.id);setShowLogs(false);} }}
            style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:2, border:"none", background:"none", cursor:"pointer", fontFamily:"inherit", borderTop: isActive?"2px solid #1a3a6e":"2px solid transparent" }}>
            <span style={{ fontSize:20 }}>{it.icon}</span>
            <span style={{ fontSize:9, fontWeight:isActive?800:500, color:isActive?"#1a3a6e":"#94a3b8" }}>{it.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function PharmacieDashboard({ pharmacieId, onLogout, onPatientPage, userRole = "admin", userId = "demo" }) {
  const [pharmacie, setPharmacie] = useState(null);
  const [ordonnances, setOrdonnances] = useState([]);
  const [interetsDuJour, setInteretsDuJour] = useState([]); // intérêts offres du jour
  const [dashLoading, setDashLoading] = useState(true);
  const [tab, setTab] = useState("ordonnances");
  const [showLogs, setShowLogs] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()));
  const [viewMode, setViewMode] = useState("grid");
  const [loadingId, setLoadingId] = useState(null);
  const [viewerAtt, setViewerAtt] = useState(null);
  const [printModal, setPrintModal] = useState(null);
  const [filterStatus, setFilterStatus] = useState("nouveau");
  const [showCalendar, setShowCalendar] = useState(false);
  const [calMonth, setCalMonth]         = useState(() => {
    const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() };
  });

  const searchRef = useRef(null);
  const userId2 = userId;
  // Dériver le nom du poste depuis pharmacie.postes (disponible après chargement)
  const posteNom = pharmacie?.postes?.find(p => p.id === userId)?.nom
                || pharmacie?.pharmacie_postes?.find(p => p.id === userId)?.nom
                || "";

  const canAdmin = userRole !== "vendeur";

  // Chargement initial + Realtime
  // ─── OCR automatique dès réception ──────────────────────────────────────────
  async function triggerOcrOnNew(ordos) {
    const sb = getSupabaseClient();
    for (const ordo of ordos) {
      if (ordo.extracted?._ocrSuccess) continue;
      const att = ordo.attachments?.[0];
      if (!att?.path && !att?.dataUrl) continue;
      try {
        let dataUrl = att.dataUrl;
        if (!dataUrl && att.path) {
          const signedUrl = await getSignedUrl(att.path, 300);
          if (!signedUrl) continue;
          const resp = await fetch(signedUrl);
          const blob = await resp.blob();
          dataUrl = await new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.readAsDataURL(blob);
          });
        }
        if (!dataUrl) continue;
        const base64 = dataUrl.split(",")[1];
        const mimeType = att.type === "pdf" ? "application/pdf" : "image/jpeg";
        const extracted = await extractFromFile(base64, mimeType, {
          fallbackName: ordo.fromName || null,
        });
        if (extracted?._ocrSuccess) {
          if (sb && !isDemoMode) {
            await sb.from("ordonnances").update({
              patient_nom:    extracted.nom        || null,
              ocr_confidence: extracted._confidence || 0,
            }).eq("id", ordo.id);
          }
          setOrdonnances(prev => prev.map(o =>
            o.id === ordo.id ? { ...o, extracted } : o
          ));
        }
      } catch(e) {
        console.warn("[OCR auto]", ordo.id, e.message);
      }
    }
  }

  // Préchauffer Tesseract dès le login (évite le délai au 1er scan)
  useEffect(() => { prewarmTesseract(); }, []);

  useEffect(() => {
    let unsub = () => {};
    async function load() {
      setDashLoading(true);
      const [ph, ordos] = await Promise.all([
        fetchPharmacie(pharmacieId),
        fetchOrdonnances(pharmacieId, 7),
      ]);
      if (ph) setPharmacie(ph);
      if (ordos) {
        setOrdonnances(ordos);
          // Charger les intérêts du jour
          fetchInteretsDuJour(pharmacieId).then(interets => setInteretsDuJour(interets));
        // OCR sur les ordonnances déjà en base sans extraction
        setTimeout(() => triggerOcrOnNew(ordos), 2000);
      }
      setDashLoading(false);
      // Réaltime / pub-sub
      unsub = subscribeToPharmacy(pharmacieId, async () => {
        const updated = await fetchPharmacie(pharmacieId);
        if (updated) setPharmacie(updated);
        const updatedOrdos = await fetchOrdonnances(pharmacieId, 7);
        if (updatedOrdos) {
          setOrdonnances(updatedOrdos);
          // Déclencher OCR automatique sur les nouvelles ordonnances sans extraction
          triggerOcrOnNew(updatedOrdos, pharmacieId);
        }
      });
    }
    load();
    // Polling intérêts toutes les 5s pour affichage temps réel
    const interetsInterval = setInterval(() => {
      fetchInteretsDuJour(pharmacieId).then(i => setInteretsDuJour(i));
    }, 5000);
    return () => { unsub(); clearInterval(interetsInterval); };
  }, [pharmacieId]);

  if (dashLoading) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",flexDirection:"column",gap:12,fontFamily:"'Inter',system-ui,sans-serif"}}>
      <div style={{fontSize:48}}>💊</div>
      <div style={{fontWeight:700,fontSize:16,color:"#1a3a6e"}}>Chargement OrdoMail…</div>
      {isDemoMode && <div style={{fontSize:12,color:"#94a3b8"}}>Mode démonstration</div>}
    </div>
  );
  if (!pharmacie) return <div style={{padding:40,textAlign:"center",color:"#dc2626"}}>Erreur : pharmacie introuvable</div>;
  const ordonnancesJour = (ordonnances||[]).filter(o => isSameDay(o.receivedAt, selectedDate));
  const normalize = (s) => (s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"");
  const filteredByDate = ordonnancesJour;
  const filteredBySearch = searchQuery
    ? filteredByDate.filter(o => {
        const nom = o.extracted?.nom || o.fromName || "";
        // Recherche par code patient (match exact ou partiel) — code = 3 chiffres +
        // 1 lettre depuis le 25/07/2026, comparaison insensible à la casse.
        if (searchQuery.match(/^[0-9A-Za-z]{1,4}$/) && o.code_patient) {
          return o.code_patient.toUpperCase().startsWith(searchQuery.toUpperCase());
        }
        const words = normalize(searchQuery).split(/\s+/).filter(Boolean);
        return words.every(w => normalize(nom).includes(w));
      })
    : filteredByDate;

  const filteredOrdos = filterStatus === "tous" ? filteredBySearch
    : filteredBySearch.filter(o => o.status === filterStatus);

  // ── Groupement par code_patient ──────────────────────────────────────────
  // Les ordonnances sans code ou avec code unique restent telles quelles
  // Les ordonnances avec le même code sont fusionnées en un groupe
  const groupedOrdos = (() => {
    const groups = {};
    const result = [];
    for (const o of filteredOrdos) {
      if (o.code_patient) {
        const key = `${o.code_patient}-${toDateKey(o.receivedAt || new Date())}`;
        if (groups[key]) {
          groups[key].ordonnances.push(o);
          if (o.status === "nouveau") groups[key].status = "nouveau";
        } else {
          // Attacher les intérêts à ce groupe
          const groupInterets = interetsDuJour.filter(i => i.code_patient === o.code_patient);
          const group = { ...o, _isGroup: true, ordonnances: [o], interets: groupInterets };
          groups[key] = group;
          result.push(group);
        }
      } else {
        result.push({ ...o, _isGroup: false, ordonnances: [o], interets: [] });
      }
    }
    return result;
  })();

  const nouveaux = ordonnances.filter(o => o.status === "nouveau").length;
  const couleur = pharmacie?.couleur || "#1a3a6e";
  // URL QR code : utilise VITE_APP_URL si défini, sinon l'origine courante
  // → En prod : VITE_APP_URL = https://ordomail.fr
  // → En test : VITE_APP_URL = https://ordomail-git-develop-xxx.vercel.app
  const baseUrl = import.meta.env.VITE_APP_URL || (typeof window !== "undefined" ? window.location.origin : "https://ordomail.fr");
  // qr_token (phase 1 sécurité) : jeton public par pharmacie exigé par submit-ordonnance
  // pour éviter qu'un pharmacie_id deviné/énuméré permette de spammer la file d'une pharmacie.
  const qrUrl = `${baseUrl}/?patient=${pharmacie?.id}${pharmacie?.qr_token ? `&t=${pharmacie.qr_token}` : ""}`;
  // Calendrier : jours avec ordonnances (recomputed)
  const joursAvecOrdos = new Set((ordonnances||[]).map(o => toDateKey(o.receivedAt)));

  // Générer tous les jours du mois affiché
  const getDaysInMonth = (year, month) => {
    const days = [];
    const firstDay = new Date(year, month, 1).getDay(); // 0=dim
    const daysInMonth = new Date(year, month+1, 0).getDate();
    // Décalage lundi en premier (0=lun, 6=dim)
    const offset = (firstDay + 6) % 7;
    for (let i = 0; i < offset; i++) days.push(null); // cases vides
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      days.push(toDateKey(date));
    }
    return days;
  };

  const calDays = getDaysInMonth(calMonth.year, calMonth.month);
  const today = toDateKey(new Date());

  // Navigation mois
  const prevMonth = () => setCalMonth(prev => {
    const d = new Date(prev.year, prev.month - 1, 1);
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const nextMonth = () => setCalMonth(prev => {
    const d = new Date(prev.year, prev.month + 1, 1);
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const monthLabel = new Date(calMonth.year, calMonth.month, 1)
    .toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  async function updateOrdo(id, patch) {
    // Mise à jour optimiste locale immédiate
    setOrdonnances(prev => prev.map(o => o.id === id ? {...o,...patch} : o));
    // Persistance async
    if (patch.status) {
      await updateOrdoStatus(id, pharmacieId, patch.status);
    }
    if (patch.extracted) {
      await updateOrdoExtracted(id, pharmacieId, patch.extracted);
    }
  }
  function handleViewOrdo(id) { addAuditLog({userId:userId2,userRole,pharmacieId,action:"view",ordonnanceId:id,posteNom}).catch(()=>{}); }
  function handlePrintOrdo(id) { addAuditLog({userId:userId2,userRole,pharmacieId,action:"print",ordonnanceId:id,posteNom}).catch(()=>{}); }
  async function handleFile(ordoId, file, dataUrl) {
    setLoadingId(ordoId);
    addAuditLog({userId:userId2,userRole,pharmacieId,action:"upload",ordonnanceId:ordoId,posteNom}).catch(()=>{});
    // Upload vers Storage (ou mémoire en mode démo)
    await uploadOrdoFile(pharmacieId, ordoId, file, dataUrl);
    // Mise à jour locale immédiate
    const ext = file.name.split(".").pop().toLowerCase();
    setOrdonnances(prev => prev.map(o => o.id === ordoId ? {
      ...o, attachments:[{name:file.name,type:ext==="pdf"?"pdf":"image",dataUrl,size:`${(file.size/1024).toFixed(0)} Ko`}]
    } : o));
    // OCR
    const ordo = ordonnances.find(o => o.id === ordoId);
    const fallbackName = ordo?.fromName || ordo?.extracted?.nom || null;
    const extracted = await extractFromFile(dataUrl.split(",")[1], file.type, { fallbackName });
    await updateOrdo(ordoId, {extracted});
    setLoadingId(null);
  }
  async function handleSaveParams(patch) {
    await savePharmacie(pharmacieId, patch);
    setPharmacie(p=>({...p,...patch}));
  }

  // Repéré par le linter (phase 2) : ParametresTab appelait un setPharmacie qui
  // n'existe que dans ce composant-ci (PharmacieDashboard), pas dans le sien —
  // ReferenceError garantie après un changement de plan. Passé en prop à la place.
  async function refreshPharmacie() {
    const ph = await fetchPharmacie(pharmacieId);
    if (ph) setPharmacie(ph);
    return ph;
  }

  return (
    <div style={{fontFamily:"'Inter',system-ui,sans-serif",minHeight:"100vh",background:"#f0f2f8",display:"flex",flexDirection:"column"}}>
      <header style={{background:couleur,color:"#fff",height:52,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 14px",boxShadow:"0 2px 12px rgba(0,0,0,0.2)"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,minWidth:0,flex:1}}>
          {pharmacie?.logo?<img src={pharmacie.logo} alt="logo" style={{width:30,height:30,objectFit:"cover",borderRadius:7,flexShrink:0}}/>:<span style={{fontSize:20,flexShrink:0}}>💊</span>}
          <div style={{minWidth:0}}>
            <div style={{fontWeight:800,fontSize:13,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{pharmacie?.nom}</div>
            <div style={{fontSize:9,opacity:0.6,letterSpacing:0.5}}>ORDOMAIL</div>
          </div>
        </div>
        <div style={{display:"flex",gap:2,flexShrink:0}} className="desktop-nav">
          <button onClick={()=>{setTab("ordonnances");setShowLogs(false);}} style={{padding:"5px 12px",border:"none",borderRadius:7,cursor:"pointer",background:tab==="ordonnances"&&!showLogs?"rgba(255,255,255,0.25)":"transparent",color:"#fff",fontWeight:tab==="ordonnances"&&!showLogs?700:400,fontSize:12,fontFamily:"inherit"}}>📋 Ordonnances</button>
          {canAdmin&&<><button onClick={()=>{setTab("qrcode");setShowLogs(false);}} style={{padding:"5px 12px",border:"none",borderRadius:7,cursor:"pointer",background:tab==="qrcode"&&!showLogs?"rgba(255,255,255,0.25)":"transparent",color:"#fff",fontWeight:tab==="qrcode"&&!showLogs?700:400,fontSize:12,fontFamily:"inherit"}}>📱 QR Code</button>
          <button onClick={()=>{setTab("parametres");setShowLogs(false);}} style={{padding:"5px 12px",border:"none",borderRadius:7,cursor:"pointer",background:tab==="parametres"&&!showLogs?"rgba(255,255,255,0.25)":"transparent",color:"#fff",fontWeight:tab==="parametres"&&!showLogs?700:400,fontSize:12,fontFamily:"inherit"}}>⚙️ Paramètres</button>
          <button onClick={()=>setShowLogs(l=>!l)} style={{padding:"5px 12px",border:"none",borderRadius:7,cursor:"pointer",background:showLogs?"rgba(255,255,255,0.25)":"transparent",color:"#fff",fontWeight:showLogs?700:400,fontSize:12,fontFamily:"inherit"}}>🗒️ Logs</button></>}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
          {nouveaux>0&&<div style={{background:"#e6a817",borderRadius:20,padding:"2px 10px",fontSize:11,fontWeight:800}}>{nouveaux} 🔔</div>}
          <button onClick={onLogout} style={{border:"1px solid rgba(255,255,255,0.35)",borderRadius:7,background:"transparent",color:"#fff",padding:"5px 10px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>⏏ Quitter</button>
          <span style={{fontSize:9,color:"rgba(255,255,255,0.3)",fontFamily:"monospace",marginLeft:6}}>{APP_VERSION}</span>
        </div>
      </header>
      <BottomNav tab={tab} showLogs={showLogs} canAdmin={canAdmin} setTab={setTab} setShowLogs={setShowLogs} />

      {showLogs&&canAdmin&&<LogsPanel
        pharmacieId={pharmacieId}
        onClose={()=>setShowLogs(false)}
        onOpenOrdo={(ordoId) => {
          setShowLogs(false);
          setTab("ordonnances");
          setFilterStatus("all");
          setTimeout(() => {
            const el = document.getElementById(`ordo-${ordoId}`);
            if (el) {
              el.scrollIntoView({ behavior:"smooth", block:"center" });
              el.style.outline = "3px solid #1e40af";
              setTimeout(() => el.style.outline = "", 2500);
            }
          }, 300);
        }}
      />}

      {tab==="ordonnances"&&!showLogs&&(
        <div style={{flex:1,overflow:"hidden",display:"flex",flexDirection:"column",paddingBottom:60}}>
          <div style={{background:"#fff",borderBottom:"1px solid #e8eaf0",padding:"10px 16px",display:"flex",flexDirection:"column",gap:8,flexShrink:0}}>
            <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
              {/* Bouton déclencheur calendrier */}
              <div style={{position:"relative"}}>
                <button onClick={()=>setShowCalendar(s=>!s)}
                  style={{display:"flex",alignItems:"center",gap:6,background:"#f0f2f8",
                    borderRadius:10,padding:"7px 12px",border:`1.5px solid ${showCalendar?couleur:"#e0e0e0"}`,
                    cursor:"pointer",fontFamily:"inherit",color:"#1a3a6e",fontWeight:700,fontSize:13}}>
                  <span>📅</span>
                  <span>{formatDateLabel(selectedDate)}</span>
                  <span style={{fontSize:10,color:"#94a3b8"}}>{showCalendar?"▲":"▼"}</span>
                </button>

              {/* Calendrier mensuel — affiché/caché */}
              {showCalendar && <div style={{position:"absolute",top:"calc(100% + 6px)",left:0,zIndex:100,
                background:"#fff",borderRadius:14,border:"1px solid #e2e8f0",padding:"12px 14px",minWidth:260,
                boxShadow:"0 8px 32px rgba(0,0,0,0.12)"}}>
                {/* Header mois */}
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                  <button onClick={prevMonth} style={{border:"none",background:"transparent",cursor:"pointer",fontSize:16,color:"#1a3a6e",padding:"0 6px"}}>‹</button>
                  <span style={{fontWeight:800,fontSize:13,color:"#1a3a6e",textTransform:"capitalize"}}>{monthLabel}</span>
                  <button onClick={nextMonth} style={{border:"none",background:"transparent",cursor:"pointer",fontSize:16,color:"#1a3a6e",padding:"0 6px"}}>›</button>
                </div>
                {/* Jours de la semaine */}
                <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:4}}>
                  {["L","M","M","J","V","S","D"].map((d,i)=>(
                    <div key={i} style={{textAlign:"center",fontSize:10,fontWeight:700,color:"#94a3b8"}}>{d}</div>
                  ))}
                </div>
                {/* Cases du calendrier */}
                <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2}}>
                  {calDays.map((day, i) => {
                    if (!day) return <div key={i}/>;
                    const isToday   = day === today;
                    const isSelected = day === selectedDate;
                    const hasOrdos  = joursAvecOrdos.has(day);
                    const isFuture  = day > today;
                    return (
                      <button key={day} onClick={()=>{if(!isFuture){setSelectedDate(day);setSearchQuery("");setShowCalendar(false);}}}
                        title={hasOrdos ? formatDateLabel(day) : ""}
                        style={{
                          width:"100%",aspectRatio:"1",border:"none",borderRadius:6,cursor:isFuture?"default":"pointer",
                          fontFamily:"inherit",fontSize:12,fontWeight:isSelected||isToday?800:hasOrdos?600:400,
                          background: isSelected ? couleur : isToday ? "#dbeafe" : "transparent",
                          color: isSelected ? "#fff" : isToday ? "#1a3a6e" : isFuture ? "#d1d5db" : hasOrdos ? "#1a3a6e" : "#64748b",
                          position:"relative",
                        }}>
                        {day.split("-")[2].replace(/^0/,"")}
                        {/* Point indicateur si ordonnances */}
                        {hasOrdos && !isSelected && (
                          <span style={{position:"absolute",bottom:2,left:"50%",transform:"translateX(-50%)",
                            width:4,height:4,borderRadius:"50%",background:isToday?"#1a3a6e":couleur,display:"block"}}/>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>}
              </div>
              <div style={{flex:1,position:"relative",minWidth:120}}>
                <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",fontSize:14,pointerEvents:"none"}}>🔍</span>
                <input ref={searchRef} value={searchQuery} onChange={e=>setSearchQuery(e.target.value)}
                  placeholder="Nom ou code (ex: 247)…"
                  style={{width:"100%",padding:"8px 10px 8px 32px",border:`1.5px solid ${searchQuery?couleur:"#e0e0e0"}`,borderRadius:10,fontSize:13,fontFamily:"inherit",outline:"none",background:"#fff",boxSizing:"border-box"}}/>
              </div>
              <div style={{display:"flex",gap:4}}>
                <button onClick={()=>setViewMode("grid")} style={{width:32,height:32,border:`1.5px solid ${viewMode==="grid"?couleur:"#e0e0e0"}`,borderRadius:8,background:viewMode==="grid"?couleur:"#fff",color:viewMode==="grid"?"#fff":"#888",cursor:"pointer",fontSize:14}}>⊞</button>
                <button onClick={()=>setViewMode("list")} style={{width:32,height:32,border:`1.5px solid ${viewMode==="list"?couleur:"#e0e0e0"}`,borderRadius:8,background:viewMode==="list"?couleur:"#fff",color:viewMode==="list"?"#fff":"#888",cursor:"pointer",fontSize:14}}>☰</button>
              </div>
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
              {[["nouveau","🔔 À traiter",ordonnancesJour.filter(o=>o.status==="nouveau").length],["imprime","✓ Imprimées",ordonnancesJour.filter(o=>o.status==="imprime").length],["tous","Toutes",ordonnancesJour.length]].map(([k,l,count])=>(
                <button key={k} onClick={()=>setFilterStatus(k)}
                  style={{padding:"5px 12px",borderRadius:16,border:`1.5px solid ${filterStatus===k?couleur:"#e0e0e0"}`,background:filterStatus===k?couleur:"#fff",color:filterStatus===k?"#fff":"#555",fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:5}}>
                  {l}<span style={{background:filterStatus===k?"rgba(255,255,255,0.25)":"#f0f0f0",borderRadius:10,padding:"0 6px",fontSize:11}}>{count}</span>
                </button>
              ))}
              <span style={{fontSize:12,color:"#bbb",marginLeft:4}}>{filteredOrdos.length} ordonnance{filteredOrdos.length!==1?"s":""}</span>
            </div>
          </div>
          <div style={{flex:1,overflow:"auto",padding:"12px 12px 80px"}}>
            {filteredOrdos.length===0?(
              <div style={{textAlign:"center",padding:"40px 20px",color:"#bbb"}}>
                <div style={{fontSize:36,marginBottom:10}}>{joursAvecOrdos.has(selectedDate) ? "🔍" : "📅"}</div>
                <div style={{fontSize:15,fontWeight:600,color:"#64748b"}}>
                  {joursAvecOrdos.has(selectedDate)
                    ? "Aucune ordonnance trouvée"
                    : "Aucune ordonnance ce jour"}
                </div>
                {!joursAvecOrdos.has(selectedDate) && (
                  <div style={{fontSize:13,color:"#94a3b8",marginTop:6}}>
                    Les jours avec des ordonnances sont marqués d'un point dans le calendrier
                  </div>
                )}
              </div>
            ):viewMode==="grid"?(
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(min(100%,300px),1fr))",gap:12}}>
                {groupedOrdos.map(o=>{
                  const accent=getOrdoAccent(o.id);
                  if (o._isGroup && o.ordonnances.length > 1) {
                    return <OrdoGroup key={o.code_patient+'-'+toDateKey(o.receivedAt)} id={`ordo-${o.ordonnances?.[0]?.id||o.id}`}
                      group={o} couleur={couleur}
                      interets={o.interets || []}
                      sonnetteActive={pharmacie?.sonnette_active !== false}
                      onSonnette={() => appellerPatient(pharmacieId, o.code_patient)}
                      onPrint={(ordo)=>{handlePrintOrdo(ordo.id);setPrintModal(ordo);}}
                      onView={async (ordo)=>{
                        handleViewOrdo(ordo.id);
                        const a = ordo.attachments?.[0];
                        if (!a) return;
                        if (a.dataUrl) { setViewerAtt(a); return; }
                        if (a.path) { const url = await getSignedUrl(a.path,300); if (url) setViewerAtt({...a,dataUrl:url}); }
                      }}
                      onReopen={(ordo)=>{updateOrdo(ordo.id,{status:"nouveau"});addAuditLog({userId:userId2,userRole,pharmacieId,action:"reopen",ordonnanceId:ordo.id,posteNom});}}
                      onUpload={(file,dataUrl)=>handleFile(o.id,file,dataUrl)}
                      loadingId={loadingId}/>;
                  }
                  return <OrdoCard key={o.id} id={`ordo-${o.id}`} ordo={o} couleur={couleur} accent={accent}
                    interets={o.interets || []}
                    sonnetteActive={pharmacie?.sonnette_active !== false}
                    onSonnette={()=>appellerPatient(pharmacieId, o.code_patient || "???")}
                    onPrint={()=>{handlePrintOrdo(o.id);setPrintModal(o);}}
                    onView={()=>{handleViewOrdo(o.id);(async () => {
              const a = o.attachments?.[0];
              if (!a) return;
              if (a.dataUrl) { setViewerAtt(a); return; }
              if (a.path) {
                const url = await getSignedUrl(a.path, 300);
                if (url) setViewerAtt({ ...a, dataUrl: url });
              }
            })();}}
                    onUpload={(file,dataUrl)=>handleFile(o.id,file,dataUrl)}
                    onReopen={()=>{updateOrdo(o.id,{status:"nouveau"});addAuditLog({userId:userId2,userRole,pharmacieId,action:"reopen",ordonnanceId:o.id,posteNom});}}
                    loadingId={loadingId}/>;
                })}
              </div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {groupedOrdos.map(o=>{
                  const accent=getOrdoAccent(o.id);
                  if (o._isGroup && o.ordonnances.length > 1) {
                    return (
                      <div key={o.code_patient+'-list-'+toDateKey(o.receivedAt)} style={{
                        background:"#fff",borderRadius:12,marginBottom:6,padding:"12px 18px",
                        border:`2px solid ${o.ordonnances.every(ord=>ord.status==="imprime")?"#bbf7d0":accent.border}`,
                        boxShadow:"0 1px 4px rgba(0,0,0,0.04)",
                      }}>
                        {/* En-tête groupe */}
                        {(()=>{
                          const allImprime = o.ordonnances.every(ord=>ord.status==="imprime");
                          return (
                        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:8}}>
                          <div style={{
                            fontSize:22,fontWeight:900,padding:"4px 14px",borderRadius:10,
                            background: allImprime ? "#475569" : "#1a3a6e",
                            color:"#fff",fontFamily:"monospace",letterSpacing:4,flexShrink:0,
                          }}>{o.code_patient}</div>
                          <div style={{flex:1}}>
                            <div style={{fontWeight:800,fontSize:15,color: allImprime?"#64748b":"#1a1a1a"}}>
                              {o.extracted?.nom||o.fromName||"Patient"}
                            </div>
                            <div style={{fontSize:11,color:"#64748b"}}>
                              {o.ordonnances.length} ordonnances · {timeAgo(o.receivedAt)}
                              {allImprime && <span style={{marginLeft:6,color:"#15803d",fontWeight:700}}>✓ Tout imprimé</span>}
                            </div>
                          </div>
                          {pharmacie?.sonnette_active !== false && (
                            <button onClick={()=>appellerPatient(pharmacieId, o.code_patient)}
                              title="Appeler le patient"
                              style={{padding:"8px 12px",border:"1.5px solid rgba(26,58,110,0.3)",
                                borderRadius:9,background:"#f0f4ff",cursor:"pointer",fontSize:16,flexShrink:0}}>
                              🔔
                            </button>
                          )}
                        </div>
                          );
                        })()}
                        {/* Intérêts offres du patient */}
                        {(o.interets||[]).length > 0 && (
                          <div style={{marginBottom:8}}>
                            {(o.interets||[]).map(int=>(
                              <div key={int.id} style={{
                                display:"flex",alignItems:"center",gap:8,
                                padding:"5px 10px",marginBottom:4,
                                background:"#fff8e1",borderRadius:8,
                                border:"1.5px solid #fde68a",
                              }}>
                                <span style={{fontSize:16}}>{int.offre_emoji||"🎁"}</span>
                                <span style={{fontSize:12,fontWeight:700,color:"#92400e"}}>
                                  Intéressé(e) : {int.offre_titre}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Lignes individuelles */}
                        {o.ordonnances.map((ord,idx)=>{
                          const ordImprime = ord.status === "imprime";
                          return (
                          <div key={ord.id} style={{display:"flex",alignItems:"center",gap:8,
                            padding:"6px 10px",borderRadius:8,marginBottom:4,
                            background: ordImprime?"#f0fdf4":"#f8fafc",
                            border:`1px solid ${ordImprime?"#bbf7d0":"#e2e8f0"}`}}>
                            <span style={{fontSize:12,fontWeight:600,flex:1,
                              color: ordImprime?"#15803d":"#475569"}}>
                              {ordImprime ? "✓" : "📎"} Ordonnance {idx+1}
                              {ord.attachments?.[0]?.name && (
                                <span style={{color:"#94a3b8",fontWeight:400}}> — {ord.attachments[0].name}</span>
                              )}
                            </span>
                            {(ord.attachments?.[0]?.dataUrl || ord.attachments?.[0]?.path) && (
                              <button onClick={async ()=>{
                                  handleViewOrdo(ord.id);
                                  const a = ord.attachments[0];
                                  if (a.dataUrl) { setViewerAtt(a); return; }
                                  const url = await getSignedUrl(a.path, 300);
                                  if (url) setViewerAtt({ ...a, dataUrl: url });
                                }}
                                style={{padding:"4px 8px",border:"1px solid #c7d2fe",borderRadius:6,
                                  background:"#f0f4ff",color:"#4338ca",fontSize:11,
                                  cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>
                                👁
                              </button>
                            )}
                            {!ordImprime ? (
                              <button onClick={()=>{handlePrintOrdo(ord.id);setPrintModal(ord);}}
                                style={{padding:"4px 10px",border:"none",borderRadius:6,
                                  background:accent.bandeau,color:"#fff",fontSize:11,
                                  cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>
                                🖨️ Imprimer
                              </button>
                            ) : (
                              <button onClick={()=>{updateOrdo(ord.id,{status:"nouveau"});addAuditLog({userId:userId2,userRole,pharmacieId,action:"reopen",ordonnanceId:ord.id,posteNom});}}
                                title="Remettre à traiter"
                                style={{padding:"4px 8px",border:"1px solid #e6a817",borderRadius:6,
                                  background:"#fffbf0",color:"#92400e",fontSize:11,fontWeight:700,
                                  cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>
                                ✓ ↩ Remettre à traiter
                              </button>
                            )}
                          </div>
                          );
                        })}
                      </div>
                    );
                  }
                  return <OrdoRow key={o.id} id={`ordo-${o.id}`} ordo={o} couleur={couleur} accent={accent}
                    interets={o.interets || []}
                    sonnetteActive={pharmacie?.sonnette_active !== false}
                    onSonnette={()=>appellerPatient(pharmacieId, o.code_patient)}
                    onPrint={()=>{handlePrintOrdo(o.id);setPrintModal(o);}}
                    onView={()=>{handleViewOrdo(o.id);(async () => {
              const a = o.attachments?.[0];
              if (!a) return;
              if (a.dataUrl) { setViewerAtt(a); return; }
              if (a.path) {
                const url = await getSignedUrl(a.path, 300);
                if (url) setViewerAtt({ ...a, dataUrl: url });
              }
            })();}}
                    onReopen={()=>{updateOrdo(o.id,{status:"nouveau"});addAuditLog({userId:userId2,userRole,pharmacieId,action:"reopen",ordonnanceId:o.id,posteNom});}}/>;
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {tab==="qrcode"&&canAdmin&&!showLogs&&<QRNFCTab pharmacie={pharmacie} couleur={couleur} qrUrl={qrUrl} onPatientPage={onPatientPage}/>}
      {tab==="parametres"&&canAdmin&&!showLogs&&<ParametresTab pharmacie={pharmacie} onSave={handleSaveParams} onPlanChanged={refreshPharmacie}/>}

      {viewerAtt&&<ViewerModal att={viewerAtt} onClose={()=>setViewerAtt(null)}/>}
      {printModal&&<PrintConfirmModal ordo={printModal}
        onConfirm={()=>{updateOrdo(printModal.id,{status:"imprime"});setPrintModal(null);}}
        onCancel={()=>setPrintModal(null)}/>}

      <div id="ordomail-print-area" style={{display:"none"}}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}@keyframes popIn{0%{opacity:0;transform:scale(0.92)}100%{opacity:1;transform:scale(1)}}*{box-sizing:border-box}::-webkit-scrollbar{width:6px}::-webkit-scrollbar-thumb{background:#ddd;border-radius:3px}@media print{body>*{display:none!important}#ordomail-print-area{display:block!important;position:fixed;top:0;left:0;width:100%;background:#fff}}@media(max-width:640px){.hide-mobile{display:none!important}.desktop-nav{display:none!important}.bottom-nav{display:flex!important}}@media(min-width:641px){.desktop-nav{display:flex!important}.bottom-nav{display:none!important}.mobile-padded{padding-bottom:0!important}}`}</style>
    </div>
  );
}

export { QRNFCTab, BottomNav, PharmacieDashboard, OffresSection, AbonnementSection, CompteSection, ParametresTab };
export default PharmacieDashboard;