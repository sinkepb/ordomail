// Extrait de AdminPage.jsx (phase 4) — composant autonome (props + état local
// uniquement). Découpage des gros fichiers, voir DEPLOIEMENT_PHASE2.md/PHASE4.md.
//
// ⚠️ Copié verbatim (aucun changement de logique) — ce composant gère l'inscription
// + le paiement Stripe Checkout réel (phase 3), déjà testé de bout en bout le
// 24/07/2026. Ne pas modifier son comportement lors d'un futur refactor sans retester.
import { useState, useEffect } from "react";
import { PLAN_LIMITS, PLAN_ORDER } from "../lib/plans.js";
import { PersistentNav } from "../pages/LandingPage.jsx";
import { getSupabaseClient, setPendingCheckout } from "../supabase.js";

// Validation légère de format (pas de géocodage/API externe) : présence d'un
// numéro+rue plausible et d'un code postal français à 5 chiffres. Ne vérifie
// pas que l'adresse existe réellement, seulement qu'elle est correctement
// formée avant de l'envoyer à register-pharmacie.
function isValidAddress(s) {
  const t = (s || "").trim();
  return t.length >= 8 && /\d{5}/.test(t);
}

function BillingModule({ initialView, planId, billing, onBack, resumePharmacieId, resumeEmail }) {
  const [view, setView] = useState(initialView||"pricing");
  const [step, setStep] = useState("details");
  const [checkoutPlan, setCheckoutPlan] = useState(planId||"standard");
  const [checkoutBilling, setCheckoutBilling] = useState(billing||"monthly");
  const [billingTab, setBillingTab] = useState("monthly");
  const [form, setForm] = useState({nom:"",email:"",password:"",pharmacie:"",adresse:"",siret:""});
  const [errors, setErrors] = useState({});
  const [createError, setCreateError] = useState("");
  const [redirecting, setRedirecting] = useState(false);
  const [createdEmail, setCreatedEmail] = useState("");
  const [createdEmailReception, setCreatedEmailReception] = useState("");
  const [createdPlan, setCreatedPlan] = useState("");
  const [createdTrialEndsAt, setCreatedTrialEndsAt] = useState("");

  // Autocomplétion "Pharmacie *" (référentiel SIRENE, ~10k pharmacies
  // françaises actives — voir supabase/functions/search-pharmacies-referentiel)
  // : un assistant, pas une contrainte — sélectionner une suggestion remplit
  // nom + adresse + SIRET d'un coup, mais le titulaire garde la main pour
  // saisir librement si sa pharmacie n'y figure pas.
  const [pharmaSuggestions, setPharmaSuggestions] = useState([]);
  const [pharmaFocused, setPharmaFocused] = useState(false);
  const [pharmaLoading, setPharmaLoading] = useState(false);
  useEffect(() => {
    const q = form.pharmacie.trim();
    if (q.length < 2) { setPharmaSuggestions([]); return; }
    setPharmaLoading(true);
    const t = setTimeout(async () => {
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
        const res = await fetch(`${supabaseUrl}/functions/v1/search-pharmacies-referentiel?q=${encodeURIComponent(q)}`, {
          headers: { apikey: supabaseKey },
        });
        const data = await res.json();
        setPharmaSuggestions(data.data || []);
      } catch {
        setPharmaSuggestions([]);
      }
      setPharmaLoading(false);
    }, 300);
    return () => clearTimeout(t);
  }, [form.pharmacie]);

  // Autocomplétion d'adresse (API Adresse — data.gouv.fr, base officielle
  // française, publique et gratuite, aucune clé requise) : suggère des
  // adresses réellement existantes et déjà bien formées, pour éviter les
  // adresses mal formatées ou fictives à l'inscription. isValidAddress reste
  // la validation de repli si le client tape sans choisir de suggestion.
  const [adresseSuggestions, setAdresseSuggestions] = useState([]);
  const [adresseFocused, setAdresseFocused] = useState(false);
  const [adresseLoading, setAdresseLoading] = useState(false);
  useEffect(() => {
    const q = form.adresse.trim();
    if (q.length < 4) { setAdresseSuggestions([]); return; }
    setAdresseLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=5`);
        const data = await res.json();
        setAdresseSuggestions(data.features || []);
      } catch {
        setAdresseSuggestions([]);
      }
      setAdresseLoading(false);
    }, 300);
    return () => clearTimeout(t);
  }, [form.adresse]);

  // Retour depuis Stripe Checkout (redirection pleine page — le state React d'avant
  // le départ vers Stripe est perdu, on lit juste le paramètre de retour).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get("checkout");
    if (checkout === "success") {
      window.history.replaceState({}, "", window.location.pathname);
      setView("success");
    } else if (checkout === "cancelled") {
      window.history.replaceState({}, "", window.location.pathname);
      setCreateError("Paiement annulé — votre compte a été créé mais l'abonnement n'a pas démarré. Réessayez ci-dessous.");
      setView("checkout"); setStep("card");
    }
  }, []);

  const plan = PLAN_LIMITS[checkoutPlan]||PLAN_LIMITS.standard;
  const price = checkoutBilling==="annual"?plan.priceAnnual:plan.price;

  if (view==="creating") return (
    <div style={{minHeight:"100vh",background:"linear-gradient(160deg,#1a3a6e,#15623a)",display:"flex",alignItems:"center",justifyContent:"center",padding:24,fontFamily:"'Inter',system-ui,sans-serif"}}>
      <div style={{background:"#fff",borderRadius:20,padding:"40px 36px",maxWidth:440,width:"100%",textAlign:"center",boxShadow:"0 24px 60px rgba(0,0,0,0.25)"}}>
        <div style={{fontSize:48,marginBottom:20,animation:"spin 1s linear infinite",display:"inline-block"}}>⚙️</div>
        <div style={{fontWeight:900,fontSize:22,color:"#0f172a",marginBottom:8}}>Création en cours…</div>
        <div style={{fontSize:14,color:"#64748b"}}>Votre espace est en cours de configuration</div>
      </div>
    </div>
  );

  // Compte + pharmacie créés, mais pas encore de session (confirmation email
  // requise sur ce projet) — distinct de "success" (retour réel de Stripe
  // Checkout après paiement) pour ne pas prétendre que l'essai a démarré alors
  // que le paiement n'a pas encore eu lieu. Le paiement reprend automatiquement
  // après le clic sur le lien de confirmation (voir App.jsx, effet "Restaurer
  // la session" + setPendingCheckout ci-dessous).
  if (view==="awaiting-confirmation") return (
    <div style={{minHeight:"100vh",background:"linear-gradient(160deg,#1a3a6e,#15623a)",display:"flex",alignItems:"center",justifyContent:"center",padding:24,fontFamily:"'Inter',system-ui,sans-serif"}}>
      <div style={{background:"#fff",borderRadius:20,padding:"40px 36px",maxWidth:440,width:"100%",textAlign:"center",boxShadow:"0 24px 60px rgba(0,0,0,0.25)"}}>
        <div style={{fontSize:64,marginBottom:16}}>📧</div>
        <h2 style={{fontWeight:900,fontSize:24,color:"#0f172a",marginBottom:8}}>Compte créé !</h2>
        <p style={{color:"#64748b",fontSize:14,marginBottom:16,lineHeight:1.7}}>
          Un email de confirmation a été envoyé à<br/>
          <strong style={{color:"#1a3a6e"}}>{createdEmail}</strong>
        </p>
        <div style={{background:"#fef9c3",border:"1px solid #fde68a",borderRadius:8,padding:"10px 14px",fontSize:13,color:"#92400e",marginBottom:16,textAlign:"left",lineHeight:1.6}}>
          ⚠️ Cliquez le lien reçu par email — vous serez automatiquement redirigé vers le paiement sécurisé (carte requise, débitée uniquement après les 30 jours d'essai).
        </div>
        <button onClick={onBack} style={{width:"100%",padding:14,border:"none",borderRadius:11,background:"#1a3a6e",color:"#fff",fontWeight:800,fontSize:16,cursor:"pointer",fontFamily:"inherit"}}>Retour à l'accueil</button>
      </div>
    </div>
  );

  if (view==="success") {
    // @fix 29/08/2026 — cette vue n'est atteinte QUE via le retour réel de
    // Stripe Checkout (?checkout=success, ligne ~94) : une navigation pleine
    // page (window.location.href vers Stripe puis retour), qui recharge
    // entièrement l'app et perd tout état React posé juste avant de partir
    // (createdEmail/createdTrialEndsAt inclus) — d'où le repli sur "30 jours à
    // partir de maintenant" plutôt que la valeur exacte de trial_ends_at,
    // fiable uniquement côté "awaiting-confirmation" (pas de navigation avant
    // affichage). Par ailleurs, atteindre cette vue exige une session active
    // (create-checkout-session la requiert) — donc l'email est nécessairement
    // déjà confirmé à ce stade : l'ancien message "cliquez le lien pour
    // activer votre compte" y était toujours faux, signalé par l'utilisateur.
    const trialDate = new Date(createdTrialEndsAt || (Date.now() + 30*86400000))
      .toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
    return (
    <div style={{minHeight:"100vh",background:"linear-gradient(160deg,#1a3a6e,#15623a)",display:"flex",alignItems:"center",justifyContent:"center",padding:24,fontFamily:"'Inter',system-ui,sans-serif"}}>
      <div style={{background:"#fff",borderRadius:20,padding:"40px 36px",maxWidth:440,width:"100%",textAlign:"center",boxShadow:"0 24px 60px rgba(0,0,0,0.25)"}}>
        <div style={{fontSize:64,marginBottom:16}}>🎉</div>
        <h2 style={{fontWeight:900,fontSize:24,color:"#0f172a",marginBottom:8}}>Compte créé !</h2>
        <p style={{color:"#64748b",fontSize:14,marginBottom:16,lineHeight:1.7}}>
          Votre compte est actif, essai gratuit démarré.
        </p>
        <div style={{background:"#f0f7ff",border:"1px solid #dbeafe",borderRadius:10,padding:"12px 16px",marginBottom:16,textAlign:"left",fontSize:13}}>
          <div style={{fontWeight:700,color:"#1a3a6e",marginBottom:6}}>📋 Vos informations</div>
          {createdEmailReception && <div style={{color:"#475569",marginBottom:4}}>✉️ Adresse ordonnances :<br/><strong style={{fontFamily:"monospace",fontSize:12}}>{createdEmailReception}</strong></div>}
          {createdPlan && <div style={{color:"#475569",marginBottom:4}}>💳 Plan : <strong>{createdPlan}</strong></div>}
          <div style={{color:"#475569"}}>🗓️ Essai gratuit jusqu'au <strong>{trialDate}</strong> — carte débitée à partir de cette date.</div>
        </div>
        <button onClick={onBack} style={{width:"100%",padding:14,border:"none",borderRadius:11,background:"#1a3a6e",color:"#fff",fontWeight:800,fontSize:16,cursor:"pointer",fontFamily:"inherit"}}>Aller à la connexion →</button>
      </div>
    </div>
  );
  }

  if (view==="checkout") return (
    <div style={{minHeight:"100vh",background:"#f8fafc",fontFamily:"'Inter',system-ui,sans-serif"}}>
      <PersistentNav onBack={onBack} currentPage="checkout" secure/>
      <div style={{maxWidth:840,margin:"0 auto",padding:"24px 16px",display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,340px),1fr))",gap:18}}>
        <div style={{background:"#fff",borderRadius:16,padding:28,boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
          {step==="details"&&(
            <>
              <h3 style={{fontWeight:800,fontSize:18,color:"#0f172a",marginBottom:22,marginTop:0}}>Informations</h3>
              <div style={{marginBottom:14,position:"relative"}}>
                <label style={{fontSize:12,fontWeight:700,color:"#374151",display:"block",marginBottom:5}}>Pharmacie *</label>
                <input type="text" placeholder="Pharmacie de la Paix" value={form.pharmacie}
                  onChange={e=>setForm(f=>({...f,pharmacie:e.target.value,siret:""}))}
                  onFocus={()=>setPharmaFocused(true)}
                  onBlur={()=>setTimeout(()=>setPharmaFocused(false),150)}
                  autoComplete="off"
                  style={{width:"100%",padding:"10px 12px",border:`1.5px solid ${errors.pharmacie?"#ef4444":"#e2e8f0"}`,borderRadius:9,fontSize:14,outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}/>
                {errors.pharmacie&&<div style={{fontSize:12,color:"#ef4444",marginTop:3}}>{errors.pharmacie}</div>}
                {pharmaFocused && (pharmaLoading || pharmaSuggestions.length>0) && (
                  <div style={{position:"absolute",top:"100%",left:0,right:0,marginTop:2,background:"#fff",border:"1px solid #e2e8f0",borderRadius:9,boxShadow:"0 8px 20px rgba(0,0,0,0.1)",zIndex:20,overflow:"hidden"}}>
                    {pharmaLoading && pharmaSuggestions.length===0 && (
                      <div style={{padding:"10px 12px",fontSize:13,color:"#94a3b8"}}>Recherche…</div>
                    )}
                    {pharmaSuggestions.map(p=>(
                      <div key={p.siret}
                        onMouseDown={()=>{setForm(f=>({...f,pharmacie:p.nom,adresse:p.adresse,siret:p.siret}));setPharmaSuggestions([]);setPharmaFocused(false);}}
                        style={{padding:"10px 12px",fontSize:13,color:"#1e293b",cursor:"pointer",borderBottom:"1px solid #f1f5f9"}}
                        onMouseEnter={e=>e.currentTarget.style.background="#f8fafc"}
                        onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                        💊 {p.nom}<br/><span style={{fontSize:11,color:"#94a3b8"}}>{p.commune} ({p.code_postal})</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {[["nom","Votre nom *","text","Dr MARTIN Pierre"],["email","Email *","email","contact@pharmacie.fr"],["password","Mot de passe *","password","8 caractères minimum"]].map(([k,l,t,ph])=>(
                <div key={k} style={{marginBottom:14}}>
                  <label style={{fontSize:12,fontWeight:700,color:"#374151",display:"block",marginBottom:5}}>{l}</label>
                  <input type={t} placeholder={ph} value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))}
                    style={{width:"100%",padding:"10px 12px",border:`1.5px solid ${errors[k]?"#ef4444":"#e2e8f0"}`,borderRadius:9,fontSize:14,outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}/>
                  {errors[k]&&<div style={{fontSize:12,color:"#ef4444",marginTop:3}}>{errors[k]}</div>}
                </div>
              ))}
              <div style={{marginBottom:14,position:"relative"}}>
                <label style={{fontSize:12,fontWeight:700,color:"#374151",display:"block",marginBottom:5}}>Adresse *</label>
                <input type="text" placeholder="12 rue de la Paix, 75001 Paris" value={form.adresse}
                  onChange={e=>setForm(f=>({...f,adresse:e.target.value}))}
                  onFocus={()=>setAdresseFocused(true)}
                  onBlur={()=>setTimeout(()=>setAdresseFocused(false),150)}
                  autoComplete="off"
                  style={{width:"100%",padding:"10px 12px",border:`1.5px solid ${errors.adresse?"#ef4444":"#e2e8f0"}`,borderRadius:9,fontSize:14,outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}/>
                {errors.adresse&&<div style={{fontSize:12,color:"#ef4444",marginTop:3}}>{errors.adresse}</div>}
                {adresseFocused && (adresseLoading || adresseSuggestions.length>0) && (
                  <div style={{position:"absolute",top:"100%",left:0,right:0,marginTop:2,background:"#fff",border:"1px solid #e2e8f0",borderRadius:9,boxShadow:"0 8px 20px rgba(0,0,0,0.1)",zIndex:20,overflow:"hidden"}}>
                    {adresseLoading && adresseSuggestions.length===0 && (
                      <div style={{padding:"10px 12px",fontSize:13,color:"#94a3b8"}}>Recherche…</div>
                    )}
                    {adresseSuggestions.map(feat=>(
                      <div key={feat.properties.id}
                        onMouseDown={()=>{setForm(f=>({...f,adresse:feat.properties.label}));setAdresseSuggestions([]);setAdresseFocused(false);}}
                        style={{padding:"10px 12px",fontSize:13,color:"#1e293b",cursor:"pointer",borderBottom:"1px solid #f1f5f9"}}
                        onMouseEnter={e=>e.currentTarget.style.background="#f8fafc"}
                        onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                        📍 {feat.properties.label}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div style={{marginBottom:14}}>
                <label style={{fontSize:12,fontWeight:700,color:"#374151",display:"block",marginBottom:5}}>SIRET</label>
                <input type="text" placeholder="Rempli automatiquement via la sélection ci-dessus, ou à saisir" value={form.siret}
                  onChange={e=>setForm(f=>({...f,siret:e.target.value.replace(/\D/g,"").slice(0,14)}))}
                  style={{width:"100%",padding:"10px 12px",border:"1.5px solid #e2e8f0",borderRadius:9,fontSize:14,outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}/>
                <div style={{fontSize:11,color:"#94a3b8",marginTop:4}}>Optionnel — 14 chiffres.</div>
              </div>
              <button onClick={()=>{const e={};if(!form.nom)e.nom="Requis";if(!form.email.includes("@"))e.email="Email invalide";if(!form.pharmacie)e.pharmacie="Requis";if(!isValidAddress(form.adresse))e.adresse="Adresse complète requise (numéro, rue, code postal)";setErrors(e);if(!Object.keys(e).length)setStep("card");}}
                style={{width:"100%",padding:12,border:"none",borderRadius:11,background:"#1a3a6e",color:"#fff",fontWeight:800,fontSize:15,cursor:"pointer",fontFamily:"inherit"}}>Continuer →</button>
            </>
          )}
          {step==="card"&&(
            <>
              <h3 style={{fontWeight:800,fontSize:18,color:"#0f172a",marginBottom:6,marginTop:0}}>Paiement</h3>
              <p style={{fontSize:13,color:"#94a3b8",marginBottom:18}}>Débitée uniquement après les 30 jours.</p>
              <div style={{background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:9,padding:"12px 14px",marginBottom:16,fontSize:13,color:"#166534",display:"flex",alignItems:"center",gap:10}}>
                <span style={{fontSize:20}}>🔒</span>
                <span>Le numéro de carte est saisi sur la page sécurisée de Stripe — il ne transite jamais par nos serveurs.</span>
              </div>
              {createError && (
                <div style={{background:"#fee2e2",border:"1px solid #fecaca",borderRadius:8,padding:"9px 12px",marginBottom:12,fontSize:13,color:"#dc2626"}}>⚠️ {createError}</div>
              )}
              <button disabled={redirecting} onClick={async ()=>{
                // Reprise (19/08/2026) : compte + pharmacie déjà créés (voir
                // App.jsx, route "finish-subscription") — juste choisir un plan
                // et finaliser le paiement avec la session déjà active. Ni
                // signUp() (le compte existe déjà, échouerait) ni
                // register-pharmacie (la pharmacie existe déjà) ne sont
                // rejoués ici.
                if (resumePharmacieId) {
                  setRedirecting(true); setCreateError("");
                  try {
                    const sb = getSupabaseClient();
                    const { data: { session } } = await sb.auth.getSession();
                    if (!session) throw new Error("Session expirée — reconnectez-vous.");
                    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
                    const ckRes = await fetch(`${supabaseUrl}/functions/v1/create-checkout-session`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.access_token}` },
                      body: JSON.stringify({
                        pharmacieId: resumePharmacieId,
                        plan: checkoutPlan,
                        billing: checkoutBilling,
                        email: resumeEmail || session.user.email,
                        appUrl: window.location.origin,
                      }),
                    });
                    const ckData = await ckRes.json();
                    if (!ckRes.ok || !ckData.url) throw new Error(ckData.error || "Erreur lors de la préparation du paiement");
                    window.location.href = ckData.url;
                  } catch(err) {
                    setCreateError(err.message || "Erreur lors de la préparation du paiement");
                    setRedirecting(false);
                  }
                  return;
                }

                const e={};
                if(!form.nom) e.nom="Requis";
                if(!form.email||!form.email.includes("@")) e.email="Email invalide";
                if(!form.password||form.password.length<8) e.password="8 caractères minimum";
                if(!form.pharmacie) e.pharmacie="Requis";
                if(!isValidAddress(form.adresse)) e.adresse="Adresse complète requise (numéro, rue, code postal)";
                if(Object.keys(e).length){setErrors(e);return;}
                setView("creating");
                try {
                  const sb = getSupabaseClient();
                  // 1. Créer le compte Supabase Auth
                  const { data: authData, error: authErr } = await sb.auth.signUp({
                    email: form.email,
                    password: form.password,
                    options: { emailRedirectTo: window.location.origin }
                  });
                  if (authErr) throw authErr;

                  // 2. Générer slug email réception
                  const slug = form.pharmacie.toLowerCase()
                    .normalize("NFD").replace(/[̀-ͯ]/g,"")
                    .replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,20);
                  const emailReception = slug + "@in.ordomail.fr";

                  // 3. Créer la pharmacie via Edge Function (service_role)
                  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
                  const session = authData?.session;
                  const token = session?.access_token || "";

                  const regRes = await fetch(`${supabaseUrl}/functions/v1/register-pharmacie`, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      ...(token ? { "Authorization": `Bearer ${token}` } : {})
                    },
                    body: JSON.stringify({
                      nom: form.nom,
                      pharmacie: form.pharmacie,
                      adresse: form.adresse || "",
                      siret: form.siret || "",
                      email: form.email,
                      plan: checkoutPlan,
                      emailReception,
                      // ⚠️ Ré-audit du 19/08/2026 : ce champ manquait ici depuis toujours
                      // (repéré par revue de code indépendante) — register-pharmacie ne lie
                      // le compte à pharmacie_users que si userId est fourni (voir son code,
                      // durci plus tôt dans la session pour vérifier ce userId côté serveur).
                      // Sans lui, AUCUN vrai signup ne créait de ligne pharmacie_users : la
                      // session restaurée après confirmation d'email ne trouvait jamais de
                      // lien, et rien de la suite (dashboard, reprise de paiement) ne pouvait
                      // fonctionner.
                      userId: authData.user?.id,
                    }),
                  });

                  const regData = await regRes.json();
                  if (!regRes.ok && regRes.status !== 409) {
                    // 409 = pharmacie déjà créée (email confirmation pending) = OK
                    throw new Error(regData.error || "Erreur création pharmacie");
                  }

                  // 4. Sans session (confirmation email requise, cas réel sur ce
                  // projet), create-checkout-session échouerait en 401 (aucun
                  // Authorization à envoyer) — mémoriser l'intention de paiement,
                  // reprise automatiquement après confirmation (voir App.jsx).
                  if (!token) {
                    setPendingCheckout({ pharmacieId: regData.pharmacie_id, plan: checkoutPlan, billing: checkoutBilling, email: form.email });
                    setCreatedEmail(form.email);
                    setCreatedEmailReception(emailReception);
                    setCreatedPlan(checkoutPlan);
                    setCreatedTrialEndsAt(regData.trial_ends_at || "");
                    setView("awaiting-confirmation");
                    return;
                  }

                  // 5. Session déjà active (confirmation désactivée, ou déjà
                  // confirmée) — rediriger vers Stripe Checkout directement.
                  setRedirecting(true);
                  const ckRes = await fetch(`${supabaseUrl}/functions/v1/create-checkout-session`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                    body: JSON.stringify({
                      pharmacieId: regData.pharmacie_id,
                      plan: checkoutPlan,
                      billing: checkoutBilling,
                      email: form.email,
                      appUrl: window.location.origin,
                    }),
                  });
                  const ckData = await ckRes.json();
                  if (!ckRes.ok || !ckData.url) throw new Error(ckData.error || "Erreur lors de la préparation du paiement");

                  setCreatedEmail(form.email);
                  setCreatedEmailReception(emailReception);
                  setCreatedPlan(checkoutPlan);
                  setCreatedTrialEndsAt(regData.trial_ends_at || "");
                  window.location.href = ckData.url; // quitte l'app vers Stripe Checkout
                } catch(err) {
                  setCreateError(err.message || "Erreur lors de la création");
                  setRedirecting(false);
                  setView("checkout");
                }
              }} style={{width:"100%",padding:12,border:"none",borderRadius:11,background:redirecting?"#94a3b8":"#1a3a6e",color:"#fff",fontWeight:800,fontSize:15,cursor:redirecting?"default":"pointer",fontFamily:"inherit"}}>
                {redirecting ? "Redirection vers Stripe…" : "Continuer vers le paiement sécurisé →"}
              </button>
            </>
          )}
        </div>
        <div style={{background:"#fff",borderRadius:16,padding:20,boxShadow:"0 2px 8px rgba(0,0,0,0.06)",alignSelf:"start"}}>
          <div style={{fontSize:11,fontWeight:700,color:"#94a3b8",letterSpacing:1,marginBottom:12}}>RÉCAPITULATIF</div>
          <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:14,paddingBottom:14,borderBottom:"1px solid #f1f5f9"}}>
            <div style={{width:36,height:36,borderRadius:9,background:`${plan.color}18`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>{plan.icon}</div>
            <div><div style={{fontWeight:800,fontSize:14,color:"#0f172a"}}>OrdoMail {plan.label}</div><div style={{fontSize:12,color:"#94a3b8"}}>{checkoutBilling==="annual"?"Annuel (1 mois offert)":"Mensuel"}</div></div>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><span style={{fontSize:12,color:"#94a3b8"}}>Aujourd'hui</span><span style={{fontSize:12,fontWeight:700,color:"#16a34a"}}>0 € — Gratuit</span></div>
          <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:12,color:"#94a3b8"}}>Après 30 jours</span><span style={{fontSize:12,fontWeight:700,color:"#0f172a"}}>{price} €/mois</span></div>
          {checkoutBilling==="annual" && (
            <div style={{display:"flex",justifyContent:"space-between",marginTop:6}}><span style={{fontSize:12,color:"#94a3b8"}}>Soit facturé</span><span style={{fontSize:12,fontWeight:700,color:"#0f172a"}}>{price*12} €/an</span></div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",background:"#f8fafc",fontFamily:"'Inter',system-ui,sans-serif"}}>
      <PersistentNav onBack={onBack} currentPage="pricing"/>
      <div style={{maxWidth:980,margin:"0 auto",padding:"40px 16px"}}>
        <div style={{textAlign:"center",marginBottom:36}}>
          <h1 style={{fontSize:"clamp(24px,6vw,38px)",fontWeight:900,color:"#0f172a",marginBottom:12}}>{resumePharmacieId ? "Finalisez votre abonnement" : "Choisissez votre plan"}</h1>
          <p style={{color:"#64748b",fontSize:16,marginBottom:20}}>{resumePharmacieId ? "Votre compte est confirmé — choisissez votre plan pour activer votre essai gratuit de 30 jours." : "30 jours gratuits · Sans carte bancaire"}</p>
          <div style={{display:"inline-flex",background:"#fff",borderRadius:10,padding:4,gap:4,border:"1px solid #e2e8f0"}}>
            {[["monthly","Mensuel"],["annual","Annuel (1 mois offert)"]].map(([k,l])=>(
              <button key={k} onClick={()=>setBillingTab(k)} style={{padding:"8px 18px",border:"none",borderRadius:8,cursor:"pointer",fontFamily:"inherit",fontSize:13,fontWeight:billingTab===k?700:500,background:billingTab===k?"#1a3a6e":"transparent",color:billingTab===k?"#fff":"#94a3b8",transition:"all 0.15s"}}>{l}</button>
            ))}
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,280px),1fr))",gap:14,marginBottom:32}}>
          {PLAN_ORDER.map(pid=>{
            const p=PLAN_LIMITS[pid]; const pr=billingTab==="annual"?p.priceAnnual:p.price; const isPopular=pid==="standard";
            return (
              <div key={pid} style={{background:"#fff",borderRadius:16,padding:"24px 20px",border:isPopular?`2px solid ${p.color}`:"2px solid #e2e8f0",position:"relative"}}>
                {isPopular&&<div style={{position:"absolute",top:-12,left:"50%",transform:"translateX(-50%)",background:p.color,color:"#fff",fontSize:10,fontWeight:800,padding:"3px 12px",borderRadius:20}}>LE PLUS CHOISI</div>}
                <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:12}}><span style={{fontSize:20}}>{p.icon}</span><span style={{fontWeight:800,fontSize:17,color:"#0f172a"}}>{p.label}</span></div>
                <div style={{marginBottom:14}}>
                  <span style={{fontSize:34,fontWeight:900,color:p.color}}>{pr}</span><span style={{fontSize:13,color:"#94a3b8"}}> €/mois</span>
                  {billingTab==="annual" && <div style={{fontSize:11,color:"#94a3b8",marginTop:2}}>soit {pr*12} € facturés / an</div>}
                </div>
                <button onClick={()=>{setCheckoutPlan(pid);setCheckoutBilling(billingTab);setStep(resumePharmacieId?"card":"details");setView("checkout");}}
                  style={{width:"100%",padding:"10px",border:`1.5px solid ${p.color}`,borderRadius:10,background:isPopular?p.color:"transparent",color:isPopular?"#fff":p.color,fontWeight:700,fontSize:14,cursor:"pointer",fontFamily:"inherit",marginBottom:12}}>
                  Commencer gratuitement</button>
                <div style={{fontSize:12,color:"#475569"}}>{p.maxPostes===999?"Postes illimités":`${p.maxPostes} postes`} · {p.maxOrdos===99999?"Volume illimité":`${p.maxOrdos.toLocaleString("fr-FR")} ordo/mois`}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export { BillingModule };
export default BillingModule;
