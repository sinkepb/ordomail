import { useState, useEffect } from "react";
import { PLAN_LIMITS } from "../../lib/plans.js";
import { UpgradeModal } from "../../components/UpgradeModal.jsx";
import { CompteSection } from "../../components/CompteSection.jsx";
import { StoriesSection } from "../../components/StoriesSection.jsx";
import { Btn } from "../../components/ui.jsx";
import { LogsPanel } from "../../components/LogsPanel.jsx";
import { ErrorBoundary } from "../../components/ErrorBoundary.jsx";
import { generatePosterHTML, generatePosterLandscapeHTML, downloadPosterPDF, sanitizePdfFilenamePart } from "../../lib/print.jsx";
import { savePostes, updateTitulaire, changePlan, isDemoMode, getSupabaseClient } from "../../supabase.js";

export function ParametresTab({ pharmacie, onSave, onPlanChanged, pharmacieId, onOpenOrdo }) {
  const [section, setSection] = useState("postes");
  const [showUpgrade, setShowUpgrade] = useState(null);
  const [nom, setNom] = useState(pharmacie.nom||"");
  const [adresse, setAdresse] = useState(pharmacie.adresse||"");
  const [siret, setSiret] = useState(pharmacie.siret||"");
  const [couleur, setCouleur] = useState(pharmacie.couleur||"#1a3a6e");
  const [accentUnique, setAccentUnique] = useState(pharmacie.accent_unique||"");
  const [titulaireNom, setTitulaireNom] = useState(pharmacie.titulaireNom||"");
  const [postes, setPostes] = useState(pharmacie.postes||[]);
  const [saved, setSaved] = useState(false);
  // PIN unique (06/09/2026) — voir la migration 20260906_pin_unique.sql pour
  // le pourquoi (le pharmacien contrôle déjà l'accès via son propre logiciel,
  // pas besoin d'un PIN distinct par poste). pinUnique* : état purement local
  // au formulaire, jamais préchargé avec le vrai PIN (jamais renvoyé en clair
  // par le serveur — même logique que le PIN par poste ci-dessous).
  const [pinMode, setPinMode] = useState(pharmacie.pin_mode || "multi");
  const [pinUnique, setPinUnique] = useState("");
  const [pinUniqueSaved, setPinUniqueSaved] = useState(false);
  const [pinUniqueError, setPinUniqueError] = useState("");
  const planInfo = PLAN_LIMITS[pharmacie.plan] || PLAN_LIMITS.starter;

  // Onglet QR code en libre-service (14/09/2026) — uniquement les affiches
  // A4/A3 (portrait + paysage) : la génération de lots de stickers physiques
  // et l'association manuelle restent réservées au backoffice OrdoMail
  // (QrCodesAdmin.jsx), ce panneau ne fait que réimprimer l'affiche du QR
  // déjà actif pour CETTE pharmacie (pharmacie.qr_token, voir register-pharmacie
  // et la migration de backfill du 14/09/2026).
  const [posterFormat, setPosterFormat] = useState("A4");
  const [posterOrientation, setPosterOrientation] = useState("portrait");
  const [posterHtml, setPosterHtml] = useState(null);
  const [posterHtmlA3, setPosterHtmlA3] = useState(null);
  const [posterHtmlPaysage, setPosterHtmlPaysage] = useState(null);
  const [posterHtmlPaysageA3, setPosterHtmlPaysageA3] = useState(null);
  const [posterLoading, setPosterLoading] = useState(false);
  const [posterDownloading, setPosterDownloading] = useState(false);
  const [posterErr, setPosterErr] = useState("");

  useEffect(() => {
    if (section !== "qrcode" || !pharmacie.qr_token || posterHtml) return;
    setPosterLoading(true); setPosterErr("");
    const params = { url: `${window.location.origin}/?patient=${pharmacie.id}&t=${pharmacie.qr_token}`, pharmacieName: pharmacie.nom };
    Promise.all([
      generatePosterHTML({ ...params, format: "A4" }).then(setPosterHtml),
      generatePosterHTML({ ...params, format: "A3" }).then(setPosterHtmlA3),
      generatePosterLandscapeHTML({ ...params, format: "A4" }).then(setPosterHtmlPaysage),
      generatePosterLandscapeHTML({ ...params, format: "A3" }).then(setPosterHtmlPaysageA3),
    ]).catch(e => setPosterErr("Aperçu indisponible : " + e.message)).finally(() => setPosterLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);

  async function handleDownloadPoster() {
    const map = { A4: { portrait: posterHtml, paysage: posterHtmlPaysage }, A3: { portrait: posterHtmlA3, paysage: posterHtmlPaysageA3 } };
    const html = map[posterFormat][posterOrientation];
    if (!html) return;
    setPosterErr("");
    setPosterDownloading(true);
    const isA3 = posterFormat === "A3";
    const isPortrait = posterOrientation === "portrait";
    const [widthMm, heightMm] = isA3
      ? (isPortrait ? [297, 420] : [420, 297])
      : (isPortrait ? [210, 297] : [297, 210]);
    try {
      await downloadPosterPDF(html, {
        filename: `affiche-qr-${sanitizePdfFilenamePart(pharmacie.nom)}-${posterFormat}-${posterOrientation}.pdf`,
        widthMm, heightMm,
      });
    } catch (e) {
      setPosterErr("Échec de l'export PDF : " + e.message);
    }
    setPosterDownloading(false);
  }

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
      // Colonnes explicites, pas select() nu (01/10/2026) — le titulaire n'a
      // plus GRANT SELECT sur pin_hash/pin (voir
      // 20261001_postes_pin_hash_restriction.sql), et le RETURNING par défaut
      // de PostgREST demande l'équivalent de `*` : la requête entière échoue
      // en 403 si une seule colonne demandée n'est pas accordée.
      const { data, error } = await sb.from("pharmacie_postes")
        .insert({ pharmacie_id: pharmacie.id, nom, actif: true })
        .select("id, pharmacie_id, nom, actif, created_at").single();
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
    const tasks = [
      onSave({nom,adresse,siret:siret||null,couleur,accent_unique:accentUnique||null,pin_mode:pinMode}),
      savePostes(pharmacie.id, postes.map(p=>({...p,pin:undefined})), pinChanges),
    ];
    if (titulaireNom.trim() && titulaireNom.trim() !== (pharmacie.titulaireNom||"")) {
      tasks.push(updateTitulaire(titulaireNom.trim()));
    }
    await Promise.all(tasks);
    setSaved(true); setTimeout(()=>setSaved(false),2500);
  }

  const tabs = [["postes","🖥️","Postes"],
    ["qrcode","🏷️","QR code"],
    ...(planInfo.offresStories ? [["stories","📊","Stories"]] : []),
    ["compte","👤","Compte"],["journal","🗒️","Journal d'activité"]];

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

        {section==="postes"&&(
          <ErrorBoundary compact label="Postes">
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
            {/* PIN unique (06/09/2026) — bascule optionnelle, "multi" reste le
                défaut historique. En "unique", plus de postes nommés : la
                limite du plan s'applique au nombre de connexions simultanées
                (voir vendeur_sessions, verify-pin), toujours réellement
                bloquante, pas juste indicative.
                @fix 11/09/2026 — le choix du mode ne persistait qu'au clic sur
                le bouton "Sauvegarder" tout en haut du panneau, un bouton
                distinct et sans lien visuel avec le bloc PIN unique juste
                en dessous. Un titulaire qui configurait son code PIN unique
                et cliquait "Enregistrer" (confirmation affichée) repartait
                persuadé que tout était fait, alors que pin_mode lui-même
                n'avait jamais été envoyé au serveur — au rechargement suivant,
                l'interface retombait sur "multi". Chaque bouton persiste
                désormais pin_mode immédiatement, indépendamment du bouton
                Sauvegarder global. */}
            <div style={{display:"flex",gap:8,marginBottom:16}}>
              <button type="button" onClick={()=>{ setPinMode("multi"); onSave({pin_mode:"multi"}); }}
                style={{flex:1,padding:"10px 12px",borderRadius:10,cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:700,textAlign:"left",
                  border:`1.5px solid ${pinMode==="multi"?"#1a3a6e":"#e0e7ff"}`,background:pinMode==="multi"?"#f0f4ff":"#fff",color:pinMode==="multi"?"#1a3a6e":"#64748b"}}>
                🖥️ Un PIN par poste
                <div style={{fontWeight:400,fontSize:11,color:"#94a3b8",marginTop:2}}>Chaque poste a son propre code</div>
              </button>
              <button type="button" onClick={()=>{ setPinMode("unique"); onSave({pin_mode:"unique"}); }}
                style={{flex:1,padding:"10px 12px",borderRadius:10,cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:700,textAlign:"left",
                  border:`1.5px solid ${pinMode==="unique"?"#1a3a6e":"#e0e7ff"}`,background:pinMode==="unique"?"#f0f4ff":"#fff",color:pinMode==="unique"?"#1a3a6e":"#64748b"}}>
                🔐 PIN unique
                <div style={{fontWeight:400,fontSize:11,color:"#94a3b8",marginTop:2}}>Un seul code pour tous les postes</div>
              </button>
            </div>

            {pinMode==="unique"&&(
              <div style={{background:"#f8faff",borderRadius:10,padding:"14px",marginBottom:16,border:"1px solid #e0e7ff"}}>
                <div style={{fontSize:11,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:0.5,marginBottom:8}}>PIN unique de la pharmacie</div>
                <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                  <input type="password" maxLength={4} value={pinUnique} placeholder="••••"
                    onChange={e=>{ setPinUnique(e.target.value.replace(/[^0-9]/g,"").slice(0,4)); setPinUniqueSaved(false); setPinUniqueError(""); }}
                    style={{width:80,border:`1.5px solid ${pinUniqueSaved?"#15803d":"#c7d2fe"}`,borderRadius:6,padding:"4px 10px",fontSize:16,fontFamily:"monospace",textAlign:"center",outline:"none"}}/>
                  <button type="button" disabled={pinUnique.length!==4}
                    onClick={async ()=>{
                      try {
                        if (isDemoMode) {
                          const db = window._ordomailDB || window.__ordomailDB;
                          const ph = db?.pharmacies?.find(p=>p.id===pharmacie.id);
                          if (ph) ph.pin_unique = pinUnique;
                        } else {
                          const sb = getSupabaseClient();
                          const { data: { session } } = await sb.auth.getSession();
                          const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
                          const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
                          const res = await fetch(`${supabaseUrl}/functions/v1/update-pin`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json", "apikey": supabaseKey, "Authorization": `Bearer ${session?.access_token||""}` },
                            body: JSON.stringify({ pharmacieId: pharmacie.id, pin: pinUnique }),
                          });
                          const body = await res.json().catch(()=>({}));
                          if (!res.ok) throw new Error(body?.error || "Échec de l'enregistrement");
                        }
                        setPinUniqueSaved(true);
                      } catch(err) { setPinUniqueError(err.message); }
                    }}
                    style={{padding:"6px 14px",border:"none",borderRadius:6,background:pinUnique.length===4?"#1a3a6e":"#cbd5e1",color:"#fff",fontWeight:700,fontSize:12,cursor:pinUnique.length===4?"pointer":"default",fontFamily:"inherit"}}>
                    {pinUniqueSaved?"✅ Enregistré":"Enregistrer"}
                  </button>
                  <span style={{fontSize:11,color:pharmacie.pin_unique_hash?"#15803d":"#f59e0b",fontWeight:600}}>
                    {pinUniqueSaved ? "" : pharmacie.pin_unique_hash ? "✅ Déjà configuré — entrez un nouveau code pour le changer" : "⚠️ PIN non configuré"}
                  </span>
                </div>
                {pinUniqueError && <div style={{fontSize:12,color:"#dc2626",marginTop:6}}>{pinUniqueError}</div>}
                <div style={{fontSize:11,color:"#94a3b8",marginTop:8}}>
                  Valable sur n'importe quel poste, jusqu'à {planInfo.maxPostes===999?"un nombre illimité de":planInfo.maxPostes} connexion{planInfo.maxPostes>1?"s":""} simultanée{planInfo.maxPostes>1?"s":""} selon votre abonnement.
                </div>
              </div>
            )}

            {pinMode==="multi"&&<>
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
                    style={{width:80,border:`1.5px solid ${poste._pinSaved||poste.pin_hash?"#15803d":poste.pin&&poste.pin.length===4?"#f59e0b":"#c7d2fe"}`,borderRadius:6,padding:"4px 10px",fontSize:16,fontFamily:"monospace",textAlign:"center",outline:"none",transition:"border 0.2s"}}/>
                  {/* @fix 27/08/2026 — ce badge ne regardait que l'état éphémère de la session
                      (poste.pin, jamais rempli depuis la base puisque le PIN en clair n'est
                      jamais renvoyé ; poste._pinSaved, remis à zéro à chaque rechargement) et
                      jamais poste.pin_hash, la vraie source de vérité en base : après un simple
                      rechargement de page, un PIN pourtant bien enregistré (et fonctionnel côté
                      vendeur) s'affichait comme "manquant". */}
                  <span style={{fontSize:11,fontWeight:600,color:poste._pinSaved||poste.pin_hash?"#15803d":poste.pin&&poste.pin.length===4?"#f59e0b":"#94a3b8"}}>
                    {poste._pinSaved ? "✅ Enregistré" : poste.pin && poste.pin.length===4 ? "En attente..." : poste.pin_hash ? "✅ Configuré" : "⚠️ PIN manquant"}
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
            </>}
            <div style={{marginTop:16,background:"#f0f7ff",borderRadius:12,padding:"14px 16px",border:"1px solid #dbeafe"}}>
              <div style={{fontWeight:700,fontSize:13,color:"#1a3a6e",marginBottom:8}}>Qui accède à quoi ?</div>
              <div style={{display:"flex",flexDirection:"column",gap:5}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"6px 10px",background:"#fff",borderRadius:8}}>
                  <span style={{fontWeight:700,color:"#1a3a6e"}}>👑 Titulaire (PSC)</span>
                  <span style={{color:"#15803d",fontWeight:600}}>Accès complet</span>
                </div>
                {pinMode==="unique" ? (
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"6px 10px",background:"#fff",borderRadius:8}}>
                    <span style={{fontWeight:600,color:"#475569"}}>🔐 PIN unique · jusqu'à {planInfo.maxPostes===999?"illimité":planInfo.maxPostes} connexion{planInfo.maxPostes>1?"s":""}</span>
                    <span style={{color:"#0369a1",fontWeight:600}}>Ordonnances + Impression</span>
                  </div>
                ) : postes.filter(p=>p.actif).map(p=>(
                  <div key={p.id} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"6px 10px",background:"#fff",borderRadius:8}}>
                    <span style={{fontWeight:600,color:"#475569"}}>🖥️ {p.nom} · PIN {p.pin?"•".repeat(p.pin.length):p.pin_hash?"••••":"—"}</span>
                    <span style={{color:"#0369a1",fontWeight:600}}>Ordonnances + Impression</span>
                  </div>
                ))}
              </div>
              <div style={{marginTop:8,fontSize:11,color:"#64748b",lineHeight:1.6}}>ℹ️ C'est le titulaire qui crée et modifie les codes PIN depuis cette page.</div>
            </div>
          </div>
          </ErrorBoundary>
        )}

        {section==="qrcode"&&(
          <ErrorBoundary compact label="QR code">
          <div style={{background:"#fff",borderRadius:14,padding:22,boxShadow:"0 2px 10px rgba(0,0,0,0.07)",maxWidth:420}}>
            <div style={{fontWeight:800,fontSize:15,marginBottom:4}}>🏷️ Affiche QR code</div>
            <div style={{fontSize:12,color:"#64748b",marginBottom:16}}>À imprimer et afficher en pharmacie pour que vos patients vous envoient leur ordonnance en la scannant.</div>
            {!pharmacie.qr_token ? (
              <div style={{fontSize:13,color:"#b91c1c",background:"#fef2f2",border:"1px solid #fecaca",borderRadius:10,padding:"12px 14px"}}>
                Votre code QR n'est pas encore configuré pour cette pharmacie — contactez le support via le bouton ❓ Aide.
              </div>
            ) : (
              <>
                <div style={{display:"flex",gap:6,marginBottom:10}}>
                  {["A4","A3"].map(f=>(
                    <button key={f} onClick={()=>setPosterFormat(f)}
                      style={{flex:1,padding:"7px 12px",border:`1.5px solid ${posterFormat===f?"#1a3a6e":"#e0e7ff"}`,borderRadius:8,background:posterFormat===f?"#1a3a6e":"#fff",color:posterFormat===f?"#fff":"#64748b",fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>
                      Format {f}
                    </button>
                  ))}
                </div>
                <div style={{display:"flex",gap:6,marginBottom:14}}>
                  {[["portrait","📄 Portrait"],["paysage","🖼️ Paysage"]].map(([k,l])=>(
                    <button key={k} onClick={()=>setPosterOrientation(k)}
                      style={{flex:1,padding:"7px 12px",border:`1.5px solid ${posterOrientation===k?"#1a3a6e":"#e0e7ff"}`,borderRadius:8,background:posterOrientation===k?"#f0f4ff":"#fff",color:posterOrientation===k?"#1a3a6e":"#64748b",fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>
                      {l}
                    </button>
                  ))}
                </div>
                {(() => {
                  const isA3 = posterFormat === "A3";
                  const isPortrait = posterOrientation === "portrait";
                  const html = isA3 ? (isPortrait ? posterHtmlA3 : posterHtmlPaysageA3) : (isPortrait ? posterHtml : posterHtmlPaysage);
                  const dims = isPortrait ? (isA3 ? {w:1122,h:1588} : {w:793,h:1123}) : (isA3 ? {w:1587,h:1122} : {w:1122,h:793});
                  const scale = (isPortrait ? 222 : 314) / dims.w;
                  return (
                    <div style={{width:314,height:222,margin:"0 auto 14px",borderRadius:10,overflow:"hidden",background:"#f8faff",border:"1px solid #e0e7ff",display:"flex",alignItems:"center",justifyContent:"center"}}>
                      {posterLoading && <div style={{color:"#94a3b8",fontSize:12}}>Aperçu…</div>}
                      {!posterLoading && html && (
                        <iframe title={`Aperçu affiche ${posterFormat} ${posterOrientation}`} srcDoc={html}
                          style={{width:dims.w,height:dims.h,border:"none",flexShrink:0,transform:`scale(${scale})`,transformOrigin:"top left"}}/>
                      )}
                    </div>
                  );
                })()}
                <button onClick={handleDownloadPoster} disabled={posterLoading||posterDownloading}
                  style={{width:"100%",padding:"11px 16px",border:"none",borderRadius:10,background:"#1a3a6e",color:"#fff",fontWeight:800,fontSize:13,cursor:(posterLoading||posterDownloading)?"default":"pointer",fontFamily:"inherit",opacity:(posterLoading||posterDownloading)?0.6:1}}>
                  {posterLoading ? "Préparation…" : posterDownloading ? "Génération du PDF…" : `⬇️ Télécharger le PDF (${posterFormat} ${posterOrientation==="portrait"?"portrait":"paysage"})`}
                </button>
                {posterErr && <div style={{marginTop:10,background:"#fef2f2",border:"1px solid #fecaca",borderRadius:8,padding:"8px 12px",color:"#b91c1c",fontSize:12}}>{posterErr}</div>}
              </>
            )}
          </div>
          </ErrorBoundary>
        )}

        {section==="stories"&&planInfo.offresStories&&(
          <ErrorBoundary compact label="Stories">
          <StoriesSection pharmacie={pharmacie}/>
          </ErrorBoundary>
        )}
        {section==="compte"&&(
          <ErrorBoundary compact label="Compte">
          <CompteSection pharmacie={pharmacie} postes={postes} planInfo={planInfo}
            nom={nom} onNomChange={setNom} adresse={adresse} onAdresseChange={setAdresse}
            siret={siret} onSiretChange={setSiret}
            couleur={couleur} onCouleurChange={setCouleur}
            accentUnique={accentUnique} onAccentUniqueChange={setAccentUnique}
            titulaireNom={titulaireNom} onTitulaireNomChange={setTitulaireNom}
            onUpgrade={async (newPlan, billing)=>{
            // Ne PAS avaler l'erreur ici : PlanSwitcher (UpgradeModal.jsx) attend que
            // cette promesse rejette pour afficher son écran "Échec du changement de
            // plan" — avant ce correctif, l'erreur était juste loggée en console et
            // PlanSwitcher passait à "done" comme si tout s'était bien passé, alors
            // que changePlan() pouvait avoir échoué (voir aussi billing.js:
            // changePlan() ne retombe plus sur une mise à jour DB seule sans Stripe).
            const result = await changePlan(pharmacie.id, newPlan, billing);
            const ph = await onPlanChanged?.();
            if (ph) setPostes(ph.postes || []);
            return result;
          }}/>
          </ErrorBoundary>
        )}

        {section==="journal"&&(
          <ErrorBoundary compact label="Journal d'activité">
          <LogsPanel pharmacieId={pharmacieId} onOpenOrdo={onOpenOrdo}/>
          </ErrorBoundary>
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
