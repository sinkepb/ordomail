import React, { useState, useEffect, useRef } from "react";
import {
  authSignInEmail, authSignInPIN, authSignInPSC, authSignOut,
  fetchPharmacie, fetchPharmaciePublic, savePharmacie, savePostes,
  fetchOrdonnances, updateOrdoStatus, updateOrdoExtracted, uploadOrdoFile,
  subscribeToPharmacy, notifyPharmacy,
  addAuditLog, getAuditLogs, exportLogsCSV,
  fetchAbonnement, fetchFactures, changePlan,
  isDemoMode, registerDB, getSupabaseClient, getSignedUrl,
  getCurrentSession, onAuthStateChange,
  snapshotMetriquesJournalieres, fetchHistoriqueMetriques,
} from "./supabase.js";
import { PLAN_LIMITS, PLAN_ORDER, getNextPlan, getPrevPlan, computeImpact, canAddPoste } from "./lib/plans.js";
import { reportError } from "./lib/monitoring.js";
import { timeAgo, getOrdoAccent, isSameDay, toDateKey, formatDateLabel } from "./lib/utils.js";
import { getTesseractWorker, extractFromFile, prewarmTesseract } from "./lib/ocr.js";
import { generateInvoiceHTML, openInvoicePDF, generateOrdoPDF } from "./lib/print.jsx";
import { LandingPage, PersistentNav } from "./pages/LandingPage.jsx";
import { AppLogin, LoginPage, LoginTabContent, BoutonProSanteConnect, ResetPasswordPage } from "./pages/LoginPage.jsx";
import { PatientPage, PatientStories } from "./pages/PatientPage.jsx";
import { PharmacieDashboard, QRNFCTab, BottomNav, OffresSection, AbonnementSection, CompteSection, ParametresTab } from "./pages/Dashboard.jsx";
// Seuls BillingModule et BackofficeAdmin sont utilisés ici — les autres exports de
// AdminPage.jsx (AdminDashboardLive, ClientDetail, ContratEditor…) sont consommés en
// interne par BackofficeAdmin lui-même, pas besoin de les réimporter ici.
import { BillingModule, BackofficeAdmin } from "./pages/AdminPage.jsx";
import { OrdoCard, OrdoRow, AttachmentThumb } from "./components/OrdoCard.jsx";
import { PrintConfirmModal, ViewerModal } from "./components/PrintModal.jsx";
import { UpgradeModal, PlanSwitcher, PlanSwitcherModal } from "./components/UpgradeModal.jsx";
import { CVBadge, Btn, Input } from "./components/ui.jsx";

// ═══════════════════════════════════════════════════════════════════════════
// ORDOMAIL — App.jsx (Routeur principal)
// v6.0 · 12/07/2026 14:51
// Architecture modulaire : pages/ + components/ + lib/
// ═══════════════════════════════════════════════════════════════════════════

const APP_VERSION = "v6.0 · 12/07/2026 18:40";

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

// ─── Système de notifications (pub/sub) ──────────────────────────────────────

// ─── Logs d'audit ─────────────────────────────────────────────────────────────

// ─── Mock abonnements backoffice ──────────────────────────────────────────────
const MOCK_SUBSCRIPTIONS = [
  { id:"sub1", pharmacie:"Pharmacie Centrale",    email:"contact@pharmaciecentrale.fr", plan:"starter",  billing:"monthly", status:"active",    mrr:19,  renewal:"15/07/2025", subId:"sub1" },
  { id:"sub2", pharmacie:"Pharmacie du Soleil",   email:"pharma@soleil.fr",             plan:"standard", billing:"monthly", status:"active",    mrr:39,  renewal:"01/08/2025", subId:"sub2" },
  { id:"sub3", pharmacie:"Pharmacie Lafayette",   email:"contact@lafayette.fr",         plan:"pro",      billing:"annual",  status:"active",    mrr:63,  renewal:"15/09/2025", subId:"sub3" },
  { id:"sub4", pharmacie:"Pharmacie des Arts",    email:"info@pharmaarts.fr",           plan:"starter",  billing:"monthly", status:"trialing",  mrr:0,   renewal:"30/07/2025", subId:"sub4" },
  { id:"sub5", pharmacie:"Pharmacie Saint-Michel",email:"saintmichel@pharma.fr",        plan:"standard", billing:"annual",  status:"past_due",  mrr:31,  renewal:"01/07/2025", subId:"sub5" },
  { id:"sub6", pharmacie:"Pharmacie Beaubourg",   email:"contact@beaubourg.fr",         plan:"starter",  billing:"monthly", status:"canceled",  mrr:0,   renewal:"—",          subId:"sub6" },
  { id:"sub7", pharmacie:"Pharmacie de la Gare",  email:"gare@pharma.fr",              plan:"standard", billing:"monthly", status:"active",    mrr:39,  renewal:"20/07/2025", subId:"sub7" },
  { id:"sub8", pharmacie:"Pharmacie Marais",      email:"marais@pharma.fr",             plan:"pro",      billing:"monthly", status:"trialing",  mrr:0,   renewal:"10/08/2025", subId:"sub8" },
];

// Exposer DB au module supabase.js (pont inter-modules)
if (typeof window !== 'undefined') window._ordomailDB = DB;
registerDB(DB);

const MOCK_INVOICES = [
  { id:"INV-2025-006", subId:"sub1", date:"15/06/2025", amount:19,  desc:"Starter — Juin 2025" },
  { id:"INV-2025-005", subId:"sub2", date:"01/06/2025", amount:39,  desc:"Standard — Juin 2025" },
  { id:"INV-2025-004", subId:"sub3", date:"15/05/2025", amount:189, desc:"Pro Annuel — Q2 2025" },
  { id:"INV-2025-003", subId:"sub1", date:"15/05/2025", amount:19,  desc:"Starter — Mai 2025" },
  { id:"INV-2025-002", subId:"sub7", date:"20/05/2025", amount:39,  desc:"Standard — Mai 2025" },
];

// ─── LogsPanel ─────────────────────────────────────────────────────────────────
function LogsPanel({ pharmacieId, onClose, onOpenOrdo }) {
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
              {["Date / Heure","Poste / Vendeur","Rôle","Action","ID Ordonnance"].map(h=><th key={h} style={{textAlign:"left",padding:"6px 10px",fontSize:11,color:"#94a3b8",fontWeight:700,textTransform:"uppercase"}}>{h}</th>)}
            </tr></thead>
            <tbody>{logs.map(l=>{
              const ts   = l.ts || l.created_at;
              const d    = ts ? new Date(ts) : null;
              const date = d && !isNaN(d) ? d.toLocaleDateString("fr-FR") : "—";
              const time = d && !isNaN(d) ? d.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit",second:"2-digit"}) : "—";
              return (
              <tr key={l.id} style={{borderBottom:"1px solid #f8fafc"}}>
                <td style={{padding:"8px 10px",whiteSpace:"nowrap"}}>
                  <div style={{fontWeight:600,fontSize:12,color:"#1a1a1a"}}>{date}</div>
                  <div style={{fontSize:11,color:"#94a3b8"}}>{time}</div>
                </td>
                <td style={{padding:"8px 10px"}}>
                  {l.posteNom
                    ? <><div style={{fontWeight:700,fontSize:12,color:"#1a1a1a"}}>{l.posteNom}</div><div style={{fontSize:10,color:"#94a3b8",fontFamily:"monospace"}}>{l.userId||""}</div></>
                    : <span style={{fontFamily:"monospace",fontSize:11,color:"#475569"}}>{l.userId||"—"}</span>}
                </td>
                <td style={{padding:"8px 10px"}}>
                  <span style={{fontSize:10,fontWeight:700,background:l.userRole==="admin"?"#dbeafe":"#dcfce7",color:l.userRole==="admin"?"#1d4ed8":"#15803d",padding:"2px 7px",borderRadius:20}}>
                    {l.userRole||"—"}
                  </span>
                </td>
                <td style={{padding:"8px 10px",fontWeight:600,color:"#1a1a1a"}}>{actionLabel[l.action]||l.action}</td>
                <td style={{padding:"8px 10px"}}>
                  {l.ordonnanceId
                    ? <button
                        onClick={() => { onClose(); onOpenOrdo && onOpenOrdo(l.ordonnanceId); }}
                        title={l.ordonnanceId}
                        style={{fontFamily:"monospace",fontSize:10,color:"#1e40af",background:"#eff6ff",
                          border:"1px solid #bfdbfe",borderRadius:6,padding:"2px 8px",cursor:"pointer",
                          fontWeight:700,textDecoration:"none"}}>
                        {l.ordonnanceId.slice(0,8)}…
                      </button>
                    : <span style={{color:"#94a3b8"}}>—</span>}
                </td>
              </tr>
              );
            })}</tbody>
          </table>
        )}
      </div>
    </div>
  );
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
  const patientParam = urlParams.get("patient");
  const qrTokenParam = urlParams.get("t"); // jeton public par pharmacie porté par le QR code (phase 1 sécurité)
  // Retour depuis Stripe Checkout (succès ou annulation) — BillingModule lit ce même
  // paramètre pour afficher l'écran adapté (voir son useEffect de montage).
  const checkoutReturn = urlParams.get("checkout");
  // En mode démo, chercher dans le mock ; en prod, charger depuis Supabase async
  const demoInitialPharmacie = patientParam ? DB.pharmacies.find(p => p.id === patientParam) : null;
  const initialRoute = isRecovery ? "reset-password" : checkoutReturn ? "checkout" : (patientParam ? "patient" : "landing");
  const [route, setRoute] = useState(initialRoute);
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
        <LandingPage onGoToPricing={()=>setRoute("pricing")} onGoToApp={()=>setRoute("dashboard")} onGoToCheckout={goToCheckout} onGoToAdmin={()=>setRoute("backoffice")}/>
      )}
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
