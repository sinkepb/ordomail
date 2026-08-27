import React, { useState, useEffect, Suspense } from "react";
import {
  fetchPharmaciePublic,
  isDemoMode, registerDB, getSupabaseClient,
  getCurrentSession,
  getPendingCheckout, clearPendingCheckout,
} from "./supabase.js";
import { ErrorBoundary } from "./components/ErrorBoundary.jsx";
import { readStoredAdminToken } from "./lib/adminSession.js";
import { lazyWithReload as lazy } from "./lib/lazyWithReload.js";
// Pages chargées à la demande (28/07/2026) — un patient qui scanne un QR code
// ne doit pas télécharger le dashboard vendeur, le backoffice admin et Stripe
// Checkout rien que pour déposer une ordonnance. Chaque route devient son
// propre chunk ; <Suspense> plus bas affiche le même spinner que le chargement
// de session pendant le téléchargement (quasi instantané une fois en cache).
// lazyWithReload (pas React.lazy direct, 25/08/2026) : recharge automatiquement
// la page si le chunk d'une route pas encore visitée a disparu du serveur après
// un déploiement — voir lib/lazyWithReload.js pour le détail du problème.
const LandingPage      = lazy(() => import("./pages/LandingPage.jsx").then(m => ({ default: m.LandingPage })));
const AppLogin         = lazy(() => import("./pages/LoginPage.jsx").then(m => ({ default: m.AppLogin })));
const ResetPasswordPage = lazy(() => import("./pages/LoginPage.jsx").then(m => ({ default: m.ResetPasswordPage })));
const PatientPage      = lazy(() => import("./pages/PatientPage.jsx").then(m => ({ default: m.PatientPage })));
const LegalPage        = lazy(() => import("./pages/LegalPage.jsx").then(m => ({ default: m.LegalPage })));
// Seul PharmacieDashboard est utilisé ici — les autres exports de Dashboard.jsx
// (QRNFCTab, ParametresTab…) sont consommés en interne par PharmacieDashboard
// lui-même, pas besoin de les réimporter ici (même remarque que pour AdminPage.jsx).
const PharmacieDashboard = lazy(() => import("./pages/Dashboard.jsx").then(m => ({ default: m.PharmacieDashboard })));
// Seuls BillingModule et BackofficeAdmin sont utilisés ici — les autres exports de
// AdminPage.jsx (AdminDashboardLive, ClientDetail, ContratEditor…) sont consommés en
// interne par BackofficeAdmin lui-même, pas besoin de les réimporter ici. Les deux
// pointent vers le même module — un seul chunk, dédupliqué par le cache d'import.
const BillingModule    = lazy(() => import("./pages/AdminPage.jsx").then(m => ({ default: m.BillingModule })));
const BackofficeAdmin  = lazy(() => import("./pages/AdminPage.jsx").then(m => ({ default: m.BackofficeAdmin })));

// ═══════════════════════════════════════════════════════════════════════════
// ORDOMAIL — App.jsx (Routeur principal)
// v6.0 · 12/07/2026 14:51
// Architecture modulaire : pages/ + components/ + lib/
// ═══════════════════════════════════════════════════════════════════════════

// ── Diagnostic démarrage ─────────────────────────────────────────────────────
console.log("=== ORDOMAIL DÉMARRAGE ===");
console.log("APP_VERSION:", "v6.0 · 12/07/2026 18:40");
console.log("VITE_SUPABASE_URL:", import.meta.env.VITE_SUPABASE_URL || "❌ UNDEFINED");
console.log("VITE_DEMO_MODE:", import.meta.env.VITE_DEMO_MODE || "❌ UNDEFINED");
console.log("isDemoMode:", typeof isDemoMode !== "undefined" ? isDemoMode : "❌ UNDEFINED");

// ── Supabase ─────────────────────────────────────────────────────────────────

// ── Lib ──────────────────────────────────────────────────────────────────────

// ── Pages ────────────────────────────────────────────────────────────────────

// ── Components ───────────────────────────────────────────────────────────────

// ── Données démo (mock) ───────────────────────────────────────────────────────

function makeOrdos(days=3, perDay=15) {
  const items = [];
  const meds = [["Doliprane 1000mg","Amoxicilline 500mg","Ibuprofène 400mg"],["Metformine 850mg","Paracétamol 500mg"],["Levothyrox 50µg","Oméprazole 20mg","Vitamine D3"],["Aspirine 100mg","Lisinopril 5mg"]];
  const names = [["MARTIN","Pierre","1 75 04 75 118 042 18","email"],["DUBOIS","Sophie","2 82 11 75 063 014 22","qrcode"],["LEFEBVRE","Jean","1 60 03 75 042 118 08","email"],["ROUX","Anne","2 91 03 69 215 088 45","qrcode"],["THOMAS","Isabelle","2 77 06 13 042 118 31","email"],["BERNARD","Paul","1 55 08 31 042 118 09","email"],["MOREAU","Claire","2 68 05 75 042 118 44","qrcode"],["RICHARD","Lucas","1 88 12 93 042 118 77","email"],["PETIT","Emma","2 95 03 75 042 118 55","email"],["SIMON","Marc","1 72 07 69 042 118 33","qrcode"],["LEROY","Julie","2 85 09 75 042 118 66","email"],["DURAND","Pierre","1 63 01 13 042 118 22","email"],["GARCIA","Marie","2 78 04 75 042 118 88","qrcode"],["MARTINEZ","Thomas","1 91 06 75 042 118 11","email"],["FOURNIER","Alice","2 87 11 75 042 118 99","email"]];
  const docs = ["Dr Bernard","Dr Leclerc","Dr Moreau","Dr Petit","Dr Gautier","Dr Lambert"];
  for (let d=0;d<days;d++) {
    const date = new Date(); date.setDate(date.getDate()-d);
    for (let i=0;i<(d===0?perDay:10);i++) {
      const n = names[i%names.length];
      const mins = Math.floor(Math.random()*120)+1;
      const recv = new Date(date); recv.setHours(8+Math.floor(i/2),mins%60,0,0);
      items.push({
        id:`ordo-${d}-${i}`, fromName:`${n[0]} ${n[1]}`, source:n[3],
        status: d===0?"nouveau":"imprime", receivedAt:recv.toISOString(),
        attachments:[], extracted:{ nom:`${n[0]} ${n[1]}`, carteVitale:n[2],
          medecin:docs[i%docs.length], date:date.toLocaleDateString("fr-FR"),
          medicaments:meds[i%meds.length] }
      });
    }
  }
  return items;
}

const DB = {
  pharmacies: [
    {
      id: "ph1", nom: "Pharmacie Centrale", couleur: "#1a3a6e",
      email: "contact@pharmaciecentrale.fr", password: "demo123",
      adresse: "12 rue de la Paix, 75001 Paris",
      emailReception: "ph1@in.ordomail.fr",
      // ⚠️ Requis pour la connexion vendeur en démo (LoginPage.jsx cherche
      // db.pharmacies.find(p => p.codeVendeur === code)) — absent jusqu'au
      // 27/07/2026, ce qui cassait silencieusement ce parcours malgré l'indice
      // "123456" affiché dans l'UI elle-même. Détecté en écrivant l'E2E.
      codeVendeur: "123456",
      plan: "starter", createdAt: "2025-01-15T10:00:00Z",
      postes: [
        { id:"p1", nom:"Poste Accueil",     actif:true,  pin:"1234" },
        { id:"p2", nom:"Poste Caisse",      actif:true,  pin:"5678" },
        { id:"p3", nom:"Poste Préparation", actif:false, pin:"9012" },
      ],
      ordonnances: makeOrdos(3,15),
    },
    {
      id: "ph2", nom: "Pharmacie du Soleil", couleur: "#15623a",
      email: "pharma@soleil.fr", password: "demo123",
      adresse: "45 avenue du Soleil, 69001 Lyon",
      emailReception: "ph2@in.ordomail.fr",
      codeVendeur: "654321",
      plan: "standard", createdAt: "2025-02-01T10:00:00Z",
      postes: [
        { id:"p1", nom:"Poste 1", actif:true, pin:"1111" },
        { id:"p2", nom:"Poste 2", actif:true, pin:"2222" },
      ],
      ordonnances: makeOrdos(2,10),
    },
  ],
  admin: { email: "admin@ordomail.fr", password: "admin2025" },
};

// Exposer DB au module supabase.js (pont inter-modules)
if (typeof window !== 'undefined') window._ordomailDB = DB;
registerDB(DB);

// Messages lisibles pour les erreurs renvoyées par Supabase Auth dans le hash
// d'URL des liens email (confirmation, recovery…). error_code n'est pas
// toujours présent selon la version de GoTrue ; on retombe sur
// error_description (brute, mais mieux que rien) si absent.
const AUTH_ERROR_MESSAGES = {
  otp_expired: "Le lien reçu par email a expiré ou a déjà été utilisé. Redemandez un nouvel email.",
  access_denied: "Ce lien n'est plus valide. Redemandez un nouvel email.",
};
function friendlyAuthError(code, description) {
  if (code && AUTH_ERROR_MESSAGES[code]) return AUTH_ERROR_MESSAGES[code];
  if (description) return decodeURIComponent(description.replace(/\+/g, " "));
  return "Le lien reçu par email est invalide.";
}

// ── App principale (routeur) ──────────────────────────────────────────────────

function AppInner() {
  // Capture erreurs globales pour debug
  useEffect(() => {
    const handler = (e) => {
      console.error("[GLOBAL ERROR]", e.message, e.filename + ":" + e.lineno + ":" + e.colno);
      console.error("[STACK]", e.error?.stack);
    };
    window.addEventListener("error", handler);
    return () => window.removeEventListener("error", handler);
  }, []);

  const hashParams  = new URLSearchParams(window.location.hash.replace("#",""));
  const urlParams   = new URLSearchParams(window.location.search);
  const hashType    = hashParams.get("type");
  const hashToken   = hashParams.get("access_token");
  const isRecovery  = hashType === "recovery" && !!hashToken;
  // Supabase Auth redirige les liens email (confirmation, recovery…) invalides/expirés
  // avec l'erreur dans le hash (#error=access_denied&error_code=otp_expired&...) plutôt
  // que dans le corps d'une réponse — rien ne lisait ce paramètre jusqu'ici, la page
  // atterrissait silencieusement sur l'accueil sans que l'utilisateur comprenne pourquoi
  // son lien "ne marche pas".
  const hashErrorCode = hashParams.get("error_code");
  const hashErrorDescription = hashParams.get("error_description");
  const patientParam = urlParams.get("patient");
  const qrTokenParam = urlParams.get("t"); // jeton public par pharmacie porté par le QR code (phase 1 sécurité)
  // QR code pré-imprimé (18/08/2026) : porte uniquement un token opaque, résolu
  // côté serveur (resolve-qr-code) vers {pharmacie_id, qr_token} — le goodie est
  // imprimé avant qu'aucune pharmacie n'existe, donc son URL ne peut pas encoder
  // pharmacie_id comme le fait l'ancien lien ?patient=&t=.
  const qrCodeParam = urlParams.get("qr");
  // Retour depuis Stripe Checkout (succès ou annulation) — BillingModule lit ce même
  // paramètre pour afficher l'écran adapté (voir son useEffect de montage).
  const checkoutReturn = urlParams.get("checkout");
  // En mode démo, chercher dans le mock ; en prod, charger depuis Supabase async
  const demoInitialPharmacie = patientParam ? DB.pharmacies.find(p => p.id === patientParam) : null;
  // @fix 27/08/2026 — un admin qui rafraîchit la page backoffice repartait de
  // "landing" (aucune restauration de route ici), et pouvait même être
  // détourné vers "finish-subscription" par l'effet de restauration de
  // session pharmacie plus bas (qui ne vérifiait pas l'existence d'une
  // session admin avant de s'exécuter — voir son garde-fou juste en dessous).
  const initialRoute = isRecovery ? "reset-password" : checkoutReturn ? "checkout" : ((patientParam || qrCodeParam) ? "patient" : (readStoredAdminToken() ? "backoffice" : "landing"));
  const [route, setRoute] = useState(initialRoute);
  const [legalDoc, setLegalDoc] = useState(null);
  const [patientPharmacieQR, setPatientPharmacieQR] = useState(demoInitialPharmacie||null);
  const [sessionLoading, setSessionLoading] = useState(!isDemoMode && !isRecovery && !patientParam && !qrCodeParam);
  const [authError, setAuthError] = useState(() => hashErrorCode ? friendlyAuthError(hashErrorCode, hashErrorDescription) : null);
  // Compte confirmé mais jamais passé par Stripe Checkout (ex. confirmation
  // d'email cliquée sur un autre appareil que celui de l'inscription, donc pas
  // d'intention de paiement en localStorage sur CET appareil) — voir l'effet
  // "Restaurer la session" plus bas et route "finish-subscription".
  const [resumeSubscription, setResumeSubscription] = useState(null);

  // Nettoyer le hash d'erreur de l'URL une fois lu, pour ne pas le ré-afficher à
  // chaque rechargement/navigation de cette même page.
  useEffect(() => {
    if (hashErrorCode) {
      window.history.replaceState({}, "", window.location.pathname + window.location.search);
    }
  }, []);

  // ── Restaurer la session Supabase après refresh ───────────────────────────────
  // Sert aussi de point de reprise après confirmation d'email (19/08/2026) :
  // ce projet exige la confirmation d'email, donc signUp() (BillingModule.jsx)
  // ne renvoie aucune session tant que le lien reçu par email n'est pas cliqué —
  // create-checkout-session (qui exige une vraie session) ne peut donc pas être
  // appelé dans la foulée de l'inscription. Le clic sur le lien de confirmation
  // ramène ici avec une session tout juste établie (detectSessionInUrl, déjà
  // actif côté client Supabase) : c'est le moment de reprendre le paiement.
  useEffect(() => {
    // checkoutReturn exclu (19/08/2026, repéré par revue de code indépendante) :
    // un retour ?checkout=success juste après un vrai paiement Stripe est déjà
    // géré par le useEffect de montage de BillingModule (affiche "success").
    // Sans cette exclusion, cet effet-ci pouvait renvoyer le même utilisateur
    // vers "finish-subscription" si le webhook Stripe (asynchrone) n'avait pas
    // encore eu le temps d'écrire stripe_subscription_id — lui redemandant de
    // payer alors qu'il vient tout juste de le faire.
    //
    // readStoredAdminToken() exclu (27/08/2026) : l'admin backoffice n'a pas
    // de session Supabase Auth (jeton JWT séparé, voir lib/adminSession.js) —
    // mais si le même navigateur a AUSSI une session Supabase Auth active
    // (ex. un compte pharmacie de test utilisé dans le même onglet), cet
    // effet s'exécutait quand même et pouvait détourner un admin en train de
    // rafraîchir le backoffice vers "finish-subscription".
    if (isDemoMode || isRecovery || patientParam || qrCodeParam || checkoutReturn || readStoredAdminToken()) { setSessionLoading(false); return; }
    getCurrentSession().then(async session => {
      if (session) {
        try {
          const sb = getSupabaseClient();
          const { data: link } = await sb
            .from("pharmacie_users")
            .select("pharmacie_id, role")
            .eq("id", session.user.id)
            .maybeSingle();
          if (link) {
            const { data: ph } = await sb
              .from("pharmacies")
              .select("stripe_subscription_id")
              .eq("id", link.pharmacie_id)
              .maybeSingle();

            if (ph && !ph.stripe_subscription_id) {
              const pending = getPendingCheckout();
              if (pending && pending.pharmacieId === link.pharmacie_id) {
                // Même appareil que l'inscription : reprise automatique, sans
                // action de l'utilisateur au-delà du clic sur le lien email.
                clearPendingCheckout();
                try {
                  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
                  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
                  const res = await fetch(`${supabaseUrl}/functions/v1/create-checkout-session`, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      "apikey": supabaseKey,
                      "Authorization": `Bearer ${session.access_token}`,
                    },
                    body: JSON.stringify({
                      pharmacieId: pending.pharmacieId,
                      plan: pending.plan,
                      billing: pending.billing,
                      email: pending.email || session.user.email,
                      appUrl: window.location.origin,
                    }),
                  });
                  const data = await res.json();
                  if (res.ok && data.url) { window.location.href = data.url; return; }
                  console.warn("[Reprise checkout]", data.error || `erreur ${res.status}`);
                } catch (e) {
                  console.warn("[Reprise checkout]", e.message);
                }
                // Échec de la reprise auto (réseau, tarif Stripe manquant…) — se
                // rabat sur l'écran de reprise manuelle plutôt que de laisser
                // l'utilisateur bloqué sans issue.
              }
              // Autre appareil que l'inscription (pas d'intention en
              // localStorage ICI), ou reprise automatique en échec : filet de
              // sécurité — ne JAMAIS laisser un compte confirmé sans abonnement
              // Stripe atterrir directement dans le dashboard (déjà rencontré
              // une fois avec l'ancien RegisterForm, corrigé plus tôt).
              setResumeSubscription({ pharmacieId: link.pharmacie_id, email: session.user.email });
              setRoute("finish-subscription");
              setSessionLoading(false);
              return;
            }

            window.__ordomailSession = {
              pharmacieId: link.pharmacie_id,
              userRole: link.role,
              userId: session.user.id,
            };
            setRoute("dashboard");
          }
        } catch(e) {
          console.warn("[Session restore]", e.message);
        }
      }
      setSessionLoading(false);
    }).catch(() => setSessionLoading(false));
  }, []);

  // Charger la pharmacie depuis Supabase si mode prod et patientParam présent
  useEffect(() => {
    if (!patientParam) return;
    if (isDemoMode) {
      const ph = DB.pharmacies.find(p => p.id === patientParam);
      if (!ph) setRoute("landing");
      else setPatientPharmacieQR(ph);
      return;
    }
    // Mode prod : charger depuis Supabase — lecture publique restreinte (pas de PIN/postes,
    // voir fetchPharmaciePublic) puisque cette page est ouverte par un patient non authentifié.
    fetchPharmaciePublic(patientParam).then(ph => {
      if (!ph) { setRoute("landing"); return; }
      // qr_token vient de l'URL (imprimé sur le QR code), pas de la base — submit-ordonnance
      // le revérifiera côté serveur contre la valeur stockée pour cette pharmacie.
      setPatientPharmacieQR({ ...ph, qr_token: qrTokenParam });
    }).catch(() => setRoute("landing"));
  }, []);

  // Résoudre un QR code pré-imprimé (?qr=<token>, 18/08/2026) : le goodie est
  // imprimé avant qu'aucune pharmacie n'existe, donc contrairement à ?patient=&t=
  // ci-dessus, son URL ne porte qu'un token opaque — resolve-qr-code le traduit
  // en {pharmacie_id, qr_token}, puis tout redevient identique au parcours
  // ?patient=&t= déjà en place (mêmes fetchPharmaciePublic/setPatientPharmacieQR).
  useEffect(() => {
    if (!qrCodeParam || patientParam) return;
    if (isDemoMode) { setRoute("landing"); return; }
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    fetch(`${supabaseUrl}/functions/v1/resolve-qr-code?token=${encodeURIComponent(qrCodeParam)}`, {
      headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
    })
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(({ pharmacie_id, qr_token }) => fetchPharmaciePublic(pharmacie_id).then(ph => {
        if (!ph) { setRoute("landing"); return; }
        setPatientPharmacieQR({ ...ph, qr_token });
      }))
      .catch(() => setRoute("landing"));
  }, []);
  const [checkoutPlan, setCheckoutPlan] = useState("standard");
  const [checkoutBilling, setCheckoutBilling] = useState("monthly");

  function goToCheckout(planId, billing) { setCheckoutPlan(planId||"standard"); setCheckoutBilling(billing||"monthly"); setRoute("checkout"); }

  if (sessionLoading) return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#f8fafc"}}>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:42,marginBottom:12,animation:"spin 1s linear infinite"}}>💊</div>
        <div style={{fontWeight:700,color:"#1a3a6e",fontSize:14}}>Chargement OrdoMail…</div>
      </div>
    </div>
  );

  return (
    <>
    {authError && (
      <div style={{position:"fixed",top:0,left:0,right:0,zIndex:9999,background:"#450a0a",color:"#fca5a5",padding:"12px 20px",display:"flex",justifyContent:"center",alignItems:"center",gap:14,fontSize:13,fontFamily:"'Inter',system-ui,sans-serif",boxShadow:"0 2px 8px rgba(0,0,0,0.2)"}}>
        <span>⚠️ {authError}</span>
        <button onClick={()=>setAuthError(null)} style={{background:"none",border:"1px solid #7f1d1d",borderRadius:6,color:"#fca5a5",padding:"2px 10px",cursor:"pointer",fontFamily:"inherit",fontSize:12}}>✕</button>
      </div>
    )}
    <Suspense fallback={
      <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#f8fafc"}}>
        <div style={{textAlign:"center"}}>
          <div style={{fontSize:42,marginBottom:12,animation:"spin 1s linear infinite"}}>💊</div>
          <div style={{fontWeight:700,color:"#1a3a6e",fontSize:14}}>Chargement OrdoMail…</div>
        </div>
      </div>
    }>
      {route==="reset-password"&&(
        <ResetPasswordPage onDone={()=>{window.history.replaceState({},"",window.location.pathname);setRoute("landing");}}/>
      )}
      {route==="patient"&&patientPharmacieQR&&(
        <PatientPage pharmacie={patientPharmacieQR} onBack={()=>{ window.history.replaceState({},"",window.location.pathname); setRoute("landing"); setPatientPharmacieQR(null); }}/>
      )}
      {route==="landing"&&(
        <LandingPage onGoToPricing={()=>setRoute("pricing")} onGoToApp={()=>setRoute("dashboard")} onGoToCheckout={goToCheckout} onGoToAdmin={()=>setRoute("backoffice")} onGoToLegal={(doc)=>{setLegalDoc(doc); setRoute("legal");}}/>
      )}
      {route==="legal"&&<LegalPage doc={legalDoc} onBack={()=>setRoute("landing")}/>}
      {route==="pricing"&&<BillingModule initialView="pricing" onBack={()=>setRoute("landing")}/>}
      {route==="checkout"&&<BillingModule initialView="checkout" planId={checkoutPlan} billing={checkoutBilling} onBack={()=>setRoute("landing")}/>}
      {route==="finish-subscription"&&resumeSubscription&&(
        <BillingModule initialView="pricing" resumePharmacieId={resumeSubscription.pharmacieId} resumeEmail={resumeSubscription.email} onBack={()=>setRoute("landing")}/>
      )}
      {route==="backoffice"&&<BackofficeAdmin onBack={()=>setRoute("landing")}/>}
      {(route==="dashboard"||route==="admin")&&<AppLogin
          onBack={()=>setRoute("landing")}
          onLogout={()=>setRoute("landing")}
          onGoToPricing={()=>setRoute("pricing")}
          onNeedsSubscription={(pharmacieId)=>{ setResumeSubscription({pharmacieId}); setRoute("finish-subscription"); }}
          DashboardComponent={PharmacieDashboard}
          PatientComponent={PatientPage}
        />}
    </Suspense>
    </>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <AppInner />
    </ErrorBoundary>
  );
}

export default App;
