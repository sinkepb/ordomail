import { useState, useEffect } from "react";
import { PLAN_LIMITS, PLAN_ORDER } from "../lib/plans.js";
import { StoriesContentAdmin } from "../components/StoriesContentAdmin.jsx";
import { ClientDetail } from "../components/ClientDetail.jsx";
import { ContratEditor } from "../components/ContratEditor.jsx";
import { PricingEditor } from "../components/PricingEditor.jsx";
import { PromotionsAdmin } from "../components/PromotionsAdmin.jsx";
import { KitCommandesAdmin } from "../components/KitCommandesAdmin.jsx";
import { BillingModule } from "../components/BillingModule.jsx";
import { MonitoringPanel } from "../components/MonitoringPanel.jsx";
import { RgpdPanel } from "../components/RgpdPanel.jsx";
import { PurgeAdmin } from "../components/PurgeAdmin.jsx";
import { QrCodesAdmin } from "../components/QrCodesAdmin.jsx";
import { RappelsMetricsAdmin } from "../components/RappelsMetricsAdmin.jsx";
import { ClientsMap } from "../components/ClientsMap.jsx";
import { ADMIN_TOKEN_KEY, readStoredAdminToken } from "../lib/adminSession.js";

// Extrait la ville d'une adresse au format api-adresse.data.gouv.fr
// ("12 rue de la Paix, 75001 Paris" → "Paris") — aucune colonne "ville"
// dédiée, l'adresse complète est le seul champ enregistré à l'inscription.
function villeFromAdresse(adresse) {
  if (!adresse) return null;
  const apres = adresse.split(",").pop()?.trim();
  return apres ? apres.replace(/^\d{5}\s*/, "") : null;
}

// ─── Persistance de la session admin (18/08/2026) ─────────────────────────────
// adminToken était un simple useState, jamais persisté : tout rechargement de
// page vidait l'état React et repassait par l'écran de connexion — signalé
// comme gênant en usage réel. sessionStorage (pas localStorage) : survit à un
// rechargement dans le même onglet, sans laisser le jeton traîner
// indéfiniment sur une machine partagée. Le jeton expire de toute façon après
// 4h côté serveur (verify-admin/index.ts, ADMIN_TOKEN_TTL_SECONDS) — on lit
// son exp ici uniquement pour l'UX (éviter d'afficher des panneaux cassés
// avec un jeton déjà expiré) ; la vérification qui compte reste côté serveur
// (resolveCaller/verifyToken dans secure-data-admin).
//
// @fix 27/08/2026 — extrait dans lib/adminSession.js (partagé avec App.jsx) :
// App.jsx n'avait aucun moyen de savoir qu'une session admin était active,
// donc un refresh de la page backoffice pouvait être détourné vers
// "finish-subscription" par l'effet de restauration de session pharmacie.

import { isDemoMode } from "../supabase.js";

// Identifiant démo (mode VITE_DEMO_MODE=true uniquement — voir authenticate() ci-dessous).
// ⚠️ Ne JAMAIS utiliser DB.admin comme repli d'authentification hors mode démo strict :
// c'était la porte dérobée corrigée le 23/07/2026 (voir dossier d'audit sécurité).
// Note : contrairement à App.jsx, ce fichier n'a plus besoin d'un jeu de pharmacies
// factices — AdminDashboardLive lit window._ordomailDB (exposé par App.jsx) en mode
// démo, pas une copie locale. Seul DB.admin sert encore ici (repli démo du login).
const DB = {
  admin: { email: "admin@ordomail.fr", password: "admin2025" },
};


function BackofficeAdmin({ onBack }) {
  const [authed,     setAuthed]     = useState(() => !!readStoredAdminToken());
  const [adminToken, setAdminToken] = useState(() => readStoredAdminToken());
  const [email,      setEmail]      = useState("");
  const [pwd,        setPwd]        = useState("");
  const [err,        setErr]        = useState("");
  const [loading,    setLoading]    = useState(false);

  async function authenticate() {
    if (!email || !pwd) return;
    setLoading(true); setErr("");
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${supabaseUrl}/functions/v1/verify-admin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: pwd }),
      });
      const data = await res.json();
      if (data.success) {
        if (data.token) sessionStorage.setItem(ADMIN_TOKEN_KEY, data.token);
        setAdminToken(data.token || null); setAuthed(true);
      }
      else setErr(data.error || "Identifiants incorrects");
    } catch {
      // Le service verify-admin est indisponible (réseau, fonction non déployée, config manquante).
      // ⚠️ SÉCURITÉ : ce repli ne doit JAMAIS authentifier en production. Avant le 23/07/2026, ce
      // bloc comparait à un identifiant codé en dur (admin@ordomail.fr / admin2025) shipé dans le
      // bundle JS — une porte dérobée exploitable par quiconque lisait le code source. Il n'est
      // désormais accepté qu'en mode démo explicite (VITE_DEMO_MODE=true), jamais sur un simple
      // échec réseau.
      if (isDemoMode && email === DB.admin.email && pwd === DB.admin.password) {
        setAdminToken(null);
        setAuthed(true);
      } else {
        setErr("Service d'authentification indisponible — réessayez ou contactez le support");
      }
    }
    setLoading(false);
  }

  if (!authed) return (
    <div style={{minHeight:"100vh",background:"#0f172a",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Inter',system-ui,sans-serif",padding:24}}>
      <div style={{width:"100%",maxWidth:380}}>
        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{fontSize:40,marginBottom:8}}>🛡️</div>
          <div style={{fontWeight:900,fontSize:22,color:"#fff",marginBottom:4}}>OrdoMail Business</div>
          <div style={{fontSize:13,color:"#475569"}}>Espace administration réservé</div>
        </div>
        <div style={{background:"#1e293b",borderRadius:14,padding:24,boxShadow:"0 24px 60px rgba(0,0,0,0.4)"}}>
          {[["email","Email","email","admin@ordomail.fr",email,setEmail],["password","Mot de passe","password","••••••••",pwd,setPwd]].map(([k,l,t,ph,val,set])=>(
            <div key={k} style={{marginBottom:14}}>
              <label style={{fontSize:11,fontWeight:700,color:"#64748b",display:"block",marginBottom:6,textTransform:"uppercase"}}>{l}</label>
              <input type={t} value={val} onChange={e=>set(e.target.value)} onKeyDown={e=>e.key==="Enter"&&authenticate()} placeholder={ph}
                style={{width:"100%",padding:"10px 12px",background:"#0f172a",border:"1px solid #334155",borderRadius:8,color:"#fff",fontSize:14,outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}/>
            </div>
          ))}
          {err && <div style={{background:"#450a0a",border:"1px solid #7f1d1d",borderRadius:8,padding:"8px 12px",color:"#fca5a5",fontSize:12,marginBottom:12}}>{err}</div>}
          <button onClick={authenticate} disabled={!email||!pwd||loading}
            style={{width:"100%",padding:"11px",border:"none",borderRadius:9,background:!email||!pwd||loading?"#1e3a5f":"#3b82f6",color:"#fff",fontWeight:800,fontSize:14,cursor:!email||!pwd||loading?"not-allowed":"pointer",fontFamily:"inherit"}}>
            {loading ? "Vérification…" : "Accéder →"}
          </button>
        </div>
        <div style={{textAlign:"center",marginTop:14}}>
          <button onClick={onBack} style={{background:"none",border:"none",color:"#475569",fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>← Retour au site</button>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",fontFamily:"'Inter',system-ui,sans-serif",background:"#0f172a"}}>
      <header style={{background:"#1e293b",borderBottom:"1px solid #334155",height:52,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 20px",position:"sticky",top:0,zIndex:100}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span>💊</span>
          <span style={{fontWeight:900,fontSize:15,color:"#fff"}}>OrdoMail</span>
          <span style={{fontSize:10,fontWeight:700,color:"#64748b",background:"#0f172a",padding:"2px 8px",borderRadius:6}}>BUSINESS ADMIN</span>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={onBack} style={{background:"rgba(255,255,255,0.07)",border:"1px solid #334155",color:"#94a3b8",padding:"5px 14px",borderRadius:7,cursor:"pointer",fontSize:12,fontFamily:"inherit"}}>← Site</button>
          <button onClick={()=>{ sessionStorage.removeItem(ADMIN_TOKEN_KEY); setAuthed(false); setAdminToken(null); }} style={{background:"rgba(255,255,255,0.05)",border:"1px solid #1e293b",color:"#475569",padding:"5px 12px",borderRadius:7,cursor:"pointer",fontSize:12,fontFamily:"inherit"}}>Déconnexion</button>
        </div>
      </header>
      <AdminDashboardLive adminToken={adminToken}/>
    </div>
  );
}

function AdminDashboardLive({ adminToken } = {}) {
  const [tab,      setTab]      = useState("clients");
  const [clients,  setClients]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState("");
  const [selected, setSelected] = useState(null);
  const [saving,   setSaving]   = useState(false);
  const [msg,      setMsg]      = useState("");
  const [metrics,  setMetrics]  = useState(null); // métriques globales

  // @conformite-tarifs 25/08/2026 — dérivé de PLAN_LIMITS (synchronisé au
  // démarrage depuis pricing_plans, voir lib/plans.js:loadPlanLimits) au lieu
  // d'être codé en dur ici : ce tableau alimente le MRR/ARR affichés plus bas
  // et ClientDetail.jsx — un prix modifié dans l'éditeur de tarifs doit aussi
  // se refléter dans ces calculs, pas seulement sur la landing page.
  const PLANS = Object.fromEntries(PLAN_ORDER.map(id => {
    const p = PLAN_LIMITS[id];
    return [id, { label: p.label, prix: p.price, maxPostes: p.maxPostes, color: p.color }];
  }));

  useEffect(() => { loadClients(); }, []);

  async function loadClients() {
    setLoading(true);
    if (isDemoMode) {
      const db = window._ordomailDB;
      const pharmacies = db?.pharmacies || [];
      const enriched = pharmacies.map(p => ({
        ...p,
        postesActifs:  (p.postes||[]).filter(x=>x.actif).length,
        postesTotal:   (p.postes||[]).length,
        ordos_total:   (p.ordonnances||[]).length,
        ordos_mois:    Math.floor(Math.random()*80)+10,
        ordos_semaine: Math.floor(Math.random()*20)+2,
        ordos_attente: Math.floor(Math.random()*5),
        taux_traitement: Math.floor(Math.random()*30)+70,
        delai_moyen_min: Math.floor(Math.random()*8)+1,
        canal_qr_pct:  Math.floor(Math.random()*60)+30,
        canal_email_pct: Math.floor(Math.random()*40)+10,
        last_login:    new Date(Date.now() - Math.random()*7*86400000).toISOString(),
        last_ordo:     new Date(Date.now() - Math.random()*3*86400000).toISOString(),
        score_activite: Math.floor(Math.random()*40)+60,
        offres_actives: Math.floor(Math.random()*3),
        pins_configures: Math.floor(Math.random()*3)+1,
        trial_ends_at: null,
      }));
      setClients(enriched);
      computeGlobalMetrics(enriched);
      setLoading(false);
      return;
    }
    try {
      // Route via secure-data (jeton admin) — l'ancien .select("*, postes(*)") en clé anon
      // renvoyait, entre autres, les PIN de vente en clair de toutes les pharmacies à
      // quiconque savait appeler l'API REST Supabase, connecté ou non au backoffice.
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const res = await fetch(`${supabaseUrl}/functions/v1/secure-data-admin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": supabaseKey,
          "Authorization": `Bearer ${adminToken || ""}`,
        },
        body: JSON.stringify({ resource: "admin_pharmacies" }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `secure-data-admin ${res.status}`);
      const enriched = body.data || [];

      setClients(enriched);
      computeGlobalMetrics(enriched);
    } catch(e) { console.error(e); }
    setLoading(false);
  }

  function computeGlobalMetrics(data) {
    const actifs = data.filter(c => (c.ordos_mois||0) > 0);
    const mrr    = data.reduce((s,c) => s + (PLANS[c.plan]?.prix||0), 0);
    const arr    = mrr * 12;
    const total_ordos_mois = data.reduce((s,c) => s + (c.ordos_mois||0), 0);
    const churn_risk = data.filter(c => (c.score_activite||0) < 30).length;
    const upsell     = data.filter(c => c.plan === "starter" && (c.ordos_mois||0) > 150).length;
    setMetrics({ mrr, arr, total_ordos_mois, churn_risk, upsell, actifs: actifs.length, total: data.length });
  }

  function scoreColor(s) { return s>=70?"#15803d":s>=40?"#f59e0b":"#dc2626"; }

  const filtered = clients.filter(c =>
    c.nom?.toLowerCase().includes(search.toLowerCase()) ||
    c.email?.toLowerCase().includes(search.toLowerCase()) ||
    c.titulaire?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{minHeight:"100vh",background:"#0f172a",fontFamily:"'Inter',system-ui,sans-serif",color:"#e2e8f0"}}>
      {/* Header */}
      <div style={{background:"#1e293b",borderBottom:"1px solid #334155",padding:"16px 24px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <span style={{fontSize:22}}>💊</span>
          <div>
            <div style={{fontWeight:900,fontSize:18,color:"#fff"}}>OrdoMail Admin</div>
            <div style={{fontSize:11,color:"#64748b"}}>Tableau de bord opérateur</div>
          </div>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:11,color:"#64748b"}}>{new Date().toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long"})}</div>
          {/* __BUILD_TIME__ : horodatage réel injecté au build (voir vite.config.js), pas une
              date maintenue à la main — déplacé ici depuis le pied de la landing page (25/08/2026),
              utile côté opérateur, pas côté visiteur public. */}
          <div style={{fontSize:10,color:"#475569",fontFamily:"monospace",marginTop:2}}>
            v6.0 · déployé le {new Date(__BUILD_TIME__).toLocaleDateString("fr-FR")} à {new Date(__BUILD_TIME__).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}
          </div>
        </div>
      </div>

      <div style={{padding:24}}>

        {/* KPIs globaux */}
        {metrics && (
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:12,marginBottom:24}}>
            {[
              { label:"MRR",          value:`${metrics.mrr}€`,    sub:"revenu mensuel",    icon:"💰", color:"#4ade80" },
              { label:"ARR",          value:`${metrics.arr}€`,    sub:"revenu annuel",     icon:"📈", color:"#60a5fa" },
              { label:"Clients",      value:metrics.total,        sub:"pharmacies",        icon:"🏥", color:"#a78bfa" },
              { label:"Actifs/mois",  value:metrics.actifs,       sub:"avec activité",     icon:"✅", color:"#34d399" },
              { label:"Ordos/mois",   value:metrics.total_ordos_mois, sub:"total réseau", icon:"📋", color:"#fbbf24" },
              { label:"Risque churn", value:metrics.churn_risk,   sub:"score < 30",        icon:"⚠️", color:"#f87171" },
              { label:"Upsell",       value:metrics.upsell,       sub:"Starter saturés",   icon:"🚀", color:"#fb923c" },
            ].map(k => (
              <div key={k.label} style={{background:"#1e293b",border:"1px solid #334155",borderRadius:12,padding:"14px 16px"}}>
                <div style={{fontSize:18,marginBottom:4}}>{k.icon}</div>
                <div style={{fontSize:22,fontWeight:900,color:k.color}}>{k.value}</div>
                <div style={{fontSize:10,color:"#64748b",fontWeight:700,textTransform:"uppercase",letterSpacing:0.5}}>{k.label}</div>
                <div style={{fontSize:10,color:"#475569"}}>{k.sub}</div>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div style={{display:"flex",gap:8,marginBottom:20}}>
          {[["clients","👥 Clients"],["carte","🗺️ Carte"],["contrats","📋 Contrats"],["tarifs","🏷️ Tarifs"],["promotions","🚀 Promotions"],["materiel","📦 Matériel"],["qrcodes","🏷️ QR Codes"],["rappels","🔔 Rappels & SMS"],["stories","📱 Stories"],["monitoring","🔔 Monitoring"],["rgpd","🔐 RGPD"],["purge","🗑️ Purge"]].map(([k,l]) => (
            <button key={k} onClick={()=>{setTab(k);setSelected(null);}}
              style={{padding:"7px 16px",border:"none",borderRadius:8,cursor:"pointer",fontFamily:"inherit",fontSize:13,
                fontWeight:tab===k?700:500,
                background:tab===k?"#3b82f6":"#1e293b",
                color:tab===k?"#fff":"#94a3b8",
                outline:`1px solid ${tab===k?"#3b82f6":"#334155"}`}}>
              {l}
            </button>
          ))}
          <button onClick={loadClients}
            style={{marginLeft:"auto",padding:"7px 14px",border:"1px solid #334155",borderRadius:8,background:"#1e293b",color:"#64748b",fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>
            🔄 Actualiser
          </button>
        </div>

        {loading && <div style={{textAlign:"center",padding:48,color:"#64748b"}}>⏳ Chargement…</div>}

        {!loading && tab === "clients" ? (
          selected ? (
            /* ── Détail client ── */
            <ClientDetail client={selected} plans={PLANS} onClose={()=>setSelected(null)}/>
          ) : (
            /* ── Liste clients ── */
            <div>
              <input value={search} onChange={e=>setSearch(e.target.value)}
                placeholder="🔍 Rechercher pharmacie ou email…"
                style={{width:"100%",padding:"10px 14px",background:"#1e293b",border:"1px solid #334155",borderRadius:9,color:"#fff",fontSize:13,outline:"none",fontFamily:"inherit",marginBottom:16,boxSizing:"border-box"}}/>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {filtered.map(ph => (
                  <div key={ph.id} onClick={()=>setSelected(ph)}
                    style={{background:"#1e293b",border:`1px solid ${(ph.ordos_attente||0)>0?"#f59e0b":"#334155"}`,borderRadius:12,padding:"14px 18px",cursor:"pointer",transition:"border 0.15s"}}>
                    <div style={{display:"flex",alignItems:"center",gap:14}}>
                      {/* Avatar */}
                      <div style={{width:44,height:44,borderRadius:11,background:ph.couleur||"#1a3a6e",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>💊</div>
                      {/* Infos */}
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
                          <span style={{fontWeight:800,fontSize:15,color:"#fff"}}>{ph.nom}</span>
                          <span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:20,background:PLANS[ph.plan]?.color||"#334155",color:"#fff"}}>{PLANS[ph.plan]?.label||ph.plan}</span>
                          {ph.trial_ends_at && new Date(ph.trial_ends_at)>new Date() && (
                            <span style={{fontSize:10,background:"#fef3c7",color:"#92400e",borderRadius:20,padding:"2px 8px",fontWeight:700}}>
                              Trial · {Math.ceil((new Date(ph.trial_ends_at)-new Date())/86400000)}j
                            </span>
                          )}
                          {(ph.ordos_attente||0)>0 && (
                            <span style={{fontSize:10,background:"#f59e0b",color:"#fff",borderRadius:20,padding:"2px 8px",fontWeight:700}}>
                              ⚠️ {ph.ordos_attente} en attente
                            </span>
                          )}
                        </div>
                        <div style={{fontSize:11,color:"#64748b"}}>
                          {ph.titulaire && <>👤 {ph.titulaire} · </>}
                          {ph.email}
                          {villeFromAdresse(ph.adresse) && <> · 📍 {villeFromAdresse(ph.adresse)}</>}
                        </div>
                      </div>
                      {/* Métriques rapides */}
                      <div style={{display:"flex",gap:16,alignItems:"center",flexShrink:0}}>
                        <div style={{textAlign:"center"}}>
                          <div style={{fontSize:18,fontWeight:900,color:"#60a5fa"}}>{ph.ordos_mois||0}</div>
                          <div style={{fontSize:9,color:"#475569"}}>ordos/mois</div>
                        </div>
                        <div style={{textAlign:"center"}}>
                          <div style={{fontSize:18,fontWeight:900,color:"#4ade80"}}>{ph.taux_traitement||0}%</div>
                          <div style={{fontSize:9,color:"#475569"}}>traité</div>
                        </div>
                        <div style={{textAlign:"center"}}>
                          <div style={{fontSize:18,fontWeight:900,color:scoreColor(ph.score_activite||0)}}>{ph.score_activite||0}</div>
                          <div style={{fontSize:9,color:"#475569"}}>score</div>
                        </div>
                        <div style={{fontSize:11,color:"#475569"}}>→</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        ) : tab === "carte" ? (
          <ClientsMap clients={clients}/>
        ) : tab === "stories" ? (
          <StoriesContentAdmin adminToken={adminToken}/>
        ) : tab === "tarifs" ? (
          <PricingEditor adminToken={adminToken}/>
        ) : tab === "promotions" ? (
          <PromotionsAdmin adminToken={adminToken}/>
        ) : tab === "materiel" ? (
          <KitCommandesAdmin adminToken={adminToken}/>
        ) : tab === "qrcodes" ? (
          <QrCodesAdmin adminToken={adminToken}/>
        ) : tab === "rappels" ? (
          <RappelsMetricsAdmin adminToken={adminToken}/>
        ) : tab === "monitoring" ? (
          <MonitoringPanel adminToken={adminToken}/>
        ) : tab === "rgpd" ? (
          <RgpdPanel adminToken={adminToken}/>
        ) : tab === "purge" ? (
          <PurgeAdmin adminToken={adminToken}/>
        ) : (
          selected ? (
            <ContratEditor
              pharmacie={selected}
              plans={PLANS}
              onSave={async (id,plan)=>{
                setSaving(true);
                try {
                  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
                  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
                  await fetch(`${supabaseUrl}/functions/v1/secure-data-admin`, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      "apikey": supabaseKey,
                      "Authorization": `Bearer ${adminToken || ""}`,
                    },
                    body: JSON.stringify({ resource: "admin_update_plan", params: { pharmacieId: id, plan } }),
                  });
                  setMsg("✅ Contrat mis à jour");
                } catch(e) {
                  setMsg("❌ Erreur : " + e.message);
                }
                setSaving(false);
                setTimeout(()=>setMsg(""),3000);
                loadClients();
              }}
              onClose={()=>setSelected(null)}
              saving={saving}
              msg={msg}
              onClearMsg={()=>setMsg("")}
            />
          ) : (
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {filtered.map(ph=>(
                <div key={ph.id} onClick={()=>setSelected(ph)}
                  style={{background:"#1e293b",border:"1px solid #334155",borderRadius:12,padding:"14px 18px",cursor:"pointer",display:"flex",alignItems:"center",gap:14}}>
                  <div style={{width:40,height:40,borderRadius:10,background:ph.couleur||"#1a3a6e",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>💊</div>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:700,color:"#fff"}}>{ph.nom}</div>
                    <div style={{fontSize:12,color:"#64748b"}}>{ph.email} · {PLANS[ph.plan]?.label||ph.plan} · {PLANS[ph.plan]?.prix||0}€/mois</div>
                  </div>
                  <div style={{fontSize:11,color:"#475569"}}>Modifier →</div>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}

// Seuls BillingModule et BackofficeAdmin sont importés depuis l'extérieur
// (App.jsx, via import() dynamique) — AdminDashboardLive (défini ici) est déjà
// l'export par défaut, et ClientDetail/StoriesContentAdmin/ContratEditor/
// PricingEditor sont chacun déjà importés directement depuis leur propre
// fichier là où ils servent : les réexporter ici n'avait plus aucun
// consommateur.
export { BillingModule, BackofficeAdmin };
export default AdminDashboardLive;