import { useState, useEffect, useRef } from "react";
import { authSignInEmail, authSignInPIN, authSignOut, getCurrentSession, getSupabaseClient, isDemoMode } from "../supabase.js";
import { PLAN_LIMITS } from "../lib/plans.js";

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

  async function handlePinDigit(d) {
    if (pin.length >= 4) return;
    const newPin = pin + d;
    setPin(newPin); setPinError("");
    if (newPin.length === 4) {
      setPinLoading(true);
      // Passer l'ID pharmacie pour limiter la recherche
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
        <button onClick={()=>setMode("pin")} style={{width:"100%",padding:"13px 16px",border:"1.5px solid #e2e8f0",borderRadius:10,background:"#f8fafc",cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:14}}
          onMouseEnter={e=>{e.currentTarget.style.borderColor="#1a3a6e";e.currentTarget.style.background="#f0f4ff";}}
          onMouseLeave={e=>{e.currentTarget.style.borderColor="#e2e8f0";e.currentTarget.style.background="#f8fafc";}}>
          <div style={{width:40,height:40,borderRadius:10,background:"#1a3a6e",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>🖥️</div>
          <div style={{textAlign:"left"}}><div style={{fontWeight:700,fontSize:14,color:"#1a1a1a"}}>Connexion par code PIN</div><div style={{fontSize:12,color:"#94a3b8",marginTop:2}}>Saisissez votre code à 4 chiffres</div></div>
          <span style={{marginLeft:"auto",color:"#c8d5e8",fontSize:18}}>→</span>
        </button>
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
            <div style={{textAlign:"center",padding:"20px 0"}}>
              <div style={{fontSize:36,marginBottom:12}}>🚀</div>
              <div style={{fontWeight:700,fontSize:16,marginBottom:8}}>Démarrer votre essai gratuit</div>
              <div style={{fontSize:13,color:"#64748b",marginBottom:20}}>30 jours gratuits · Sans engagement · Sans carte bancaire</div>
              <Btn onClick={onBack} style={{width:"100%",justifyContent:"center"}}>Voir les tarifs →</Btn>
            </div>
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

function AppLogin({ onBack, onLogout, onGoToPricing }) {
  // Récupérer la session restaurée depuis le refresh
  const restoredSession = window.__ordomailSession || null;
  const [session, setSession] = useState(restoredSession);
  const [patientPharmacie, setPatientPharmacie] = useState(null);

  if (patientPharmacie) return <PatientPage pharmacie={patientPharmacie} onBack={()=>setPatientPharmacie(null)}/>;

  if (session) {
    if (session.role==="admin") return (
      <div style={{fontFamily:"'Inter',system-ui,sans-serif"}}>
        <div style={{background:"#0f172a",color:"#fff",height:48,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 20px"}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}><span>💊</span><span style={{fontWeight:800}}>OrdoMail Admin</span></div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>onGoToPricing()} style={{background:"rgba(255,255,255,0.1)",border:"none",color:"#fff",padding:"4px 12px",borderRadius:6,cursor:"pointer",fontSize:12,fontFamily:"inherit"}}>💳 Abonnements</button>
            <button onClick={onBack} style={{background:"rgba(255,255,255,0.1)",border:"none",color:"#fff",padding:"4px 12px",borderRadius:6,cursor:"pointer",fontSize:12,fontFamily:"inherit"}}>← Site</button>
            <button onClick={async()=>{ await authSignOut(); window.__ordomailSession=null; setSession(null); (onLogout || onBack)?.(); }} style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.2)",color:"rgba(255,255,255,0.7)",padding:"4px 12px",borderRadius:6,cursor:"pointer",fontSize:12,fontFamily:"inherit"}}>Déconnexion</button>
          </div>
        </div>
        <AdminDashboard onLogout={async ()=>{ await authSignOut(); window.__ordomailSession=null; setSession(null); (onLogout || onBack)?.(); }}/>
      </div>
    );
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
        <PharmacieDashboard pharmacieId={session.pharmacieId} onLogout={async ()=>{ await authSignOut(); window.__ordomailSession=null; setSession(null); (onLogout || onBack)?.(); }} onPatientPage={ph=>setPatientPharmacie(ph)} userRole={session.userRole||"admin"} userId={session.userId||"demo"}/>
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
export default AppLogin;
