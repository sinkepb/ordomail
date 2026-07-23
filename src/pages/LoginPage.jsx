// @version 16/07/2026 15:54 — register-form
import { useState, useEffect, useRef } from "react";
import { authSignInEmail, authSignInPIN, authSignInPSC, authSignOut, getCurrentSession,
  getSupabaseClient, isDemoMode } from "../supabase.js";
import { PLAN_LIMITS } from "../lib/plans.js";
import { Btn, Input, CVBadge } from "../components/ui.jsx";

console.log("✅ MODULE CHARGÉ: pages/LoginPage.jsx");

function BoutonProSanteConnect({ onClick, loading }) {
  return (
    <button onClick={onClick} disabled={loading} style={{
      width:"100%", padding:"14px 20px", border:"none", borderRadius:12,
      background: loading ? "#c8d5e8" : "#003189",
      color:"#fff", fontWeight:800, fontSize:15, cursor: loading?"wait":"pointer",
      fontFamily:"inherit", display:"flex", alignItems:"center", justifyContent:"center", gap:12,
      boxShadow: loading ? "none" : "0 4px 16px rgba(0,49,137,0.35)",
      transition:"all 0.2s",
    }}>
      {loading ? (
        <><span style={{animation:"spin 1s linear infinite",display:"inline-block"}}>⏳</span> Connexion en cours…</>
      ) : (
        <><span style={{fontSize:22}}>🏥</span><div style={{textAlign:"left"}}><div style={{fontSize:13,opacity:0.75,fontWeight:600,letterSpacing:0.3}}>S'identifier avec</div><div style={{fontSize:16,fontWeight:900,letterSpacing:0.2}}>Pro Santé Connect</div></div></>
      )}
    </button>
  );
}

function LoginTabContent({ onLogin }) {
  const [pscLoading, setPscLoading] = useState(false);
  const [mode, setMode] = useState("choice"); // choice | email | pin | pin-code
  const [pin, setPin] = useState("");
  const [code, setCode] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinLoading, setPinLoading] = useState(false);
  const [codePharmacien, setCodePharmacien] = useState(""); // code 6 chiffres
  const [codeError, setCodeError] = useState("");
  const [codeLoading, setCodeLoading] = useState(false);
  const [pharmacieInfo, setPharmacieInfo] = useState(null); // pharmacie trouvée
  const [showFallback, setShowFallback] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  async function handlePSCLogin() {
    setPscLoading(true);
    const result = await authSignInPSC();
    if (result.error) { setPscLoading(false); return; }
    onLogin({ role:"pharmacie", pharmacieId:result.pharmacie.id,
      userRole:result.userRole, userId:result.userId,
      pscUser: result.pscUser || { prenom:"Marie", nom:"DUPONT", organisation:result.pharmacie.nom }
    });
    setPscLoading(false);
  }

  // Étape 1 : valider le code pharmacie 6 chiffres
  async function handleCodePharmacien(code) {
    if (code.length !== 6) return;
    setCodeLoading(true); setCodeError("");
    try {
      if (isDemoMode) {
        const db = window._ordomailDB || { pharmacies: [] };
        const ph = db.pharmacies?.find(p => p.codeVendeur === code);
        if (!ph) { setCodeError("Code pharmacie introuvable"); setCodeLoading(false); return; }
        setPharmacieInfo(ph);
        setMode("pin-code");
      } else {
        const sb = getSupabaseClient();
        const { data: ph, error } = await sb
          .from("pharmacies")
          .select("id, nom, couleur, code_vendeur")
          .eq("code_vendeur", code)
          .maybeSingle();
        if (error || !ph) { setCodeError("Code pharmacie introuvable"); setCodeLoading(false); return; }
        setPharmacieInfo(ph);
        setMode("pin");
      }
    } catch(e) {
      setCodeError("Erreur de connexion");
    }
    setCodeLoading(false);
  }

  async function handleCodePharmacieSubmit() {
    if (code.length !== 6) return;
    setCodeLoading(true); setCodeError("");
    try {
      if (isDemoMode) {
        const db = window._ordomailDB || { pharmacies: [] };
        const ph = db.pharmacies?.find(p => p.codeVendeur === code);
        if (!ph) { setCodeError("Code pharmacie introuvable"); setCodeLoading(false); return; }
        setPharmacieInfo(ph);
      } else {
        const sb = getSupabaseClient();
        const { data: ph, error } = await sb
          .from("pharmacies")
          .select("id, nom, couleur, code_vendeur")
          .eq("code_vendeur", code)
          .maybeSingle();
        if (error || !ph) { setCodeError("Code pharmacie introuvable"); setCodeLoading(false); return; }
        setPharmacieInfo(ph);
      }
    } catch(e) { setCodeError("Erreur de connexion"); }
    setCodeLoading(false);
  }

  async function handlePinDigit(d, fullPin) {
    // fullPin = PIN complet depuis input clavier, sinon construire digit par digit
    const newPin = fullPin || (pin.length >= 4 ? pin : pin + d);
    if (!fullPin) { setPin(newPin); setPinError(""); }
    if (newPin.length === 4) {
      setPinLoading(true);
      const result = await authSignInPIN(newPin, pharmacieInfo?.id);
      if (result.error) {
        setPinError("PIN incorrect ou poste inactif"); setPin(""); setPinLoading(false);
      } else {
        onLogin({ role:"pharmacie", pharmacieId:result.pharmacie.id, userRole:"vendeur",
          userId:result.userId, posteNom:result.posteNom,
          pscUser:{ prenom:result.posteNom, nom:"", organisation:result.pharmacie.nom }
        });
      }
    }
  }

  if (mode === "pin-code") return (
    <div>
      <button onClick={() => { setMode("choice"); setCode(""); setCodeError(""); setPharmacieInfo(null); }}
        style={{border:"none",background:"none",cursor:"pointer",color:"#94a3b8",fontSize:13,marginBottom:18,display:"flex",alignItems:"center",gap:5,fontFamily:"inherit"}}>
        ← Retour
      </button>

      {!pharmacieInfo ? (
        /* Étape 1 : saisie code pharmacie */
        <div>
          <div style={{textAlign:"center",marginBottom:22}}>
            <div style={{fontSize:36,marginBottom:8}}>🏥</div>
            <div style={{fontSize:15,fontWeight:800,color:"#1a1a1a",marginBottom:4}}>Code pharmacie</div>
            <div style={{fontSize:12,color:"#94a3b8"}}>Saisissez le code à 6 chiffres de votre pharmacie</div>
          </div>
          <input
            type="tel" maxLength={6} value={code}
            onChange={async e => {
              const v = e.target.value.replace(/[^0-9]/g,"").slice(0,6);
              setCode(v); setCodeError("");
              if (v.length === 6) {
                // Connexion automatique dès les 6 chiffres saisis
                setCodeLoading(true);
                try {
                  if (isDemoMode) {
                    const db = window._ordomailDB || { pharmacies: [] };
                    const ph = db.pharmacies?.find(p => p.codeVendeur === v);
                    if (!ph) { setCodeError("Code pharmacie introuvable"); setCodeLoading(false); return; }
                    setPharmacieInfo(ph);
                  } else {
                    const sb = getSupabaseClient();
                    const { data: ph, error } = await sb
                      .from("pharmacies")
                      .select("id, nom, couleur, code_vendeur")
                      .eq("code_vendeur", v)
                      .maybeSingle();
                    if (error || !ph) { setCodeError("Code pharmacie introuvable"); setCodeLoading(false); return; }
                    setPharmacieInfo(ph);
                  }
                } catch(e) { setCodeError("Erreur de connexion"); }
                setCodeLoading(false);
              }
            }}
            onKeyDown={e => { if (e.key === "Enter" && code.length === 6) handleCodePharmacieSubmit(); }}
            placeholder="123456"
            style={{width:"100%",boxSizing:"border-box",padding:"14px 16px",border:`2px solid ${codeError?"#ef4444":"#e2e8f0"}`,borderRadius:12,fontSize:28,fontFamily:"monospace",fontWeight:900,textAlign:"center",letterSpacing:8,outline:"none",marginBottom:12}}
            autoFocus
          />
          {codeError && (
            <div style={{background:"#fee2e2",border:"1px solid #fecaca",borderRadius:8,padding:"8px 14px",fontSize:13,color:"#dc2626",marginBottom:12,textAlign:"center"}}>{codeError}</div>
          )}
          <button
            onClick={handleCodePharmacieSubmit}
            disabled={code.length !== 6 || codeLoading}
            style={{width:"100%",padding:"14px",border:"none",borderRadius:12,
              background:code.length===6?"#1a3a6e":"#e2e8f0",
              color:code.length===6?"#fff":"#94a3b8",
              fontWeight:800,fontSize:15,cursor:code.length===6?"pointer":"default",fontFamily:"inherit"}}>
            {codeLoading ? "Recherche…" : "→ Continuer"}
          </button>
          {isDemoMode && (
            <div style={{marginTop:12,fontSize:11,color:"#aaa",textAlign:"center",lineHeight:2}}>
              Démo : <code style={{background:"#dbeafe",padding:"1px 6px",borderRadius:3,fontWeight:700}}>123456</code> (Pharmacie Centrale)
              &nbsp;ou&nbsp;
              <code style={{background:"#dbeafe",padding:"1px 6px",borderRadius:3,fontWeight:700}}>654321</code> (Pharmacie du Soleil)
            </div>
          )}
        </div>
      ) : (
        /* Étape 2 : saisie PIN */
        <div>
          <div style={{textAlign:"center",marginBottom:22}}>
            <div style={{fontSize:13,fontWeight:700,color:"#475569",marginBottom:4}}>
              🏥 {pharmacieInfo.nom}
            </div>
            <div style={{fontSize:12,color:"#94a3b8"}}>Saisissez votre code PIN à 4 chiffres</div>
          </div>
          <div style={{display:"flex",justifyContent:"center",gap:12,marginBottom:26}}>
            {[0,1,2,3].map(i=>(
              <div key={i} style={{width:18,height:18,borderRadius:"50%",
                background:i<pin.length?"#1a3a6e":"#e2e8f0",
                border:`2px solid ${i<pin.length?"#1a3a6e":"#cbd5e1"}`,
                transition:"all 0.15s",transform:i<pin.length?"scale(1.15)":"scale(1)"}}/>
            ))}
          </div>
          {/* Input caché pour capture clavier */}
          <input
            type="tel" maxLength={4}
            value={pin}
            onChange={e => {
              const v = e.target.value.replace(/[^0-9]/g,"").slice(0,4);
              setPin(v); setPinError("");
              if (v.length === 4) handlePinDigit(v[v.length-1], v);
            }}
            style={{position:"absolute",opacity:0,width:1,height:1,pointerEvents:"none"}}
            autoFocus
          />
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,maxWidth:240,margin:"0 auto 14px"}}>
            {[1,2,3,4,5,6,7,8,9,"",0,"⌫"].map((d,i)=>(
              <button key={i}
                onClick={()=>{ if(d==="⌫"){setPin(p=>p.slice(0,-1));setPinError("");}else if(d!=="")handlePinDigit(String(d)); }}
                disabled={pinLoading||(d!=="⌫"&&d!==""&&pin.length>=4)}
                style={{height:56,border:d===""?"none":"1.5px solid #e2e8f0",borderRadius:12,
                  background:d===""?"transparent":d==="⌫"?"#fef2f2":"#f8fafc",
                  color:d==="⌫"?"#ef4444":"#1a1a1a",fontSize:d==="⌫"?18:22,
                  fontWeight:700,cursor:d===""?"default":"pointer",fontFamily:"inherit",
                  visibility:d===""?"hidden":"visible"}}>
                {d}
              </button>
            ))}
          </div>
          {pinLoading && <div style={{textAlign:"center",color:"#1a3a6e",fontSize:13,fontWeight:600}}>🔐 Vérification…</div>}
          {pinError && <div style={{background:"#fee2e2",border:"1px solid #fecaca",borderRadius:8,padding:"8px 14px",fontSize:13,color:"#dc2626",textAlign:"center"}}>{pinError}</div>}
          {isDemoMode && (
            <div style={{marginTop:14,padding:"10px 12px",background:"#f0f7ff",borderRadius:8,fontSize:11,color:"#555",lineHeight:1.8}}>
              <div style={{fontWeight:700,marginBottom:2,color:"#1a3a6e"}}>PINs de démo :</div>
              <div>🖥️ Poste Accueil → <code style={{background:"#dbeafe",padding:"1px 5px",borderRadius:3}}>1234</code></div>
              <div>🖥️ Poste Caisse → <code style={{background:"#dbeafe",padding:"1px 5px",borderRadius:3}}>5678</code></div>
            </div>
          )}
          <button onClick={()=>{setPharmacieInfo(null);setPin("");setPinError("");}}
            style={{marginTop:12,background:"none",border:"none",color:"#94a3b8",fontSize:12,cursor:"pointer",fontFamily:"inherit",width:"100%",textAlign:"center"}}>
            ← Changer de pharmacie
          </button>
        </div>
      )}
    </div>
  );

  if (mode === "pin") return (
    <div>
      <button onClick={() => { setMode("choice"); setPin(""); setPinError(""); }}
        style={{border:"none",background:"none",cursor:"pointer",color:"#94a3b8",fontSize:13,marginBottom:18,display:"flex",alignItems:"center",gap:5,fontFamily:"inherit"}}>
        ← Retour
      </button>
      <div style={{textAlign:"center",marginBottom:22}}>
        <div style={{fontSize:13,fontWeight:700,color:"#475569",marginBottom:4}}>Entrez votre code PIN</div>
        <div style={{fontSize:12,color:"#94a3b8"}}>Code à 4 chiffres de votre poste</div>
      </div>
      {/* Points indicateurs */}
      <div style={{display:"flex",justifyContent:"center",gap:12,marginBottom:26}}>
        {[0,1,2,3].map(i=>(
          <div key={i} style={{width:18,height:18,borderRadius:"50%",background:i<pin.length?"#1a3a6e":"#e2e8f0",border:`2px solid ${i<pin.length?"#1a3a6e":"#cbd5e1"}`,transition:"all 0.15s",transform:i<pin.length?"scale(1.15)":"scale(1)"}}/>
        ))}
      </div>
      {/* Input caché pour saisie clavier */}
      <input type="tel" maxLength={4} value={pin}
        onChange={e=>{const v=e.target.value.replace(/[^0-9]/g,"").slice(0,4);setPin(v);setPinError("");if(v.length===4)handlePinDigit(v[v.length-1],v);}}
        style={{position:"absolute",opacity:0,width:1,height:1,pointerEvents:"none"}} autoFocus/>
      {/* Pavé numérique */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,maxWidth:240,margin:"0 auto 14px"}}>
        {[1,2,3,4,5,6,7,8,9,"",0,"⌫"].map((d,i)=>(
          <button key={i}
            onClick={()=>{ if(d==="⌫"){setPin(p=>p.slice(0,-1));setPinError("");}else if(d!=="")handlePinDigit(String(d)); }}
            disabled={pinLoading||(d!=="⌫"&&d!==""&&pin.length>=4)}
            style={{height:56,border:d===""?"none":"1.5px solid #e2e8f0",borderRadius:12,background:d===""?"transparent":d==="⌫"?"#fef2f2":"#f8fafc",color:d==="⌫"?"#ef4444":"#1a1a1a",fontSize:d==="⌫"?18:22,fontWeight:700,cursor:d===""?"default":"pointer",fontFamily:"inherit",visibility:d===""?"hidden":"visible"}}>
            {d}
          </button>
        ))}
      </div>
      {pinLoading && <div style={{textAlign:"center",color:"#1a3a6e",fontSize:13,fontWeight:600}}>🔐 Vérification…</div>}
      {pinError && <div style={{background:"#fee2e2",border:"1px solid #fecaca",borderRadius:8,padding:"8px 14px",fontSize:13,color:"#dc2626",textAlign:"center"}}>{pinError}</div>}
      <div style={{marginTop:14,padding:"10px 12px",background:"#f0f7ff",borderRadius:8,fontSize:11,color:"#555",lineHeight:1.8}}>
        <div style={{fontWeight:700,marginBottom:2,color:"#1a3a6e"}}>PINs de démo :</div>
        <div>🖥️ Poste Accueil → <code style={{background:"#dbeafe",padding:"1px 5px",borderRadius:3}}>1234</code></div>
        <div>🖥️ Poste Caisse → <code style={{background:"#dbeafe",padding:"1px 5px",borderRadius:3}}>5678</code></div>
      </div>
    </div>
  );

  return (
    <>
      {/* Titulaire */}
      <div style={{marginBottom:16}}>
        <div style={{fontSize:11,fontWeight:700,color:"#94a3b8",letterSpacing:1,textTransform:"uppercase",marginBottom:10}}>Titulaire / Pharmacien responsable</div>
        {isDemoMode ? (
          <>
            <BoutonProSanteConnect onClick={handlePSCLogin} loading={pscLoading}/>
            <div style={{display:"flex",gap:8,justifyContent:"center",marginTop:8}}>
              <span style={{fontSize:11,color:"#15803d",fontWeight:600}}>✅ Certifié HDS</span>
              <span style={{fontSize:11,color:"#aaa"}}>·</span>
              <span style={{fontSize:11,color:"#0369a1",fontWeight:600}}>🔒 PGSSI-S</span>
            </div>
          </>
        ) : (
          <div style={{padding:"12px 16px",borderRadius:12,background:"#f8fafc",border:"1.5px solid #e2e8f0",display:"flex",alignItems:"center",gap:12,opacity:0.7}}>
            <div style={{width:40,height:40,borderRadius:10,background:"#e2e8f0",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>🏥</div>
            <div>
              <div style={{fontWeight:700,fontSize:14,color:"#475569"}}>Pro Santé Connect</div>
              <div style={{fontSize:12,color:"#94a3b8",marginTop:2}}>Convention ANS en cours — prochainement</div>
            </div>
            <span style={{marginLeft:"auto",fontSize:10,fontWeight:700,background:"#fef9c3",color:"#92400e",padding:"3px 8px",borderRadius:20,flexShrink:0,whiteSpace:"nowrap"}}>BIENTÔT</span>
          </div>
        )}
      </div>
      {/* Séparateur */}
      <div style={{display:"flex",alignItems:"center",gap:10,margin:"16px 0"}}>
        <div style={{flex:1,height:1,background:"#e2e8f0"}}/>
        <span style={{fontSize:11,color:"#bbb",fontWeight:600}}>OU</span>
        <div style={{flex:1,height:1,background:"#e2e8f0"}}/>
      </div>
      {/* Vendeur */}
      <div style={{marginBottom:14}}>
        <div style={{fontSize:11,fontWeight:700,color:"#94a3b8",letterSpacing:1,textTransform:"uppercase",marginBottom:10}}>Vendeur / Préparateur</div>
        <button onClick={()=>setMode("pin-code")} style={{width:"100%",padding:"13px 16px",border:"1.5px solid #e2e8f0",borderRadius:10,background:"#f8fafc",cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:14}}
          onMouseEnter={e=>{e.currentTarget.style.borderColor="#1a3a6e";e.currentTarget.style.background="#f0f4ff";}}
          onMouseLeave={e=>{e.currentTarget.style.borderColor="#e2e8f0";e.currentTarget.style.background="#f8fafc";}}>
          <div style={{width:40,height:40,borderRadius:10,background:"#1a3a6e",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>🖥️</div>
          <div style={{textAlign:"left"}}>
            <div style={{fontWeight:700,fontSize:14,color:"#1a1a1a"}}>Connexion vendeur</div>
            <div style={{fontSize:12,color:"#94a3b8",marginTop:2}}>Code pharmacie + code PIN à 4 chiffres</div>
          </div>
          <span style={{marginLeft:"auto",color:"#c8d5e8",fontSize:18}}>→</span>
        </button>
        {isDemoMode && (
          <div style={{marginTop:8,fontSize:11,color:"#aaa",lineHeight:2,padding:"8px 12px",background:"#f8fafc",borderRadius:8,border:"1px solid #e2e8f0"}}>
            <div style={{fontWeight:700,color:"#475569",marginBottom:2}}>Codes démo :</div>
            <div>🏥 Pharmacie Centrale → code <code style={{background:"#dbeafe",padding:"1px 6px",borderRadius:3,fontWeight:700}}>123456</code></div>
            <div>🖥️ Poste Accueil → PIN <code style={{background:"#dbeafe",padding:"1px 6px",borderRadius:3,fontWeight:700}}>1234</code></div>
            <div>🖥️ Poste Caisse → PIN <code style={{background:"#dbeafe",padding:"1px 6px",borderRadius:3,fontWeight:700}}>5678</code></div>
          </div>
        )}
      </div>
            {/* Séparateur */}
      <div style={{display:"flex",alignItems:"center",gap:10,margin:"16px 0"}}>
        <div style={{flex:1,height:1,background:"#e2e8f0"}}/>
        <span style={{fontSize:11,color:"#bbb",fontWeight:600}}>OU</span>
        <div style={{flex:1,height:1,background:"#e2e8f0"}}/>
      </div>
      {/* Connexion email — visible en démo ET en production */}
      <div style={{marginBottom:4}}>
        <div style={{fontSize:11,fontWeight:700,color:"#94a3b8",letterSpacing:1,textTransform:"uppercase",marginBottom:10}}>Titulaire — Connexion email</div>
        <Input label="Email" value={email} onChange={setEmail} type="email" placeholder="contact@mapharmacie.fr" icon="✉️"/>
        <Input label="Mot de passe" value={password} onChange={setPassword} type="password" placeholder="••••••••" icon="🔒"/>
        {emailError && (
          <div style={{color:"#dc2626",fontSize:12,marginBottom:8,padding:"6px 10px",background:"#fee2e2",borderRadius:7}}>⚠️ {emailError}</div>
        )}
        <Btn onClick={()=>{
          setEmailLoading(true); setEmailError("");
          authSignInEmail(email, password).then(result => {
            if (result.error || !result.pharmacie) {
              setEmailError("Email ou mot de passe incorrect");
              setEmailLoading(false); return;
            }
            onLogin({role:"pharmacie", pharmacieId:result.pharmacie.id, userRole:result.userRole||"admin", userId:result.userId});
          });
        }} disabled={emailLoading||!email||!password} style={{width:"100%",justifyContent:"center"}}>
          {emailLoading?"Connexion en cours…":"→ Se connecter"}
        </Btn>
        {isDemoMode && (
          <div style={{marginTop:8,fontSize:11,color:"#aaa",lineHeight:1.8,textAlign:"center"}}>
            Démo : <code style={{background:"#f0f0f0",padding:"1px 5px",borderRadius:3}}>contact@pharmaciecentrale.fr</code> / <code style={{background:"#f0f0f0",padding:"1px 5px",borderRadius:3}}>demo123</code>
          </div>
        )}
        {/* Lien mot de passe oublié — visible en prod */}
        <div style={{marginTop:10,textAlign:"center"}}>
          <button onClick={()=>{setShowReset(!showReset);setResetSent(false);}}
            style={{background:"none",border:"none",color:"#6b7280",fontSize:12,cursor:"pointer",fontFamily:"inherit",textDecoration:"underline"}}>
            Mot de passe oublié ?
          </button>
        </div>
        {/* Formulaire de réinitialisation */}
        {showReset && !isDemoMode && (
          <div style={{marginTop:12,padding:"14px 16px",background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:10}}>
            {resetSent ? (
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:28,marginBottom:8}}>📧</div>
                <div style={{fontWeight:700,fontSize:14,color:"#15803d",marginBottom:4}}>Email envoyé !</div>
                <div style={{fontSize:12,color:"#64748b",lineHeight:1.6}}>
                  Vérifiez votre boîte mail et cliquez le lien pour réinitialiser votre mot de passe.
                </div>
              </div>
            ) : (
              <>
                <div style={{fontSize:12,color:"#374151",fontWeight:600,marginBottom:8}}>Réinitialiser le mot de passe</div>
                <Input label="Votre email" value={email} onChange={setEmail} type="email" placeholder="contact@mapharmacie.fr" icon="✉️"/>
                <Btn onClick={async ()=>{
                  if (!email) return;
                  setResetLoading(true);
                  try {
                    const sb = getSupabaseClient();
                    if (!sb) { setEmailError("Supabase non disponible"); return; }
                    await sb.auth.resetPasswordForEmail(email, {
                      redirectTo: "https://ordomail.fr",
                    });
                    setResetSent(true);
                  } catch(e) {
                    setEmailError("Erreur lors de l'envoi — vérifiez votre email");
                  }
                  setResetLoading(false);
                }} disabled={resetLoading||!email} style={{width:"100%",justifyContent:"center",marginTop:4}}>
                  {resetLoading?"Envoi en cours…":"Envoyer le lien →"}
                </Btn>
              </>
            )}
          </div>
        )}
      </div>    </>
  );
}

function LoginPage({ onLogin, onBack }) {
  const [tab, setTab] = useState("login"); // login | register
  return (
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#1a3a6e 0%,#15623a 100%)",display:"flex",alignItems:"center",justifyContent:"center",padding:24,fontFamily:"'Inter',system-ui,sans-serif"}}>
      <div style={{width:"100%",maxWidth:420}}>
        {/* Logo */}
        <div style={{textAlign:"center",marginBottom:28}}>
          <div style={{fontSize:48,marginBottom:10}}>💊</div>
          <div style={{fontWeight:900,fontSize:26,color:"#fff",marginBottom:4}}>OrdoMail</div>
          <div style={{fontSize:14,color:"rgba(255,255,255,0.6)"}}>Connexion à votre espace pharmacie</div>
        </div>
        {/* Card */}
        <div style={{background:"#fff",borderRadius:20,padding:28,boxShadow:"0 24px 60px rgba(0,0,0,0.35)",animation:"popIn 0.2s ease"}}>
          {/* Onglets */}
          <div style={{display:"flex",background:"#f8fafc",borderRadius:10,padding:4,gap:4,marginBottom:24}}>
            {[["login","Connexion"],["register","Créer un compte"]].map(([k,l])=>(
              <button key={k} onClick={()=>setTab(k)} style={{flex:1,padding:"8px",border:"none",borderRadius:8,cursor:"pointer",fontFamily:"inherit",fontSize:13,fontWeight:tab===k?700:500,background:tab===k?"#fff":"transparent",color:tab===k?"#1a1a1a":"#94a3b8",boxShadow:tab===k?"0 1px 4px rgba(0,0,0,0.08)":"none",transition:"all 0.15s"}}>{l}</button>
            ))}
          </div>
          {tab==="login" && <LoginTabContent onLogin={onLogin}/>}
          {tab==="register" && (
            <RegisterForm onLogin={onLogin} />
          )}
        </div>
        <div style={{textAlign:"center",marginTop:16}}>
          <button onClick={onBack} style={{background:"none",border:"none",color:"rgba(255,255,255,0.5)",fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>← Retour au site</button>
        </div>
      </div>
      <style>{`@keyframes popIn{0%{opacity:0;transform:scale(0.92)}100%{opacity:1;transform:scale(1)}}`}</style>
    </div>
  );
}

function AppLogin({ onBack, onLogout, onGoToPricing, DashboardComponent, PatientComponent }) {
  // Récupérer la session restaurée depuis le refresh
  const restoredSession = window.__ordomailSession || null;
  const [session, setSession] = useState(restoredSession);
  const [patientPharmacie, setPatientPharmacie] = useState(null);

  if (patientPharmacie) return <PatientComponent pharmacie={patientPharmacie} onBack={()=>setPatientPharmacie(null)}/>;

  // Note : toute connexion pharmacie (titulaire ou vendeur) produit une session avec
  // role:"pharmacie" — seul session.userRole distingue "admin" (titulaire) de "vendeur"
  // (voir les boutons/badges ci-dessous). Le backoffice OrdoMail Business est un flux
  // entièrement séparé (route "backoffice" → BackofficeAdmin, dans App.jsx).
  if (session) {
    return (
      <div style={{fontFamily:"'Inter',system-ui,sans-serif"}}>
        <div style={{background:"#1a3a6e",color:"#fff",height:44,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 14px"}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}><span>💊</span><span style={{fontWeight:800,fontSize:14}}>OrdoMail</span></div>
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            <span style={{fontSize:11,color:"rgba(255,255,255,0.5)"}}>{session.pscUser?.prenom||session.posteNom} {session.pscUser?.nom||""}</span>
            {session.userRole==="admin"&&<span style={{fontSize:10,fontWeight:700,background:"rgba(255,255,255,0.15)",color:"rgba(255,255,255,0.8)",padding:"2px 8px",borderRadius:12}}>👑 Admin</span>}
            {session.userRole==="vendeur"&&<span style={{fontSize:10,fontWeight:700,background:"rgba(255,255,255,0.15)",color:"rgba(255,255,255,0.7)",padding:"2px 8px",borderRadius:12}}>🖥️ {session.posteNom||"Vendeur"}</span>}
            {session.userRole==="admin"&&<button onClick={()=>onGoToPricing()} style={{background:"rgba(255,255,255,0.15)",border:"none",color:"#fff",padding:"4px 11px",borderRadius:6,cursor:"pointer",fontSize:11,fontFamily:"inherit"}}>💳</button>}
            <button onClick={onBack} style={{background:"rgba(255,255,255,0.1)",border:"none",color:"#fff",padding:"3px 10px",borderRadius:6,cursor:"pointer",fontSize:11,fontFamily:"inherit"}}>← Site</button>
            <button onClick={async()=>{ await authSignOut(); window.__ordomailSession=null; setSession(null); (onLogout || onBack)?.(); }} style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.2)",color:"rgba(255,255,255,0.6)",padding:"3px 10px",borderRadius:6,cursor:"pointer",fontSize:11,fontFamily:"inherit"}}>⏏</button>
          </div>
        </div>
        <DashboardComponent pharmacieId={session.pharmacieId} onLogout={async ()=>{ await authSignOut(); window.__ordomailSession=null; setSession(null); (onLogout || onBack)?.(); }} onPatientPage={ph=>setPatientPharmacie(ph)} userRole={session.userRole||"admin"} userId={session.userId||"demo"}/>
      </div>
    );
  }
  return <LoginPage onLogin={s=>setSession(s)} onBack={onBack}/>;
}

function ResetPasswordPage({ onDone }) {
  const [pwd,    setPwd]    = useState("");
  const [pwd2,   setPwd2]   = useState("");
  const [status, setStatus] = useState("idle");
  const [msg,    setMsg]    = useState("");

  async function handleReset() {
    if (pwd.length < 8) { setMsg("8 caractères minimum"); return; }
    if (pwd !== pwd2)   { setMsg("Les mots de passe ne correspondent pas"); return; }
    setStatus("loading"); setMsg("");
    try {
      // Supabase detectSessionInUrl:true établit la session depuis le hash automatiquement
      const sb = getSupabaseClient();
      if (!sb) throw new Error("Supabase non disponible");
      // Attendre que la session soit établie depuis le hash URL
      let session = null;
      for (let i = 0; i < 8; i++) {
        const { data } = await sb.auth.getSession();
        if (data.session) { session = data.session; break; }
        await new Promise(r => setTimeout(r, 400));
      }
      if (!session) throw new Error("Session expirée — veuillez redemander un lien");
      const { error } = await sb.auth.updateUser({ password: pwd });
      if (error) throw error;
      setStatus("success");
      window.history.replaceState({}, "", window.location.pathname);
      setTimeout(onDone, 2500);
    } catch(e) {
      setStatus("error");
      setMsg(e.message || "Erreur");
    }
  }

  return (
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#1a3a6e,#15623a)",display:"flex",alignItems:"center",justifyContent:"center",padding:24,fontFamily:"'Inter',system-ui,sans-serif"}}>
      <div style={{width:"100%",maxWidth:420}}>
        <div style={{textAlign:"center",marginBottom:28}}>
          <div style={{fontSize:48,marginBottom:10}}>🔑</div>
          <div style={{fontWeight:900,fontSize:24,color:"#fff",marginBottom:4}}>Nouveau mot de passe</div>
          <div style={{fontSize:14,color:"rgba(255,255,255,0.6)"}}>OrdoMail — Réinitialisation</div>
        </div>
        <div style={{background:"#fff",borderRadius:20,padding:28,boxShadow:"0 24px 60px rgba(0,0,0,0.35)"}}>
          {status === "success" ? (
            <div style={{textAlign:"center",padding:"20px 0"}}>
              <div style={{fontSize:52,marginBottom:14}}>✅</div>
              <div style={{fontWeight:800,fontSize:18,color:"#15803d",marginBottom:8}}>Mot de passe mis à jour !</div>
              <div style={{fontSize:14,color:"#64748b"}}>Redirection vers la connexion…</div>
            </div>
          ) : (
            <>
              <div style={{marginBottom:14}}>
                <label style={{fontSize:12,fontWeight:700,color:"#374151",display:"block",marginBottom:5}}>Nouveau mot de passe</label>
                <input type="password" value={pwd} onChange={e=>setPwd(e.target.value)}
                  placeholder="8 caractères minimum"
                  style={{width:"100%",padding:"11px 12px",border:`1.5px solid ${pwd.length>0&&pwd.length<8?"#ef4444":"#e2e8f0"}`,borderRadius:9,fontSize:14,outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}/>
                {pwd.length > 0 && (
                  <div style={{marginTop:5,display:"flex",gap:4,alignItems:"center"}}>
                    {[8,12,16].map(n=>(
                      <div key={n} style={{flex:1,height:3,borderRadius:2,background:pwd.length>=n?"#15803d":"#e2e8f0",transition:"background 0.2s"}}/>
                    ))}
                    <span style={{fontSize:10,color:"#94a3b8",marginLeft:4,whiteSpace:"nowrap"}}>{pwd.length<8?"Trop court":pwd.length<12?"Moyen":"Fort"}</span>
                  </div>
                )}
              </div>
              <div style={{marginBottom:18}}>
                <label style={{fontSize:12,fontWeight:700,color:"#374151",display:"block",marginBottom:5}}>Confirmer</label>
                <input type="password" value={pwd2} onChange={e=>setPwd2(e.target.value)}
                  placeholder="Répéter le mot de passe"
                  style={{width:"100%",padding:"11px 12px",border:`1.5px solid ${pwd2.length>0&&pwd2!==pwd?"#ef4444":pwd2.length>0&&pwd2===pwd?"#15803d":"#e2e8f0"}`,borderRadius:9,fontSize:14,outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}/>
                {pwd2.length>0&&pwd===pwd2&&<div style={{fontSize:12,color:"#15803d",marginTop:4,fontWeight:600}}>✓ Les mots de passe correspondent</div>}
              </div>
              {msg && <div style={{background:"#fee2e2",border:"1px solid #fecaca",borderRadius:8,padding:"9px 12px",fontSize:13,color:"#dc2626",marginBottom:14}}>{msg}</div>}
              <button onClick={handleReset}
                disabled={status==="loading"||!pwd||!pwd2}
                style={{width:"100%",padding:"13px",border:"none",borderRadius:11,background:status==="loading"||!pwd||!pwd2?"#e2e8f0":"#1a3a6e",color:status==="loading"||!pwd||!pwd2?"#94a3b8":"#fff",fontWeight:800,fontSize:15,cursor:status==="loading"||!pwd||!pwd2?"not-allowed":"pointer",fontFamily:"inherit",transition:"all 0.15s"}}>
                {status==="loading"?"Mise à jour en cours…":"Définir le mot de passe →"}
              </button>
            </>
          )}
        </div>
        <div style={{textAlign:"center",marginTop:14}}>
          <button onClick={onDone} style={{background:"none",border:"none",color:"rgba(255,255,255,0.5)",fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>← Retour à la connexion</button>
        </div>
      </div>
    </div>
  );
}

export { BoutonProSanteConnect, LoginTabContent, LoginPage, AppLogin, ResetPasswordPage };
export default AppLogin
// ── Formulaire de création de compte pharmacie ────────────────────────────
function RegisterForm({ onLogin }) {
  const [nom,     setNom]     = useState("");
  const [email,   setEmail]   = useState("");
  const [pwd,     setPwd]     = useState("");
  const [tel,     setTel]     = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const [success, setSuccess] = useState(false);

  async function handleRegister() {
    if (!nom || !email || !pwd) { setError("Nom, email et mot de passe requis"); return; }
    if (pwd.length < 6) { setError("Mot de passe : 6 caractères minimum"); return; }
    setLoading(true); setError("");
    try {
      if (isDemoMode) {
        onLogin({ role:"pharmacie", pharmacieId:"demo-"+Date.now(), userRole:"admin",
          pscUser:{ prenom:"Demo", nom, organisation:nom } });
        return;
      }
      const sb = getSupabaseClient();
      const { data: authData, error: authErr } = await sb.auth.signUp({ email, password: pwd });
      if (authErr) { setError(authErr.message); setLoading(false); return; }
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const res = await fetch(`${supabaseUrl}/functions/v1/register-pharmacie`, {
        method: "POST",
        headers: { "Content-Type":"application/json", "apikey": supabaseKey },
        body: JSON.stringify({ nom, email, tel, userId: authData.user?.id }),
      });
      const data = await res.json();
      if (!data.success) { setError(data.error || "Erreur création compte"); setLoading(false); return; }
      setSuccess(true);
    } catch(e) { setError("Erreur : " + e.message); }
    setLoading(false);
  }

  if (success) return (
    <div style={{textAlign:"center",padding:"20px 0"}}>
      <div style={{fontSize:48,marginBottom:12}}>✅</div>
      <div style={{fontWeight:800,fontSize:16,color:"#15803d",marginBottom:8}}>Compte créé !</div>
      <div style={{fontSize:13,color:"#64748b"}}>Vérifiez votre email pour confirmer votre compte.</div>
    </div>
  );

  return (
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      <input value={nom} onChange={e=>setNom(e.target.value)} placeholder="Nom de votre pharmacie *"
        style={{padding:"11px 14px",border:"1.5px solid #e2e8f0",borderRadius:10,fontSize:14,fontFamily:"inherit",outline:"none"}}/>
      <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email professionnel *" type="email"
        style={{padding:"11px 14px",border:"1.5px solid #e2e8f0",borderRadius:10,fontSize:14,fontFamily:"inherit",outline:"none"}}/>
      <input value={pwd} onChange={e=>setPwd(e.target.value)} placeholder="Mot de passe (6 car. min) *" type="password"
        style={{padding:"11px 14px",border:"1.5px solid #e2e8f0",borderRadius:10,fontSize:14,fontFamily:"inherit",outline:"none"}}/>
      <input value={tel} onChange={e=>setTel(e.target.value)} placeholder="Téléphone (optionnel)"
        style={{padding:"11px 14px",border:"1.5px solid #e2e8f0",borderRadius:10,fontSize:14,fontFamily:"inherit",outline:"none"}}/>
      {error && <div style={{fontSize:12,color:"#dc2626",background:"#fee2e2",padding:"8px 12px",borderRadius:8}}>{error}</div>}
      <button onClick={handleRegister} disabled={loading}
        style={{padding:"13px",border:"none",borderRadius:10,background:loading?"#94a3b8":"#1a3a6e",
          color:"#fff",fontWeight:800,fontSize:15,cursor:loading?"default":"pointer",fontFamily:"inherit"}}>
        {loading ? "Création..." : "🚀 Démarrer l'essai gratuit"}
      </button>
      <div style={{fontSize:11,color:"#94a3b8",textAlign:"center"}}>
        30 jours gratuits · Sans engagement · Sans carte bancaire
      </div>
    </div>
  );
}

;