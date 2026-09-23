// Extrait de AdminPage.jsx (phase 4) — composant autonome (props uniquement).
// Découpage des gros fichiers, voir DEPLOIEMENT_PHASE2.md/PHASE4.md.
import { useEffect, useState } from "react";
import { snapshotMetriquesJournalieres } from "../supabase.js";
import { HistoriqueSparkline } from "./HistoriqueSparkline.jsx";

// Statistiques d'usage (scans QR, connexions, dépôts du jour) chargées à la
// demande (22/09/2026, demande titulaire) — volontairement PAS incluses dans
// la liste des pharmacies (admin_pharmacies, coûteuse pour N pharmacies) :
// un admin n'ouvre qu'une fiche à la fois, donc un fetch dédié ici plutôt
// qu'un calcul pour toute la liste à chaque chargement de l'onglet Clients.
async function callSecureData(resource, params, adminToken) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const res = await fetch(`${supabaseUrl}/functions/v1/secure-data-admin`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "apikey": supabaseKey, "Authorization": `Bearer ${adminToken || ""}` },
    body: JSON.stringify({ resource, params }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `secure-data-admin ${resource} : erreur ${res.status}`);
  return body;
}

function ClientDetail({ client: ph, plans, adminToken, onClose }) {
  const planInfo = plans[ph.plan] || {};
  const [usage, setUsage] = useState(null);
  const [usageLoading, setUsageLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setUsage(null);
    setUsageLoading(true);
    callSecureData("admin_pharmacie_usage", { pharmacieId: ph.id }, adminToken)
      .then(({ data }) => { if (!cancelled) setUsage(data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setUsageLoading(false); });
    return () => { cancelled = true; };
  }, [ph.id, adminToken]);
  const trialLeft = ph.trial_ends_at ? Math.ceil((new Date(ph.trial_ends_at)-new Date())/86400000) : null;
  const scoreColor = (s) => s>=70?"#4ade80":s>=40?"#fbbf24":"#f87171";
  const scoreBg    = (s) => s>=70?"rgba(74,222,128,0.1)":s>=40?"rgba(251,191,36,0.1)":"rgba(248,113,113,0.1)";
  // Délai moyen envoi → impression (delai_moyen_min), voir
  // migrations/20260725_temps_traitement.sql
  const formatDuree = (min) => {
    if (!min || min <= 0) return "—";
    if (min < 60) return `${min} min`;
    return `${Math.floor(min/60)}h ${String(min%60).padStart(2,"0")}`;
  };

  return (
    <div style={{background:"#1e293b",borderRadius:16,border:"1px solid #334155",overflow:"hidden"}}>
      {/* Header client */}
      <div style={{padding:"20px 24px",borderBottom:"1px solid #334155",display:"flex",alignItems:"center",gap:16}}>
        <div style={{width:52,height:52,borderRadius:14,background:ph.couleur||"#1a3a6e",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24}}>💊</div>
        <div style={{flex:1}}>
          <div style={{fontWeight:900,fontSize:20,color:"#fff"}}>{ph.nom}</div>
          <div style={{fontSize:13,color:"#64748b"}}>{ph.email} · {ph.adresse}</div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <span style={{padding:"4px 12px",borderRadius:20,background:planInfo.color||"#334155",color:"#fff",fontSize:12,fontWeight:700}}>{planInfo.label||ph.plan}</span>
          {trialLeft > 0 && <span style={{padding:"4px 12px",borderRadius:20,background:"#fef3c7",color:"#92400e",fontSize:12,fontWeight:700}}>Trial · {trialLeft}j restants</span>}
          {trialLeft <= 0 && ph.trial_ends_at && <span style={{padding:"4px 12px",borderRadius:20,background:"#fee2e2",color:"#dc2626",fontSize:12,fontWeight:700}}>Trial expiré</span>}
        </div>
        <button onClick={onClose} style={{background:"#0f172a",border:"1px solid #334155",color:"#64748b",padding:"6px 14px",borderRadius:8,cursor:"pointer",fontFamily:"inherit",fontSize:12}}>← Retour</button>
        <button onClick={()=>snapshotMetriquesJournalieres()} style={{background:"#1e40af",border:"none",color:"#fff",padding:"6px 14px",borderRadius:8,cursor:"pointer",fontFamily:"inherit",fontSize:12}}>
          📸 Snapshot
        </button>
      </div>

      {/* Graphique historique 30 jours */}
      <HistoriqueSparkline pharmacieId={ph.id}/>

      <div style={{padding:"0 24px 24px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>

        {/* ── Colonne gauche ── */}
        <div style={{display:"flex",flexDirection:"column",gap:16}}>

          {/* Score global */}
          <div style={{background:scoreBg(ph.score_activite||0),border:`1px solid ${scoreColor(ph.score_activite||0)}33`,borderRadius:12,padding:16,textAlign:"center"}}>
            <div style={{fontSize:11,fontWeight:700,color:"#94a3b8",letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>Score d'activité</div>
            <div style={{fontSize:52,fontWeight:900,color:scoreColor(ph.score_activite||0),lineHeight:1}}>{ph.score_activite||0}</div>
            <div style={{fontSize:11,color:"#64748b",marginTop:4}}>/100 · {(ph.score_activite||0)>=70?"🟢 Engagé":(ph.score_activite||0)>=40?"🟡 Modéré":"🔴 Risque churn"}</div>
          </div>

          {/* Métriques volume */}
          <div style={{background:"#0f172a",borderRadius:12,padding:16}}>
            <div style={{fontSize:11,fontWeight:700,color:"#64748b",letterSpacing:1,textTransform:"uppercase",marginBottom:12}}>📋 Volume ordonnances</div>
            {[
              ["Ce mois",    ph.ordos_mois||0,    "#60a5fa"],
              ["Cette semaine", ph.ordos_semaine||0, "#a78bfa"],
              ["Total",      ph.ordos_total||0,   "#94a3b8"],
              ["En attente", ph.ordos_attente||0, (ph.ordos_attente||0)>0?"#f87171":"#4ade80"],
            ].map(([label, val, color]) => (
              <div key={label} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <span style={{fontSize:13,color:"#94a3b8"}}>{label}</span>
                <span style={{fontSize:18,fontWeight:900,color}}>{val}</span>
              </div>
            ))}
          </div>

          {/* Canaux */}
          <div style={{background:"#0f172a",borderRadius:12,padding:16}}>
            <div style={{fontSize:11,fontWeight:700,color:"#64748b",letterSpacing:1,textTransform:"uppercase",marginBottom:12}}>📡 Canaux d'envoi (30j)</div>
            {[
              ["📱 QR Code",  ph.canal_qr_pct||0,    "#4ade80"],
              ["✉️ Email",    ph.canal_email_pct||0,  "#60a5fa"],
              ["⬇️ Upload",   100-(ph.canal_qr_pct||0)-(ph.canal_email_pct||0), "#a78bfa"],
            ].map(([label, pct, color]) => (
              <div key={label} style={{marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                  <span style={{fontSize:12,color:"#94a3b8"}}>{label}</span>
                  <span style={{fontSize:12,fontWeight:700,color}}>{Math.max(0,pct)}%</span>
                </div>
                <div style={{height:6,background:"#1e293b",borderRadius:3,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${Math.max(0,pct)}%`,background:color,borderRadius:3,transition:"width 0.5s"}}/>
                </div>
              </div>
            ))}
          </div>

          {/* Statistiques d'usage jour/semaine/mois (22/09/2026) — dépôts déjà
              suivis via ordonnances, scans via qr_scans (nouveau, voir
              log-qr-scan), connexions via audit_logs (action:"login",
              déjà tracées mais jamais agrégées avant ce jour). */}
          <div style={{background:"#0f172a",borderRadius:12,padding:16}}>
            <div style={{fontSize:11,fontWeight:700,color:"#64748b",letterSpacing:1,textTransform:"uppercase",marginBottom:8}}>📊 Statistiques d'usage</div>
            {usageLoading ? (
              <div style={{fontSize:12,color:"#64748b",padding:"8px 0"}}>⏳ Chargement…</div>
            ) : (
              <>
                <div style={{display:"flex",fontSize:10,color:"#64748b",fontWeight:700,padding:"4px 0 6px",borderBottom:"1px solid #1e293b"}}>
                  <span style={{flex:1}}></span>
                  <span style={{width:40,textAlign:"center"}}>Jour</span>
                  <span style={{width:48,textAlign:"center"}}>Sem.</span>
                  <span style={{width:40,textAlign:"center"}}>Mois</span>
                </div>
                {[
                  ["📥 Dépôts d'ordonnances", usage?.ordos_jour, ph.ordos_semaine, ph.ordos_mois, "#4ade80"],
                  ["📱 Scans QR code", usage?.scans_jour, usage?.scans_semaine, usage?.scans_mois, "#60a5fa"],
                  ["👑 Connexions email", usage?.connexions_email_jour, usage?.connexions_email_semaine, usage?.connexions_email_mois, "#a78bfa"],
                  ["🔢 Connexions PIN", usage?.connexions_pin_jour, usage?.connexions_pin_semaine, usage?.connexions_pin_mois, "#fbbf24"],
                ].map(([label, j, s, m, color]) => (
                  <div key={label} style={{display:"flex",alignItems:"center",padding:"7px 0",borderBottom:"1px solid #1e293b"}}>
                    <span style={{flex:1,fontSize:12,color:"#94a3b8"}}>{label}</span>
                    <span style={{width:40,textAlign:"center",fontSize:14,fontWeight:900,color}}>{j||0}</span>
                    <span style={{width:48,textAlign:"center",fontSize:14,fontWeight:900,color}}>{s||0}</span>
                    <span style={{width:40,textAlign:"center",fontSize:14,fontWeight:900,color}}>{m||0}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        {/* ── Colonne droite ── */}
        <div style={{display:"flex",flexDirection:"column",gap:16}}>

          {/* Performance */}
          <div style={{background:"#0f172a",borderRadius:12,padding:16}}>
            <div style={{fontSize:11,fontWeight:700,color:"#64748b",letterSpacing:1,textTransform:"uppercase",marginBottom:12}}>⚡ Performance</div>
            {[
              ["Taux de traitement", `${ph.taux_traitement||0}%`,  (ph.taux_traitement||0)>=80?"#4ade80":"#f87171"],
              ["Temps moyen de traitement", formatDuree(ph.delai_moyen_min), (ph.delai_moyen_min||0)>0 && (ph.delai_moyen_min||0)<=30?"#4ade80":"#fbbf24"],
              ["Ordos en attente +24h", ph.ordos_attente||0,       (ph.ordos_attente||0)===0?"#4ade80":"#f87171"],
              ["Postes actifs",     `${ph.postesActifs||0}/${planInfo.maxPostes||"∞"}`, "#60a5fa"],
              ["PINs configurés",   ph.pins_configures||0,          "#a78bfa"],
              ["Offres stories actives", ph.offres_actives||0,      "#fbbf24"],
            ].map(([label, val, color]) => (
              <div key={label} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <span style={{fontSize:12,color:"#94a3b8"}}>{label}</span>
                <span style={{fontSize:15,fontWeight:900,color}}>{val}</span>
              </div>
            ))}
          </div>

          {/* Commercial */}
          <div style={{background:"#0f172a",borderRadius:12,padding:16}}>
            <div style={{fontSize:11,fontWeight:700,color:"#64748b",letterSpacing:1,textTransform:"uppercase",marginBottom:12}}>💰 Commercial</div>
            {[
              ["Plan actuel",  `${planInfo.label||ph.plan} · ${planInfo.prix||0}€/mois`, "#fff"],
              ["MRR client",   `${planInfo.prix||0}€`,   "#4ade80"],
              ["ARR client",   `${(planInfo.prix||0)*12}€`, "#60a5fa"],
              ["Membre depuis", new Date(ph.created_at||Date.now()).toLocaleDateString("fr-FR"), "#94a3b8"],
            ].map(([label, val, color]) => (
              <div key={label} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <span style={{fontSize:12,color:"#94a3b8"}}>{label}</span>
                <span style={{fontSize:13,fontWeight:700,color}}>{val}</span>
              </div>
            ))}
          </div>

          {/* Alertes & opportunités */}
          <div style={{background:"#0f172a",borderRadius:12,padding:16}}>
            <div style={{fontSize:11,fontWeight:700,color:"#64748b",letterSpacing:1,textTransform:"uppercase",marginBottom:12}}>🎯 Alertes & Opportunités</div>
            {(ph.ordos_attente||0) > 2 && (
              <div style={{background:"rgba(248,113,113,0.1)",border:"1px solid #f8717133",borderRadius:8,padding:"8px 12px",marginBottom:8,fontSize:12,color:"#fca5a5"}}>
                ⚠️ {ph.ordos_attente} ordonnances non traitées depuis +24h
              </div>
            )}
            {ph.plan==="starter" && (ph.ordos_mois||0)>150 && (
              <div style={{background:"rgba(251,191,36,0.1)",border:"1px solid #fbbf2433",borderRadius:8,padding:"8px 12px",marginBottom:8,fontSize:12,color:"#fde68a"}}>
                🚀 Volume élevé — opportunité d'upgrade Standard
              </div>
            )}
            {(ph.score_activite||0) < 30 && (
              <div style={{background:"rgba(248,113,113,0.1)",border:"1px solid #f8717133",borderRadius:8,padding:"8px 12px",marginBottom:8,fontSize:12,color:"#fca5a5"}}>
                🔴 Faible activité — risque de churn
              </div>
            )}
            {(ph.pins_configures||0) === 0 && (ph.postesActifs||0) > 0 && (
              <div style={{background:"rgba(96,165,250,0.1)",border:"1px solid #60a5fa33",borderRadius:8,padding:"8px 12px",marginBottom:8,fontSize:12,color:"#93c5fd"}}>
                💡 Aucun PIN configuré — proposer la formation vendeur
              </div>
            )}
            {(ph.offres_actives||0) === 0 && (
              <div style={{background:"rgba(167,139,250,0.1)",border:"1px solid #a78bfa33",borderRadius:8,padding:"8px 12px",marginBottom:8,fontSize:12,color:"#c4b5fd"}}>
                🎯 Aucune offre stories créée — potentiel engagement patient
              </div>
            )}
            {(ph.ordos_attente||0)===0 && (ph.score_activite||0)>=70 && (
              <div style={{background:"rgba(74,222,128,0.1)",border:"1px solid #4ade8033",borderRadius:8,padding:"8px 12px",fontSize:12,color:"#86efac"}}>
                ✅ Client sain — aucune action requise
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export { ClientDetail };
export default ClientDetail;
