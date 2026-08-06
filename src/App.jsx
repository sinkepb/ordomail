import React, { useState, useEffect } from "react";
import {
  fetchPharmaciePublic,
  isDemoMode, registerDB, getSupabaseClient,
  getCurrentSession,
} from "./supabase.js";
import { reportError } from "./lib/monitoring.js";
import { LandingPage } from "./pages/LandingPage.jsx";
import { AppLogin, ResetPasswordPage } from "./pages/LoginPage.jsx";
import { PatientPage } from "./pages/PatientPage.jsx";
import { LegalPage } from "./pages/LegalPage.jsx";
// Seul PharmacieDashboard est utilisé ici — les autres exports de Dashboard.jsx
// (QRNFCTab, ParametresTab…) sont consommés en interne par PharmacieDashboard
// lui-même, pas besoin de les réimporter ici (même remarque que pour AdminPage.jsx).
import { PharmacieDashboard } from "./pages/Dashboard.jsx";
// Seuls BillingModule et BackofficeAdmin sont utilisés ici — les autres exports de
// AdminPage.jsx (AdminDashboardLive, ClientDetail, ContratEditor…) sont consommés en
// interne par BackofficeAdmin lui-même, pas besoin de les réimporter ici.
import { BillingModule, BackofficeAdmin } from "./pages/AdminPage.jsx";

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

// ── Error Boundary — affiche l'erreur au lieu d'une page blanche ─────────────
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error("[ErrorBoundary]", error, info);
    reportError(error, { componentStack: info?.componentStack }); // no-op sans VITE_SENTRY_DSN
    this.setState({ info });
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: "100vh", background: "#0f172a",
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          padding: 32, fontFamily: "monospace"
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>💥</div>
          <div style={{ color: "#f87171", fontWeight: 900, fontSize: 20, marginBottom: 12 }}>
            Erreur OrdoMail
          </div>
          <div style={{
            background: "#1e293b", border: "1px solid #f87171",
            borderRadius: 12, padding: 20, maxWidth: 700, width: "100%",
            marginBottom: 16
          }}>
            <div style={{ color: "#fca5a5", fontSize: 14, marginBottom: 8, fontWeight: 700 }}>
              {this.state.error?.name}: {this.state.error?.message}
            </div>
            <pre style={{ color: "#94a3b8", fontSize: 11, whiteSpace: "pre-wrap", overflow: "auto", maxHeight: 300 }}>
              {this.state.error?.stack}
            </pre>
          </div>
          {this.state.info && (
            <div style={{
              background: "#1e293b", border: "1px solid #334155",
              borderRadius: 12, padding: 20, maxWidth: 700, width: "100%",
              marginBottom: 16
            }}>
              <div style={{ color: "#64748b", fontSize: 12, marginBottom: 8 }}>Component Stack:</div>
              <pre style={{ color: "#94a3b8", fontSize: 11, whiteSpace: "pre-wrap", overflow: "auto", maxHeight: 200 }}>
                {this.state.info.componentStack}
              </pre>
            </div>
          )}
          <button
            onClick={() => window.location.reload()}
            style={{
              background: "#3b82f6", color: "#fff", border: "none",
              borderRadius: 8, padding: "10px 24px", fontSize: 14,
              fontWeight: 700, cursor: "pointer", fontFamily: "monospace"
            }}>
            🔄 Recharger
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

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
  const patientParam = urlParams.get("patient");
  const qrTokenParam = urlParams.get("t"); // jeton public par pharmacie porté par le QR code (phase 1 sécurité)
  // Retour depuis Stripe Checkout (succès ou annulation) — BillingModule lit ce même
  // paramètre pour afficher l'écran adapté (voir son useEffect de montage).
  const checkoutReturn = urlParams.get("checkout");
  // En mode démo, chercher dans le mock ; en prod, charger depuis Supabase async
  const demoInitialPharmacie = patientParam ? DB.pharmacies.find(p => p.id === patientParam) : null;
  const initialRoute = isRecovery ? "reset-password" : checkoutReturn ? "checkout" : (patientParam ? "patient" : "landing");
  const [route, setRoute] = useState(initialRoute);
  const [legalDoc, setLegalDoc] = useState(null);
  const [patientPharmacieQR, setPatientPharmacieQR] = useState(demoInitialPharmacie||null);
  const [sessionLoading, setSessionLoading] = useState(!isDemoMode && !isRecovery && !patientParam);

  // ── Restaurer la session Supabase après refresh ───────────────────────────────
  useEffect(() => {
    if (isDemoMode || isRecovery || patientParam) { setSessionLoading(false); return; }
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
  const [checkoutPlan, setCheckoutPlan] = useState("standard");
  const [checkoutBilling, setCheckoutBilling] = useState("monthly");

  function goToCheckout(planId, billing) { setCheckoutPlan(planId||"standard"); setCheckoutBilling(billing||"monthly"); setRoute("checkout"); }

  return (
    <>
      {route==="reset-password"&&(
        <ResetPasswordPage onDone={()=>{window.history.replaceState({},"",window.location.pathname);setRoute("landing");}}/>
      )}
      {route==="patient"&&patientPharmacieQR&&(
        <PatientPage pharmacie={patientPharmacieQR} onBack={()=>{ window.history.replaceState({},"",window.location.pathname); setRoute("landing"); setPatientPharmacieQR(null); }}/>
      )}
      {sessionLoading && (
        <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#f8fafc"}}>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:42,marginBottom:12,animation:"spin 1s linear infinite"}}>💊</div>
            <div style={{fontWeight:700,color:"#1a3a6e",fontSize:14}}>Chargement OrdoMail…</div>
          </div>
        </div>
      )}
      {!sessionLoading && route==="landing"&&(
        <LandingPage onGoToPricing={()=>setRoute("pricing")} onGoToApp={()=>setRoute("dashboard")} onGoToCheckout={goToCheckout} onGoToAdmin={()=>setRoute("backoffice")} onGoToLegal={(doc)=>{setLegalDoc(doc); setRoute("legal");}}/>
      )}
      {route==="legal"&&<LegalPage doc={legalDoc} onBack={()=>setRoute("landing")}/>}
      {route==="pricing"&&<BillingModule initialView="pricing" onBack={()=>setRoute("landing")}/>}
      {route==="checkout"&&<BillingModule initialView="checkout" planId={checkoutPlan} billing={checkoutBilling} onBack={()=>setRoute("landing")}/>}
      {route==="backoffice"&&<BackofficeAdmin onBack={()=>setRoute("landing")}/>}
      {(route==="dashboard"||route==="admin")&&<AppLogin
          onBack={()=>setRoute("landing")}
          onLogout={()=>setRoute("landing")}
          onGoToPricing={()=>setRoute("pricing")}
          DashboardComponent={PharmacieDashboard}
          PatientComponent={PatientPage}
        />}
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
