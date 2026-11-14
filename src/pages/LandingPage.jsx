import { useState, useEffect, useRef } from "react";

import { C, useFadeIn, PLANS } from "../lib/utils.js";
import { toHT } from "../lib/plans.js";
import { STATUT_INFO } from "../components/rappels/rappelsConstants.js";

const DEMO_ORDOS = [
  { nom: "MARTIN Pierre",    cv: "1 75 04 75 118 042 18", medecin: "Dr Bernard",  source: "email",  status: "nouveau",  mins: 3  },
  { nom: "DUBOIS Sophie",    cv: "2 82 11 75 063 014 22", medecin: "Dr Leclerc", source: "qrcode", status: "nouveau",  mins: 11 },
  { nom: "LEFEBVRE Jean",    cv: "1 60 03 75 042 118 08", medecin: "Dr Moreau",  source: "email",  status: "nouveau",  mins: 24 },
  { nom: "ROUX Anne",        cv: "2 91 03 69 215 088 45", medecin: "Dr Petit",   source: "qrcode", status: "imprime",  mins: 42 },
  { nom: "THOMAS Isabelle",  cv: "2 77 06 13 042 118 31", medecin: "Dr Gautier", source: "email",  status: "imprime",  mins: 68 },
];


// Renouvellements de démo (14/11/2026) — mêmes statuts et libellés que
// l'onglet Rappels réel (rappelsConstants.js : STATUT_INFO, CHOIX_LABEL,
// CRENEAU_LABEL). MARTIN passe de "SMS envoyé" à "À traiter" en direct pour
// montrer la réponse du patient qui arrive sans que personne n'appelle.
const DEMO_RAPPELS = [
  { id: "martin",   nom: "MARTIN Pierre",   medecin: "Dr Bernard", statut: "sms_envoye", detail: "📱 SMS envoyé il y a 2 jours" },
  { id: "roux",     nom: "ROUX Anne",       medecin: "Dr Petit",   statut: "prepare",    detail: "📦 Casier B3 · ☀️ Cet après-midi" },
  { id: "lefebvre", nom: "LEFEBVRE Jean",   medecin: "Dr Moreau",  statut: "a_appeler",  detail: "📞 Pas de mobile : à appeler" },
  { id: "thomas",   nom: "THOMAS Isabelle", medecin: "Dr Gautier", statut: "termine",    detail: "✅ Renouvelé · nouveau cycle lancé" },
];
const REPONSE_MARTIN = { statut: "a_traiter", detail: "✅ Tout renouveler · 🌤️ Demain matin", isNew: true };

// scenario (14/11/2026, carrousel du hero) : "rappels" ouvre sur les
// renouvellements (diapo 1), "ordos" reprend la démo d'origine (diapo 2).
function MiniDashboard({ scenario = "rappels", actif = true }) {
  const [filter, setFilter] = useState(scenario === "rappels" ? "rappels" : "nouveau");
  const [searchQuery, setSearchQuery] = useState("");
  const [highlighted, setHighlighted] = useState(null);
  const [banniere, setBanniere] = useState(null);
  const [ordos, setOrdos] = useState(DEMO_ORDOS);
  const [rappels, setRappels] = useState(DEMO_RAPPELS);
  // Scénario (14/11/2026) : la démo s'ouvre sur les renouvellements (ce qui fait
  // vendre OrdoMail) ; la réponse d'un patient arrive, puis une ordonnance.

  useEffect(() => {
    const timers = [];
    if (!actif) return;
    const plus = (ms, fn) => timers.push(setTimeout(fn, ms));
    if (scenario === "ordos") {
      plus(3200, () => {
        setOrdos(prev => prev.some(o => o.nom === "GARCIA Manuel") ? prev : [
          { nom: "GARCIA Manuel", cv: "1 73 07 92 042 118 85", medecin: "Dr Vidal", source: "qrcode", status: "nouveau", mins: 0, isNew: true },
          ...prev,
        ]);
        setBanniere({ couleur: C.green, texte: "Nouvelle ordonnance reçue — GARCIA Manuel" });
      });
      plus(6200, () => setBanniere(null));
      return () => timers.forEach(clearTimeout);
    }
    plus(3200, () => {
      setRappels(prev => prev.map(r => r.id === "martin" ? { ...r, ...REPONSE_MARTIN } : r));
      setBanniere({ couleur: "#7c3aed", texte: "MARTIN Pierre veut renouveler — passe demain matin" });
    });
    plus(6400, () => setBanniere(null));
    plus(8200, () => {
      setOrdos(prev => prev.some(o => o.nom === "GARCIA Manuel") ? prev : [
        { nom: "GARCIA Manuel", cv: "1 73 07 92 042 118 85", medecin: "Dr Vidal", source: "qrcode", status: "nouveau", mins: 0, isNew: true },
        ...prev,
      ]);
      setBanniere({ couleur: C.green, texte: "Nouvelle ordonnance reçue — GARCIA Manuel" });
    });
    plus(11400, () => setBanniere(null));
    return () => timers.forEach(clearTimeout);
  }, [scenario, actif]);

  const choisir = (k) => setFilter(k);
  const normalize = s => (s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"");
  const vueRappels = filter === "rappels";
  const filtered = ordos.filter(o => {
    const matchStatus = filter === "tous" || o.status === filter;
    const matchSearch = !searchQuery || normalize(o.nom).includes(normalize(searchQuery));
    return matchStatus && matchSearch;
  });
  const rappelsFiltres = rappels.filter(r => !searchQuery || normalize(r.nom).includes(normalize(searchQuery)));
  const aTraiter = rappels.filter(r => r.statut === "a_traiter" || r.statut === "a_appeler").length;

  return (
    <div style={{ background: "#fff", borderRadius: 16, overflow: "hidden", boxShadow: "0 24px 64px rgba(15,35,71,0.18), 0 2px 8px rgba(0,0,0,0.06)", border: `1px solid ${C.border}`, fontFamily: "'Inter', system-ui, sans-serif", position: "relative" }}>
      {/* Bandeau temps réel (nouvelle ordonnance, puis réponse d'un patient) */}
      {banniere && (
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 10, background: banniere.couleur, color: "#fff", padding: "7px 14px", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 8, animation: "slideDown 0.3s ease" }}>
          <span style={{ animation: "pulse 0.6s ease infinite" }}>🔔</span>
          {banniere.texte}
        </div>
      )}

      {/* Header mini dashboard */}
      <div style={{ background: C.navy, padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16 }}>💊</span>
          <span style={{ fontWeight: 800, fontSize: 13, color: "#fff" }}>OrdoMail</span>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", background: "rgba(255,255,255,0.1)", padding: "1px 6px", borderRadius: 4 }}>DÉMO LIVE</span>
        </div>
        <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 0 3px rgba(74,222,128,0.25)" }} />
      </div>

      {/* Toolbar */}
      <div style={{ padding: "8px 12px", borderBottom: `1px solid ${C.border}`, display: "flex", gap: 6, alignItems: "center", background: C.surface }}>
        {(scenario === "rappels" ? ["rappels","nouveau","imprime","tous"] : ["nouveau","imprime","tous","rappels"]).map(k => ({ rappels:["rappels","🔁 Renouvellements", aTraiter], nouveau:["nouveau","🔔 À traiter", ordos.filter(o=>o.status==="nouveau").length], imprime:["imprime","✓ Imprimées", ordos.filter(o=>o.status==="imprime").length], tous:["tous","Toutes",ordos.length] })[k]).map(([k,l,c])=>{
          const actif = filter===k, violet = k==="rappels";
          const fond = actif ? (violet ? "#7c3aed" : C.navy) : "#fff";
          return (
            <button key={k} onClick={()=>choisir(k)} style={{ padding:"4px 8px", whiteSpace:"nowrap", flexShrink:0, borderRadius:16, border:`1.5px solid ${actif?fond:(violet?"#c4b5fd":"#e0e0e0")}`, background:fond, color:actif?"#fff":(violet?"#6d28d9":"#666"), fontWeight:700, fontSize:11, cursor:"pointer", fontFamily:"inherit", display:"flex", alignItems:"center", gap:5, transition:"all 0.2s" }}>
              {l} <span style={{ background: actif?"rgba(255,255,255,0.25)":(violet?"#ede9fe":"#f0f0f0"), borderRadius:10, padding:"0 5px", fontSize:10 }}>{c}</span>
            </button>
          );
        })}
        <div style={{ position:"relative", flex:"1 1 0", minWidth:0 }}>
          <span style={{ position:"absolute", left:8, top:"50%", transform:"translateY(-50%)", fontSize:12 }}>🔍</span>
          <input value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder="Patient…" style={{ width:"100%", padding:"5px 6px 5px 22px", border:`1px solid ${C.border}`, borderRadius:8, fontSize:12, outline:"none", fontFamily:"inherit", background:"#fff", boxSizing:"border-box" }} />
        </div>
      </div>

      {/* Grille : ordonnances ou renouvellements */}
      <div style={{ padding: "10px 10px", display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8, height: 260, overflowY: "auto", alignContent: "start" }}>
        {vueRappels ? rappelsFiltres.map((r, i) => {
          const s = STATUT_INFO[r.statut];
          return (
            <div key={r.id} onMouseEnter={()=>setHighlighted("r"+i)} onMouseLeave={()=>setHighlighted(null)} style={{
              background: highlighted==="r"+i ? "#faf5ff" : "#fff", borderRadius: 10, padding: "10px 12px",
              border: `1.5px solid ${r.isNew ? "#a78bfa" : C.border}`,
              boxShadow: r.isNew ? "0 0 0 2px #7c3aed33, 0 4px 12px #7c3aed22" : "none",
              transition: "all 0.3s", animation: r.isNew ? "popIn 0.4s ease" : "none", opacity: r.statut === "termine" ? 0.7 : 1,
            }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:6, marginBottom:6 }}>
                <div style={{ display:"flex", alignItems:"center", gap:7, minWidth:0 }}>
                  <div style={{ width:28, height:28, borderRadius:"50%", background:"#7c3aed", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontWeight:900, fontSize:12, flexShrink:0 }}>{r.nom.charAt(0)}</div>
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontWeight:800, fontSize:12, color:C.ink, lineHeight:1.2 }}>{r.nom}</div>
                    <div style={{ fontSize:10, color:C.muted }}>{r.medecin}</div>
                  </div>
                </div>
                <span style={{ fontSize:9, fontWeight:700, padding:"2px 6px", borderRadius:12, background:s.bg, color:s.fg, whiteSpace:"nowrap" }}>{s.label}</span>
              </div>
              <div style={{ fontSize:10.5, color: r.statut==="a_traiter" ? "#15803d" : C.slate, fontWeight: r.statut==="a_traiter" ? 700 : 500, lineHeight:1.4 }}>{r.detail}</div>
            </div>
          );
        }) : filtered.map((o, i) => {
          const isNew = o.status === "nouveau";
          return (
            <div key={o.nom} onMouseEnter={()=>setHighlighted(i)} onMouseLeave={()=>setHighlighted(null)} style={{
              background: highlighted===i?"#f0f7ff":"#fff",
              borderRadius: 10, padding: "10px 12px",
              border: `1.5px solid ${isNew ? C.navy+"44" : C.border}`,
              boxShadow: o.isNew ? `0 0 0 2px ${C.green}44, 0 4px 12px ${C.green}18` : isNew ? `0 2px 8px ${C.navy}10` : "none",
              transition: "all 0.15s", cursor: "pointer",
              animation: o.isNew ? "popIn 0.4s ease" : "none",
            }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:6 }}>
                <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                  <div style={{ width:28, height:28, borderRadius:"50%", background:isNew?C.navy:"#90a4ae", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontWeight:900, fontSize:12, flexShrink:0 }}>{o.nom.charAt(0)}</div>
                  <div>
                    <div style={{ fontWeight:800, fontSize:12, color:C.ink, lineHeight:1.2 }}>{o.nom}</div>
                    <div style={{ fontSize:10, color:C.muted }}>{o.medecin}</div>
                  </div>
                </div>
                <span style={{ fontSize:9, fontWeight:700, padding:"2px 6px", borderRadius:12, background:isNew?"#fff8e1":"#e8f5e9", color:isNew?"#b7791f":"#2e7d32" }}>{isNew?"NEW":"✓"}</span>
              </div>
              {o.cv && <div style={{ fontSize:10, fontFamily:"monospace", color:C.green, fontWeight:700, background:C.greenL, borderRadius:5, padding:"2px 7px", display:"inline-block" }}>💳 {o.cv.slice(0,14)}…</div>}
              <div style={{ marginTop:5, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <span style={{ fontSize:9, color:C.muted }}>{o.source==="qrcode"?"📱 QR":"✉️ Email"} · {o.mins===0?"à l'instant":`il y a ${o.mins}min`}</span>
                {isNew && <button style={{ fontSize:10, padding:"2px 8px", border:"none", borderRadius:6, background:C.navy, color:"#fff", fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>🖨️</button>}
              </div>
            </div>
          );
        })}
      </div>
      {vueRappels && (
        <div style={{ borderTop:`1px solid ${C.border}`, background:"#faf5ff", padding:"7px 12px", fontSize:10.5, color:"#6d28d9", fontWeight:600 }}>
          🔁 Le SMS part tout seul avant l'échéance · le patient répond en un clic
        </div>
      )}
    </div>
  );
}

function FeaturesSection() {
  const ref = useRef(); const visible = useFadeIn(ref);
  const features = [
    { icon: "🔍", title: "Identification en 2 secondes", desc: "Le patient dit son nom au comptoir. Le vendeur le repère instantanément dans la grille. Fini de fouiller dans Gmail.", accent: C.navy },
    { icon: "📱", title: "QR Code + Badge NFC", desc: "Le patient scanne ou approche son téléphone. Son ordonnance électronique arrive directement dans votre tableau de bord en moins de 5 secondes.", accent: "#7c3aed" },
    { icon: "✉️", title: "Transfert email simplifié", desc: "Si le médecin envoie l'ordonnance par email, le patient transfère d'un clic à l'adresse dédiée de la pharmacie. Zéro ressaisie.", accent: "#0369a1" },
    { icon: "🔔", title: "Rappels de renouvellement", desc: "Le patient est relancé par SMS avant l'échéance et répond en un clic : vous préparez avant qu'il arrive, sans téléphoner à personne. Plan Performance.", accent: C.green, ancre: "renouvellements" },
    { icon: "🖨️", title: "Impression avec confirmation", desc: "Un clic → boîte d'impression → confirmation que le papier est sorti. L'ordonnance est marquée traitée uniquement après validation.", accent: C.amber },
    { icon: "🗒️", title: "Journal d'audit complet", desc: "Chaque consultation, chaque impression, chaque connexion est tracée. Export CSV pour les contrôles. Aucune donnée médicale dans les logs.", accent: "#15803d" },
    { icon: "🎁", title: "Offres & promotions patient", desc: "Diffusez vos promotions et offres de fidélité dans la salle d'attente numérique pendant que le patient patiente. Plan Pro.", accent: "#4c1d95" },
  ];
  return (
    <section ref={ref} style={{ padding:"52px 16px", background:"#fff" }}>
      <div style={{ maxWidth:1060, margin:"0 auto" }}>
        <div style={{ textAlign:"center", marginBottom:52 }}>
          <div style={{ display:"inline-block", background:C.navyL, color:C.navy, fontSize:11, fontWeight:800, letterSpacing:1.5, padding:"5px 14px", borderRadius:20, marginBottom:16 }}>FONCTIONNALITÉS</div>
          <h2 style={{ fontSize:"clamp(24px, 6vw, 38px)", fontWeight:900, color:C.ink, margin:"0 0 14px", lineHeight:1.15 }}>Tout ce dont une pharmacie a besoin</h2>
          <p style={{ fontSize:17, color:C.slate, maxWidth:520, margin:"0 auto" }}>Conçu pour le comptoir, pas pour un bureau informatique.</p>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap:16, opacity:visible?1:0, transform:visible?"none":"translateY(20px)", transition:"all 0.6s ease" }}>
          {features.map((f,i)=>(
            <div key={i} style={{ background:C.surface, borderRadius:14, padding:"22px 20px", border:`1px solid ${C.border}`, transition:"box-shadow 0.2s", cursor:"default" }}
              onMouseEnter={e=>e.currentTarget.style.boxShadow=`0 8px 28px ${f.accent}22`}
              onMouseLeave={e=>e.currentTarget.style.boxShadow="none"}>
              <div style={{ width:44, height:44, borderRadius:12, background:f.accent+"18", display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, marginBottom:14 }}>{f.icon}</div>
              <div style={{ fontWeight:800, fontSize:16, color:C.ink, marginBottom:8 }}>{f.title}</div>
              <div style={{ fontSize:14, color:C.slate, lineHeight:1.65 }}>{f.desc}</div>
              {f.ancre && (
                <button onClick={() => document.getElementById(f.ancre)?.scrollIntoView({ behavior:"smooth" })}
                  style={{ marginTop:10, padding:0, background:"none", border:"none", color:f.accent, fontWeight:700, fontSize:13.5, cursor:"pointer", fontFamily:"inherit" }}>
                  Voir comment ça marche ↓
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Renouvellements (13/11/2026, demande titulaire) ──────────────────────
// Met en avant les rappels de renouvellement (plan Performance). Les textes
// reprennent le comportement réel : SMS ~7 jours avant la date (voir
// AideModal), message de buildRappelMessage (rappelLogic.ts), choix patient de
// RappelChoixPage.jsx, relance J+3 puis "à appeler" (RELANCE/ESCALADE_DELAI_JOURS).
// Garder ces textes alignés si le fonctionnement change.
const RENOUV_ETAPES = [
  { icon: "🖱️", title: "Un clic au comptoir", desc: "Créez le rappel depuis l'ordonnance, avec l'accord du patient. Son nom et son médecin sont repris de l'ordonnance : ajoutez son téléphone, c'est prêt." },
  { icon: "💬", title: "Le SMS part tout seul", desc: "Environ 7 jours avant l'échéance, sans que personne n'y pense. Sans réponse, une relance, puis le patient passe dans votre liste à appeler." },
  { icon: "👆", title: "Le patient répond en un clic", desc: "Sans application : tout renouveler, renouvellement partiel ou rien, et il choisit son créneau de retrait." },
  { icon: "📦", title: "Vous préparez à l'avance", desc: "La réponse s'affiche en temps réel. Vous préparez, rangez en casier, et anticipez les ruptures avant son passage." },
];

function RenouvellementDemo() {
  // 0 : SMS reçu · 1 : choix du patient · 2 : créneau · 3 : côté pharmacie
  const [etape, setEtape] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setEtape(e => (e + 1) % 4), 2600);
    return () => clearInterval(t);
  }, []);
  const choix = [["✅", "Tout renouveler"], ["🔶", "Renouvellement partiel"], ["🚫", "Ne rien prendre"]];
  const creneaux = [["🌅", "Ce matin"], ["☀️", "Cet après-midi"], ["🌤️", "Demain matin"], ["🌇", "Demain après-midi"]];
  const ecranPatient = etape < 3;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
      {/* Téléphone du patient */}
      <div style={{ width: "100%", maxWidth: 300, background: "#0f172a", borderRadius: 34, padding: 10, boxShadow: "0 24px 60px rgba(15,35,71,0.28)" }}>
        <div style={{ background: "#f8fafc", borderRadius: 26, minHeight: 330, padding: "18px 14px", fontFamily: "'Inter', system-ui, sans-serif", position: "relative", overflow: "hidden" }}>
          <div style={{ width: 70, height: 6, borderRadius: 3, background: "#cbd5e1", margin: "0 auto 14px" }} />
          {etape === 0 && (
            <div key="sms" style={{ animation: "popIn 0.4s ease" }}>
              <div style={{ fontSize: 11, color: C.muted, textAlign: "center", marginBottom: 10 }}>SMS · maintenant</div>
              <div style={{ background: "#e2e8f0", borderRadius: "16px 16px 16px 4px", padding: "11px 13px", fontSize: 12.5, lineHeight: 1.5, color: C.ink }}>
                Bonjour M/Mme Pierre MARTIN,<br />
                Pharmacie du Centre vous informe que votre renouvellement d'ordonnance est prévu prochainement.<br />
                Cliquez ici pour nous dire ce que vous souhaitez faire :<br />
                <span style={{ color: "#2563eb", textDecoration: "underline" }}>ordomail.fr/r/k3F9a</span>
              </div>
            </div>
          )}
          {etape === 1 && (
            <div key="choix" style={{ animation: "popIn 0.4s ease" }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: C.ink, marginBottom: 4 }}>Pharmacie du Centre</div>
              <div style={{ fontSize: 12, color: C.slate, marginBottom: 12, lineHeight: 1.5 }}>Le renouvellement de votre ordonnance est prévu prochainement. Que souhaitez-vous faire ?</div>
              {choix.map(([e, l], i) => (
                <div key={l} style={{ display: "flex", gap: 8, alignItems: "center", padding: "10px 12px", marginBottom: 7, borderRadius: 12, fontSize: 13, fontWeight: 700, border: `1.5px solid ${i === 0 ? C.green : C.border}`, background: i === 0 ? C.greenL : "#fff", color: C.ink }}>
                  <span>{e}</span>{l}
                </div>
              ))}
            </div>
          )}
          {etape === 2 && (
            <div key="creneau" style={{ animation: "popIn 0.4s ease" }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: C.ink, marginBottom: 12 }}>Quand passez-vous le récupérer ?</div>
              {creneaux.map(([e, l], i) => (
                <div key={l} style={{ display: "flex", gap: 8, alignItems: "center", padding: "9px 12px", marginBottom: 7, borderRadius: 12, fontSize: 13, fontWeight: 700, border: `1.5px solid ${i === 2 ? C.green : C.border}`, background: i === 2 ? C.greenL : "#fff", color: C.ink }}>
                  <span>{e}</span>{l}
                </div>
              ))}
            </div>
          )}
          {etape === 3 && (
            <div key="merci" style={{ animation: "popIn 0.4s ease", textAlign: "center", paddingTop: 50 }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>✅</div>
              <div style={{ fontWeight: 800, fontSize: 15, color: C.ink, marginBottom: 6 }}>Merci !</div>
              <div style={{ fontSize: 12.5, color: C.slate, lineHeight: 1.5 }}>Votre pharmacie a bien été informée de votre choix.</div>
            </div>
          )}
        </div>
      </div>
      {/* Côté pharmacie : la réponse arrive en temps réel */}
      <div style={{ width: "100%", maxWidth: 340, background: "#fff", borderRadius: 14, border: `1.5px solid ${ecranPatient ? C.border : C.green}`, boxShadow: ecranPatient ? "0 4px 14px rgba(15,35,71,0.06)" : `0 0 0 3px ${C.green}22, 0 8px 24px ${C.green}22`, padding: "11px 14px", transition: "all 0.3s", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: "50%", background: C.navy, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 13, flexShrink: 0 }}>M</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 13, color: C.ink }}>MARTIN Pierre</div>
          <div style={{ fontSize: 11.5, color: ecranPatient ? C.muted : C.green, fontWeight: 700 }}>
            {ecranPatient ? "💬 SMS envoyé · en attente de réponse" : "✅ Tout renouveler · Demain matin"}
          </div>
        </div>
        <span style={{ fontSize: 9.5, fontWeight: 800, color: C.muted, letterSpacing: 0.5 }}>VOTRE ÉCRAN</span>
      </div>
    </div>
  );
}

function RenouvellementsSection({ onCTA }) {
  const ref = useRef(); const visible = useFadeIn(ref);
  return (
    <section ref={ref} style={{ padding: "60px 16px", background: `linear-gradient(180deg, ${C.greenL} 0%, #fff 100%)` }}>
      <div style={{ maxWidth: 1060, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))", gap: 40, alignItems: "center", opacity: visible ? 1 : 0, transform: visible ? "none" : "translateY(20px)", transition: "all 0.6s ease" }}>
        <div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            <span style={{ background: C.green, color: "#fff", fontSize: 11, fontWeight: 800, letterSpacing: 1.5, padding: "5px 14px", borderRadius: 20 }}>RENOUVELLEMENTS</span>
            <span style={{ background: "#ede9fe", color: "#4c1d95", fontSize: 11, fontWeight: 800, letterSpacing: 0.5, padding: "5px 12px", borderRadius: 20 }}>🏥 Plan Performance</span>
          </div>
          <h2 style={{ fontSize: "clamp(24px, 6vw, 38px)", fontWeight: 900, color: C.ink, margin: "0 0 14px", lineHeight: 1.15 }}>
            Récupérez les renouvellements<br />qui vous échappent.
          </h2>
          <p style={{ fontSize: 17, color: C.slate, lineHeight: 1.7, margin: "0 0 26px", maxWidth: 500 }}>
            Un renouvellement ne se perd pas parce que le patient oublie : il se perd quand il va le faire ailleurs, faute d'avoir été retenu. OrdoMail le contacte au nom de votre pharmacie avant l'échéance, et vous dit ce qu'il veut avant qu'il passe la porte. Il revient chez vous.
          </p>
          <div style={{ display: "grid", gap: 14, marginBottom: 26 }}>
            {RENOUV_ETAPES.map((s, i) => (
              <div key={s.title} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: "#fff", border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19, flexShrink: 0, boxShadow: "0 2px 6px rgba(15,35,71,0.06)" }}>{s.icon}</div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15, color: C.ink, marginBottom: 3 }}><span style={{ color: C.green }}>{i + 1}.</span> {s.title}</div>
                  <div style={{ fontSize: 14, color: C.slate, lineHeight: 1.6 }}>{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 22 }}>
            {["📱 Sans application patient", "📞 SMS ou appel : personne n'est oublié", "💶 100 SMS inclus par mois"].map(t => (
              <span key={t} style={{ fontSize: 12.5, fontWeight: 700, color: C.ink, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 20, padding: "6px 12px" }}>{t}</span>
            ))}
          </div>
          <button onClick={onCTA} style={{ padding: "13px 26px", border: "none", borderRadius: 12, background: C.green, color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer", fontFamily: "inherit", boxShadow: `0 4px 16px ${C.green}44` }}>
            Essayer les renouvellements 30 jours →
          </button>
        </div>
        <RenouvellementDemo />
      </div>
    </section>
  );
}

function WorkflowSection() {
  const ref = useRef(); const visible = useFadeIn(ref);
  const steps = [
    { who:"Patient", icon:"📱", title:"Il envoie son ordonnance", desc:"Envoi depuis le QR code affiché à l'accueil, ou transfert direct de l'email reçu de son médecin. 10 secondes.", color:C.green },
    { who:"OrdoMail", icon:"🤖", title:"L'IA extrait les données", desc:"Nom, numéro de Sécurité Sociale, médecin, médicaments. L'ordonnance apparaît instantanément dans le tableau de bord.", color:C.navy },
    { who:"Pharmacien", icon:"🖨️", title:"Le vendeur retrouve et imprime", desc:"Le patient dit son nom. Le vendeur le repère en 2 secondes dans la grille. Il imprime et confirme.", color:"#7c3aed" },
  ];
  return (
    <section ref={ref} style={{ padding:"52px 16px", background:`linear-gradient(180deg, ${C.surface} 0%, #fff 100%)` }}>
      <div style={{ maxWidth:900, margin:"0 auto" }}>
        <div style={{ textAlign:"center", marginBottom:52 }}>
          <div style={{ display:"inline-block", background:C.greenL, color:C.green, fontSize:11, fontWeight:800, letterSpacing:1.5, padding:"5px 14px", borderRadius:20, marginBottom:16 }}>COMMENT ÇA MARCHE</div>
          <h2 style={{ fontSize:38, fontWeight:900, color:C.ink, margin:0, lineHeight:1.15 }}>De l'envoi à l'impression<br/>en moins d'une minute</h2>
        </div>
        <div ref={ref} style={{ display:"flex", flexWrap:"wrap", gap:0, alignItems:"stretch", opacity:visible?1:0, transition:"opacity 0.7s ease" }}>
          {steps.map((s,i)=>(
            <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center" }}>
              {/* Ligne connecteur */}
              <div style={{ display:"flex", alignItems:"center", width:"100%", marginBottom:20 }}>
                <div style={{ flex:1, height:2, background: i===0?"transparent":s.color+"44" }} />
                <div style={{ width:56, height:56, borderRadius:"50%", background:s.color, display:"flex", alignItems:"center", justifyContent:"center", fontSize:24, flexShrink:0, boxShadow:`0 4px 16px ${s.color}44` }}>{s.icon}</div>
                <div style={{ flex:1, height:2, background: i===steps.length-1?"transparent":steps[i+1]?.color+"44" }} />
              </div>
              <div style={{ textAlign:"center", padding:"0 16px" }}>
                <div style={{ fontSize:10, fontWeight:800, color:s.color, letterSpacing:1.5, marginBottom:6 }}>{s.who.toUpperCase()}</div>
                <div style={{ fontWeight:800, fontSize:16, color:C.ink, marginBottom:8 }}>{s.title}</div>
                <div style={{ fontSize:14, color:C.slate, lineHeight:1.65 }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SecuritySection() {
  const ref = useRef(); const visible = useFadeIn(ref);
  return (
    <section ref={ref} style={{ padding:"52px 16px", background:C.navyD }}>
      <div style={{ maxWidth:960, margin:"0 auto", display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(min(100%, 420px), 1fr))", gap:32, alignItems:"center", opacity:visible?1:0, transition:"opacity 0.7s ease" }}>
        <div>
          <div style={{ display:"inline-block", background:"rgba(255,255,255,0.1)", color:"rgba(255,255,255,0.7)", fontSize:11, fontWeight:800, letterSpacing:1.5, padding:"5px 14px", borderRadius:20, marginBottom:16 }}>CONFORMITÉ & SÉCURITÉ</div>
          <h2 style={{ fontSize:34, fontWeight:900, color:"#fff", margin:"0 0 18px", lineHeight:1.2 }}>Conçu pour les données de santé</h2>
          <p style={{ fontSize:16, color:"rgba(255,255,255,0.6)", lineHeight:1.75, marginBottom:28 }}>
            Les ordonnances sont des données de santé au sens du RGPD. Gmail et Outlook ne sont pas certifiés HDS. OrdoMail est architecturé pour la conformité dès le premier jour.
          </p>
          <div style={{ background:"rgba(230,168,23,0.12)", border:"1px solid rgba(230,168,23,0.3)", borderRadius:10, padding:"12px 16px", fontSize:13, color:"#fcd34d", lineHeight:1.6 }}>
            ⚠️ La quasi-totalité des pharmacies françaises utilise des boîtes mail génériques non adaptées à cet usage.
          </div>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap:12 }}>
          {[
            ["🔒","Chiffrement total","TLS 1.3 en transit, AES-256 au repos"],
            ["🗒️","Logs immuables","Traçabilité complète, aucune donnée médicale journalisée"],
            ["👤","OCR souverain","Extraction IA locale — l'ordonnance ne quitte pas vos serveurs"],
          ].map(([icon,title,desc])=>(
            <div key={title} style={{ background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:12, padding:"16px 14px" }}>
              <div style={{ fontSize:22, marginBottom:8 }}>{icon}</div>
              <div style={{ fontWeight:700, fontSize:13, color:"#fff", marginBottom:4 }}>{title}</div>
              <div style={{ fontSize:12, color:"rgba(255,255,255,0.45)", lineHeight:1.5 }}>{desc}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function PricingSection({ onGoToPricing }) {
  const ref = useRef(); const visible = useFadeIn(ref);
  const [billing, setBilling] = useState("monthly");
  return (
    <section ref={ref} style={{ padding:"52px 16px", background:"#fff" }}>
      <div style={{ maxWidth:980, margin:"0 auto", opacity:visible?1:0, transition:"opacity 0.7s ease" }}>
        <div style={{ textAlign:"center", marginBottom:44 }}>
          <div style={{ display:"inline-block", background:C.navyL, color:C.navy, fontSize:11, fontWeight:800, letterSpacing:1.5, padding:"5px 14px", borderRadius:20, marginBottom:16 }}>TARIFS</div>
          <h2 style={{ fontSize:38, fontWeight:900, color:C.ink, margin:"0 0 12px" }}>Simple, transparent, sans surprise</h2>
          <p style={{ fontSize:16, color:C.slate, marginBottom:24 }}>30 jours gratuits · Sans carte bancaire · Résiliable à tout moment</p>
          {/* Toggle billing */}
          <div style={{ display:"inline-flex", background:C.surface, borderRadius:10, padding:3, gap:3 }}>
            {[["monthly","Mensuel"],["annual","Annuel (2 mois offerts)"]].map(([k,l])=>(
              <button key={k} onClick={()=>setBilling(k)} style={{ padding:"7px 18px", border:"none", borderRadius:8, cursor:"pointer", fontFamily:"inherit", fontSize:13, fontWeight:billing===k?700:500, background:billing===k?"#fff":"transparent", color:billing===k?C.ink:C.muted, boxShadow:billing===k?"0 1px 4px rgba(0,0,0,0.08)":"none", transition:"all 0.15s" }}>{l}</button>
            ))}
          </div>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap:14, marginBottom:24 }}>
          {PLANS.map(p=>{
            // priceAnnual = total réel facturé une fois par an (10 mois payés
            // pour 12 mois d'usage, "2 mois offerts" — voir Phase 1 chantier
            // tarification, aligné sur le Price Stripe price_{plan}_annual réel).
            // Ne JAMAIS recalculer depuis price×N ici : le repli ci-dessus et
            // loadPlanLimits() alimentent tous deux priceAnnual directement.
            const price = billing==="annual" ? Math.round(p.priceAnnual/12) : p.price;
            return (
              <div key={p.id} style={{ borderRadius:16, padding:"24px 22px", border:p.popular?`2px solid ${p.color}`:`2px solid ${C.border}`, background:"#fff", boxShadow:p.popular?`0 8px 32px ${p.color}20`:"none", position:"relative", display:"flex", flexDirection:"column" }}>
                {p.popular && <div style={{ position:"absolute", top:-12, left:"50%", transform:"translateX(-50%)", background:p.color, color:"#fff", fontSize:10, fontWeight:800, padding:"3px 12px", borderRadius:20, letterSpacing:0.5 }}>⭐ RECOMMANDÉ</div>}
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
                  <div style={{ width:34,height:34,borderRadius:9,background:p.color+"18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18 }}>{p.icon}</div>
                  <span style={{ fontWeight:800, fontSize:17, color:C.ink }}>{p.name}</span>
                </div>
                {p.positioning && <p style={{ fontSize:12.5, color:C.slate, lineHeight:1.6, margin:"0 0 14px" }}>{p.positioning}</p>}
                <div style={{ marginBottom:16 }}>
                  <span style={{ fontSize:38, fontWeight:900, color:p.color }}>{price}</span>
                  <span style={{ fontSize:15, color:C.muted, fontWeight:400 }}> € TTC/mois</span>
                  <div style={{ fontSize:12.5, color:C.muted, marginTop:2 }}>soit {toHT(price).toLocaleString("fr-FR",{minimumFractionDigits:2,maximumFractionDigits:2})} € HT/mois</div>
                  {billing==="annual" && (
                    <>
                      <div style={{ fontSize:12, color:"#16a34a", fontWeight:600, marginTop:4 }}>−{p.price-price}€/mois vs mensuel</div>
                      <div style={{ fontSize:12, color:C.muted, marginTop:2 }}>soit {p.priceAnnual}€ TTC facturés une fois par an (2 mois offerts)</div>
                    </>
                  )}
                </div>
                <button onClick={onGoToPricing} style={{ width:"100%", padding:"11px", borderRadius:10, background:p.popular?p.color:C.surface, color:p.popular?"#fff":p.color, fontWeight:700, fontSize:14, cursor:"pointer", fontFamily:"inherit", border:p.popular?"none":`1.5px solid ${p.color}22`, marginBottom:18, transition:"opacity 0.15s" }}
                  onMouseEnter={e=>e.currentTarget.style.opacity="0.85"} onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
                  Commencer l'essai gratuit
                </button>
                {p.includesPrev && (
                  <div style={{ fontSize:12, fontWeight:700, color:C.ink, marginBottom:9, fontStyle:"italic" }}>
                    Tout ce qui est inclus dans {p.includesPrev}, plus :
                  </div>
                )}
                {p.features.map((f,i)=>(
                  <div key={i} style={{ display:"flex", gap:8, marginBottom:9, fontSize:13, color:C.slate, lineHeight:1.5 }}>
                    <span style={{ color:p.color, fontWeight:700, fontSize:14, flexShrink:0 }}>✓</span>{f}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
        <div style={{ textAlign:"center" }}>
          <button onClick={onGoToPricing} style={{ background:"none", border:"none", cursor:"pointer", color:C.navy, fontWeight:700, fontSize:14, textDecoration:"underline", fontFamily:"inherit" }}>
            Voir tous les détails et comparer les plans →
          </button>
        </div>
      </div>
    </section>
  );
}

function TestimonialsSection() {
  const ref = useRef(); const visible = useFadeIn(ref);
  const quotes = [
    { text:"Avant, je cherchais les ordonnances dans ma boîte mail entre deux clients. Maintenant tout est là, en un coup d'œil.", author:"Dr M. Fontaine", role:"Pharmacien titulaire, Paris 9e" },
    { text:"L'extraction automatique du numéro de sécu est bluffante. Ça nous fait gagner facilement 30 minutes par jour.", author:"Sylvie R.", role:"Préparatrice en pharmacie, Lyon" },
    { text:"Le QR code affiché à l'accueil a changé la donne. Les patients envoient leur ordonnance avant même d'arriver.", author:"Thomas L.", role:"Pharmacien adjoint, Bordeaux" },
  ];
  return (
    <section ref={ref} style={{ padding:"52px 16px", background:C.surface }}>
      <div style={{ maxWidth:980, margin:"0 auto", opacity:visible?1:0, transition:"opacity 0.7s ease" }}>
        <div style={{ textAlign:"center", marginBottom:44 }}>
          <div style={{ display:"inline-block", background:C.greenL, color:C.green, fontSize:11, fontWeight:800, letterSpacing:1.5, padding:"5px 14px", borderRadius:20, marginBottom:16 }}>TÉMOIGNAGES</div>
          <h2 style={{ fontSize:"clamp(22px, 5vw, 34px)", fontWeight:900, color:C.ink, margin:0 }}>Ce qu'en disent les pharmaciens</h2>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap:14 }}>
          {quotes.map((q,i)=>(
            <div key={i} style={{ background:"#fff", borderRadius:14, padding:"24px 20px", border:`1px solid ${C.border}`, display:"flex", flexDirection:"column", gap:16 }}>
              <div style={{ fontSize:28, color:C.navy, lineHeight:1, fontFamily:"Georgia,serif" }}>"</div>
              <p style={{ fontSize:15, color:C.slate, lineHeight:1.7, margin:0, flex:1, fontStyle:"italic" }}>{q.text}</p>
              <div>
                <div style={{ fontWeight:700, fontSize:14, color:C.ink }}>{q.author}</div>
                <div style={{ fontSize:12, color:C.muted, marginTop:2 }}>{q.role}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CTASection({ onCTA, onContact }) {
  const ref = useRef(); const visible = useFadeIn(ref);
  return (
    <section ref={ref} style={{ padding:"52px 16px", background:`linear-gradient(135deg, ${C.navyD} 0%, ${C.navy} 60%, ${C.green} 150%)` }}>
      <div style={{ maxWidth:640, margin:"0 auto", textAlign:"center", opacity:visible?1:0, transition:"opacity 0.7s ease" }}>
        <div style={{ fontSize:40, marginBottom:18 }}>💊</div>
        <h2 style={{ fontSize:"clamp(24px, 6vw, 38px)", fontWeight:900, color:"#fff", margin:"0 0 14px", lineHeight:1.2 }}>Prêt à garder chaque renouvellement chez vous ?</h2>
        <p style={{ fontSize:17, color:"rgba(255,255,255,0.65)", marginBottom:32, lineHeight:1.65 }}>30 jours gratuits. Installation en moins de 10 minutes. Aucune carte bancaire requise.</p>
        <div style={{ display:"flex", gap:12, justifyContent:"center", flexWrap:"wrap" }}>
          <button onClick={()=>onCTA("trial")} style={{ padding:"14px 30px", border:"none", borderRadius:12, background:"#fff", color:C.navy, fontWeight:800, fontSize:16, cursor:"pointer", fontFamily:"inherit", boxShadow:"0 4px 16px rgba(0,0,0,0.2)", transition:"transform 0.15s" }}
            onMouseEnter={e=>e.currentTarget.style.transform="translateY(-2px)"} onMouseLeave={e=>e.currentTarget.style.transform="none"}>
            Commencer gratuitement →
          </button>
          <button onClick={()=>onCTA("demo")} style={{ padding:"14px 28px", border:"2px solid rgba(255,255,255,0.3)", borderRadius:12, background:"transparent", color:"#fff", fontWeight:700, fontSize:16, cursor:"pointer", fontFamily:"inherit" }}>
            Voir la démo
          </button>
        </div>
        <div style={{ marginTop:20, fontSize:13, color:"rgba(255,255,255,0.4)", display:"flex", gap:18, justifyContent:"center", flexWrap:"wrap" }}>
          <span>✓ Sans engagement</span>
          <span>✓ Données chiffrées</span>
          <span>✓ Support inclus</span>
        </div>
        {onContact && (
          <button onClick={onContact} style={{ marginTop:22, background:"none", border:"none", color:"#fff", fontSize:15, fontWeight:600, textDecoration:"underline", cursor:"pointer", fontFamily:"inherit" }}>
            Une question avant de vous lancer ? Écrivez-nous →
          </button>
        )}
      </div>
    </section>
  );
}

function Footer({ onNav }) {
  return (
    <footer style={{ background:C.ink, padding:"44px 24px 28px", fontFamily:"'Inter', system-ui, sans-serif" }}>
      <div style={{ maxWidth:1060, margin:"0 auto" }}>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(min(100%, 160px), 1fr))", gap:24, marginBottom:32 }}>
          <div>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
              <span style={{ fontSize:20 }}>💊</span>
              <span style={{ fontWeight:900, fontSize:16, color:"#fff" }}>OrdoMail</span>
            </div>
            <p style={{ fontSize:13, color:"#64748b", lineHeight:1.7, maxWidth:260 }}>La plateforme qui simplifie et sécurise la réception des ordonnances dans les pharmacies françaises.</p>
          </div>
          {[
            ["Produit",["Fonctionnalités","Tarifs","Sécurité","Démo"]],
            ["Légal",["CGU","Politique de confidentialité","Mentions légales","RGPD"]],
            ["Contact",["Nous écrire","Support","Partenariats","Presse"]],
          ].map(([title, links])=>(
            <div key={title}>
              <div style={{ fontSize:12, fontWeight:700, color:"#e2e8f0", letterSpacing:1, marginBottom:14 }}>{title.toUpperCase()}</div>
              {links.map(l=>(
                <div key={l} style={{ marginBottom:8 }}>
                  <a href="#" onClick={e=>{e.preventDefault();onNav(l)}} style={{ fontSize:13, color:"#64748b", textDecoration:"none" }}>{l}</a>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div style={{ borderTop:"1px solid #1e293b", paddingTop:20, display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8 }}>
          <span style={{ fontSize:12, color:"#334155" }}>© 2025 OrdoMail — Tous droits réservés</span>
          <button onClick={() => onNav("backoffice")} style={{
            background:"none", border:"1px solid #1e293b", borderRadius:6,
            color:"#334155", fontSize:11, fontWeight:600, cursor:"pointer",
            padding:"4px 10px", fontFamily:"inherit",
          }}>
            🛡️ Espace OrdoMail Business
          </button>
        </div>
      </div>
    </footer>
  );
}

// ─── Hero en carrousel (14/11/2026, demande titulaire) ─────────────────────
// Diapo 1 : les renouvellements (ce qui fait vendre OrdoMail, en premier).
// Diapo 2 : le hero d'origine « Vos ordonnances, enfin organisées ».
// Les deux diapos sont superposées dans la même cellule de grille : la
// hauteur du hero est celle de la plus haute, la page ne saute donc pas au
// changement. Défilement automatique toutes les 10 s, en pause au survol ou
// au focus clavier, arrêté dès que le visiteur choisit lui-même une diapo,
// et désactivé si le système demande de réduire les animations.
const HERO_DELAI_MS = 10000;

function HeroTexte({ badge, titre1, titre2, texte, avantages, stats, Titre, onEssai, onDemo }) {
  return (
    <div>
      <div style={{ display:"inline-flex", alignItems:"center", gap:8, background:"rgba(255,255,255,0.1)", border:"1px solid rgba(255,255,255,0.15)", borderRadius:20, padding:"5px 14px", marginBottom:14 }}>
        <span style={{ width:7, height:7, borderRadius:"50%", background:"#4ade80", display:"inline-block" }} />
        <span style={{ fontSize:12, fontWeight:700, color:"rgba(255,255,255,0.75)", letterSpacing:0.5 }}>{badge}</span>
      </div>
      <Titre style={{ fontSize:"clamp(28px, 5.2vw, 42px)", fontWeight:900, color:"#fff", margin:"0 0 12px", lineHeight:1.08, letterSpacing:"-0.5px" }}>
        {titre1}<br />
        <span style={{ color:"#86efac" }}>{titre2}</span>
      </Titre>
      <p style={{ fontSize:16.5, color:"rgba(255,255,255,0.65)", lineHeight:1.6, marginBottom: avantages ? 16 : 26, maxWidth:500 }}>{texte}</p>
      {avantages && (
        <div style={{ display:"grid", gap:7, marginBottom:20, maxWidth:500 }}>
          {avantages.map(([i,t,d])=>(
            <div key={t} style={{ display:"flex", gap:12, alignItems:"flex-start", background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:11, padding:"7px 12px" }}>
              <span style={{ fontSize:18, lineHeight:1.2 }}>{i}</span>
              <div>
                <div style={{ fontWeight:800, fontSize:14.5, color:"#fff" }}>{t}</div>
                <div style={{ fontSize:13, color:"rgba(255,255,255,0.6)", lineHeight:1.4 }}>{d}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      <div style={{ display:"flex", gap:12, flexWrap:"wrap", marginBottom:16 }}>
        <button onClick={onEssai} style={{ padding:"12px 24px", border:"none", borderRadius:12, background:"#fff", color:C.navy, fontWeight:800, fontSize:15.5, cursor:"pointer", fontFamily:"inherit", boxShadow:"0 4px 20px rgba(0,0,0,0.2)", display:"flex", alignItems:"center", gap:8 }}>
          Essai gratuit 30 jours
          <span style={{ fontSize:14, opacity:0.6 }}>→</span>
        </button>
        <button onClick={onDemo} style={{ padding:"12px 22px", border:"2px solid rgba(255,255,255,0.25)", borderRadius:12, background:"transparent", color:"#fff", fontWeight:700, fontSize:15.5, cursor:"pointer", fontFamily:"inherit" }}>
          Voir la démo live
        </button>
      </div>
      <div className="hero-stats" style={{ display:"flex", gap:"6px 18px", flexWrap:"wrap" }}>
        {stats.map(([v,l])=>(
          <div key={l} style={{ display:"flex", alignItems:"center", gap:7 }}>
            <span style={{ fontWeight:900, fontSize:14.5, color:"#86efac" }}>{v}</span>
            <span style={{ fontSize:12.5, color:"rgba(255,255,255,0.45)" }}>{l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HeroCarousel({ heroRef, heroVisible, onGoToCheckout, onGoToApp }) {
  const [diapo, setDiapo] = useState(0);
  const [tour, setTour] = useState(0);          // relance l'animation de la démo à chaque affichage
  const [pause, setPause] = useState(false);    // survol / focus
  const [auto, setAuto] = useState(true);       // false dès que le visiteur a choisi une diapo
  const toucheX = useRef(null);
  const demo = () => onGoToApp("demo");

  const diapos = [
    {
      nom: "Renouvellements",
      scenario: "rappels",
      legende: "↑ Démo interactive — dans 3 secondes, un patient répond à son rappel de renouvellement",
      texte: (
        <HeroTexte Titre="h1" badge="Renouvellements d'ordonnance automatiques"
          titre1="Chaque renouvellement" titre2="revient chez vous."
          texte="Avant l'échéance de leur ordonnance, OrdoMail relance vos patients par SMS. Ils répondent en un clic, vous commandez à l'avance : la vente reste chez vous et le traitement est prêt quand ils arrivent."
          avantages={[
            ["💶","Du chiffre d'affaires en plus","Les renouvellements qui partaient chez le voisin restent chez vous."],
            ["😌","La tranquillité pour vos patients","Ils n'ont plus à y penser : la pharmacie s'en occupe."],
            ["📦","Zéro rupture de stock","Vous savez qui vient et quand : vous commandez à l'avance."],
          ]}
          stats={[["30j","Essai gratuit"],["<1min","Installation"],["📱","Sans application patient"],["🔐","Données chiffrées"]]}
          onEssai={() => onGoToCheckout("pro","monthly")} onDemo={demo} />
      ),
    },
    {
      nom: "Ordonnances",
      scenario: "ordos",
      legende: "↑ Démo interactive — une nouvelle ordonnance arrive dans 3 secondes",
      texte: (
        <HeroTexte Titre="h2" badge="Ordonnances reçues en temps réel"
          titre1="Vos ordonnances," titre2="enfin organisées."
          texte="OrdoMail remplace la boîte email généraliste par un tableau de bord dédié. Le patient envoie, vous imprimez. En moins d'une minute."
          stats={[["30j","Essai gratuit"],["<1min","Installation"],["🔔","Renouvellements par SMS"],["🔐","Données chiffrées"]]}
          onEssai={() => onGoToCheckout("standard","monthly")} onDemo={demo} />
      ),
    },
  ];

  const aller = (i, parVisiteur) => {
    const n = (i + diapos.length) % diapos.length;
    if (parVisiteur) setAuto(false);
    setDiapo(n);
    setTour(t => t + 1);
  };

  useEffect(() => {
    let reduit = false;
    try { reduit = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { /* navigateur ancien */ }
    if (!auto || pause || reduit) return;
    const t = setTimeout(() => { if (!document.hidden) aller(diapo + 1, false); }, HERO_DELAI_MS);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diapo, auto, pause]);

  const fleche = (sens) => ({
    width:36, height:36, borderRadius:"50%", border:"1px solid rgba(255,255,255,0.25)", background:"rgba(255,255,255,0.08)",
    color:"#fff", fontSize:18, cursor:"pointer", fontFamily:"inherit", display:"flex", alignItems:"center", justifyContent:"center",
    order: sens === "prec" ? 0 : 2,
  });

  return (
    <section ref={heroRef} aria-roledescription="carrousel" aria-label="Présentation d'OrdoMail"
      onMouseEnter={() => setPause(true)} onMouseLeave={() => setPause(false)}
      onFocus={() => setPause(true)} onBlur={() => setPause(false)}
      onTouchStart={e => { toucheX.current = e.touches[0].clientX; }}
      onTouchEnd={e => {
        if (toucheX.current == null) return;
        const dx = e.changedTouches[0].clientX - toucheX.current;
        toucheX.current = null;
        if (Math.abs(dx) > 50) aller(diapo + (dx < 0 ? 1 : -1), true);
      }}
      style={{ minHeight:"100vh", background:`linear-gradient(160deg, ${C.navyD} 0%, ${C.navy} 55%, #1a5c4a 120%)`, padding:"72px 16px 18px", display:"flex", flexDirection:"column", justifyContent:"center" }}>
      <div style={{ maxWidth:1100, margin:"0 auto", width:"100%", display:"grid" }}>
        {diapos.map((d, i) => {
          const active = i === diapo;
          return (
            <div key={d.nom} role="group" aria-roledescription="diapositive" aria-label={`${i + 1} sur ${diapos.length} : ${d.nom}`} aria-hidden={!active}
              style={{ gridArea:"1 / 1", alignSelf:"center", display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(min(100%, 480px), 1fr))", gap:"24px 40px", alignItems:"center",
                opacity: active && heroVisible ? 1 : 0, visibility: active ? "visible" : "hidden",
                transform: active ? (heroVisible ? "none" : "translateY(24px)") : "translateX(-24px)",
                transition: "opacity 0.6s ease, transform 0.6s ease, visibility 0.6s" }}>
              {d.texte}
              <div className="hero-dashboard">
                <MiniDashboard key={active ? `on-${tour}` : "off"} scenario={d.scenario} actif={active} />
                <div style={{ textAlign:"center", marginTop:10, fontSize:11, color:"rgba(255,255,255,0.35)" }}>{d.legende}</div>
              </div>
            </div>
          );
        })}
      </div>
      {/* Navigation : flèches + points (une pastille par diapo) */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:14, marginTop:14 }}>
        <button type="button" onClick={() => aller(diapo - 1, true)} aria-label="Diapositive précédente" style={fleche("prec")}>‹</button>
        <div style={{ display:"flex", gap:8, order:1 }}>
          {diapos.map((d, i) => (
            <button key={d.nom} type="button" onClick={() => aller(i, true)} aria-label={`Afficher : ${d.nom}`} aria-current={i === diapo ? "true" : undefined}
              style={{ height:10, width: i === diapo ? 30 : 10, borderRadius:5, border:"none", padding:0, cursor:"pointer",
                background: i === diapo ? "#86efac" : "rgba(255,255,255,0.3)", transition:"all 0.3s" }} />
          ))}
        </div>
        <button type="button" onClick={() => aller(diapo + 1, true)} aria-label="Diapositive suivante" style={fleche("suiv")}>›</button>
      </div>
    </section>
  );
}

function LandingPage({ onGoToPricing, onGoToApp, onGoToCheckout, onGoToAdmin, onGoToLegal, onGoToContact }) {
  const [scrolled, setScrolled] = useState(false);
  const heroRef = useRef();
  const [heroVisible, setHeroVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    setTimeout(() => setHeroVisible(true), 100);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div style={{ fontFamily:"'Inter', system-ui, sans-serif", background:"#fff" }}>

      {/* ── NAV ── */}
      <nav style={{ position:"fixed", top:0, left:0, right:0, zIndex:100, height:60, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 16px", background: scrolled?"rgba(255,255,255,0.95)":"transparent", backdropFilter: scrolled?"blur(12px)":"none", borderBottom: scrolled?`1px solid ${C.border}`:"none", transition:"all 0.2s" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:22 }}>💊</span>
          <span style={{ fontWeight:900, fontSize:18, color: scrolled?C.navy:"#fff" }}>OrdoMail</span>
        </div>
        <div style={{ display:"flex", gap:4, alignItems:"center" }}>
          {[["Renouvellements","renouvellements"],["Fonctionnalités","features"],["Tarifs","pricing"],["Sécurité","security"]].map(([l,id])=>(
            <button key={l} className={id==="features"||id==="security" ? "nav-sec" : undefined} onClick={() => document.getElementById(id)?.scrollIntoView({ behavior:"smooth" })}
              style={{ padding:"7px 14px", borderRadius:8, color: scrolled?C.slate:"rgba(255,255,255,0.75)", fontSize:14, fontWeight:500, background:"none", border:"none", cursor:"pointer", fontFamily:"inherit" }}>{l}</button>
          ))}
          <button className="nav-sec" onClick={() => onGoToContact?.()}
            style={{ padding:"7px 14px", borderRadius:8, color: scrolled?C.slate:"rgba(255,255,255,0.75)", fontSize:14, fontWeight:500, background:"none", border:"none", cursor:"pointer", fontFamily:"inherit" }}>Contact</button>
          <div style={{ width:1, height:18, background: scrolled?"#e2e8f0":"rgba(255,255,255,0.2)", margin:"0 6px" }} />
          <button onClick={()=>onGoToApp("login")} className="nav-links" style={{ padding:"7px 16px", border:`1px solid ${scrolled?C.border:"rgba(255,255,255,0.3)"}`, borderRadius:9, background:"transparent", color: scrolled?C.slate:"rgba(255,255,255,0.85)", fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>Connexion</button>
          <button onClick={()=>onGoToCheckout("standard","monthly")} className="nav-cta" style={{ padding:"8px 18px", border:"none", borderRadius:9, background:"#fff", color:C.navy, fontSize:14, fontWeight:800, cursor:"pointer", fontFamily:"inherit", boxShadow:"0 2px 8px rgba(0,0,0,0.12)" }}>Essai gratuit</button>
        </div>
      </nav>

      {/* ── HERO ── */}
      <HeroCarousel heroRef={heroRef} heroVisible={heroVisible} onGoToCheckout={onGoToCheckout} onGoToApp={onGoToApp} />

      {/* ── SECTIONS ── */}
      <div id="renouvellements"><RenouvellementsSection onCTA={()=>onGoToCheckout("pro","monthly")} /></div>
      <div id="features"><FeaturesSection /></div>
      <WorkflowSection />
      <div id="security"><SecuritySection /></div>
      <div id="pricing"><PricingSection onGoToPricing={onGoToPricing} /></div>
      <CTASection onCTA={(action)=>{ if(action==="trial") onGoToCheckout("standard","monthly"); else onGoToApp("demo"); }} onContact={onGoToContact ? () => onGoToContact("question") : null} />
      <Footer onNav={(l)=>{
        if(l==="Tarifs") onGoToPricing();
        else if(l==="backoffice") onGoToAdmin();
        else if(l==="CGU") onGoToLegal("cgu");
        else if(l==="Politique de confidentialité" || l==="RGPD") onGoToLegal("confidentialite");
        else if(l==="Mentions légales") onGoToLegal("mentions");
        else if(l==="Nous écrire") onGoToContact?.("question");
        else if(l==="Support") onGoToContact?.("support");
        else if(l==="Partenariats") onGoToContact?.("partenariat");
        else if(l==="Presse") onGoToContact?.("presse");
        else if(l==="Démo") onGoToContact?.("demo");
        else if(l==="Fonctionnalités") document.getElementById("features")?.scrollIntoView({ behavior:"smooth" });
        else if(l==="Sécurité") document.getElementById("security")?.scrollIntoView({ behavior:"smooth" });
      }} />

      <style>{`
        @keyframes slideDown { from { transform: translateY(-100%); } to { transform: translateY(0); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.5; } }
        @keyframes popIn { 0% { opacity:0; transform:scale(0.9) translateY(-8px); } 80% { transform:scale(1.02); } 100% { opacity:1; transform:scale(1); } }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }
        html { scroll-behavior: smooth; }
        a:hover { opacity: 0.75; }
        /* Écrans peu hauts (portables 13") : on garde titre, bénéfices, boutons et flèches visibles */
        @media (max-height: 700px) and (min-width: 761px) {
          .hero-stats { display: none !important; }
        }
        /* ── Responsive mobile ── */
        @media (max-width: 760px) {
          nav .nav-sec { display: none !important; }
        }
        @media (max-width: 640px) {
          nav { padding: 0 12px !important; }
          nav button { padding: 6px 10px !important; font-size: 12px !important; }
          nav .nav-cta { display: none !important; }
        }
        @media (max-width: 480px) {
          nav .nav-links { display: none !important; }
          .hero-dashboard { display: none !important; }
        }
      `}</style>
    </div>
  );
}

function PersistentNav({ onBack, secure }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", fn);
    return () => window.removeEventListener("scroll", fn);
  }, []);
  return (
    <nav style={{ position:"sticky", top:0, zIndex:100, height:58, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 28px", background:"#fff", borderBottom:"1px solid #e2e8f0", boxShadow: scrolled ? "0 2px 8px rgba(0,0,0,0.07)" : "none", transition:"box-shadow 0.2s" }}>
      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
        <button onClick={onBack} style={{ border:"none", background:"none", cursor:"pointer", color:"#94a3b8", fontSize:18, padding:"4px 6px", borderRadius:7 }}>←</button>
        <div style={{ width:1, height:20, background:"#e2e8f0", margin:"0 6px" }} />
        <span style={{ fontSize:18 }}>💊</span>
        <span style={{ fontWeight:900, fontSize:16, color:"#1a3a6e" }}>OrdoMail</span>
      </div>
      <div style={{ display:"flex", gap:4, alignItems:"center" }}>
        {[["Fonctionnalités","features"],["Tarifs","pricing"],["Sécurité","security"]].map(([l,id])=>(
          <button key={l} onClick={() => { onBack(); setTimeout(() => { document.getElementById(id)?.scrollIntoView({ behavior:"smooth" }); }, 80); }}
            style={{ padding:"6px 13px", borderRadius:8, color:"#475569", fontSize:13, fontWeight:500, background:"none", border:"none", cursor:"pointer", fontFamily:"inherit" }}>{l}</button>
        ))}
        <div style={{ width:1, height:16, background:"#e2e8f0", margin:"0 6px" }} />
        <button onClick={onBack} style={{ padding:"7px 16px", border:"1px solid #e2e8f0", borderRadius:9, background:"transparent", color:"#475569", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>← Retour au site</button>
      </div>
      {secure && <div style={{ fontSize:12, color:"#94a3b8", display:"flex", alignItems:"center", gap:5 }}>🔒 Sécurisé par Stripe</div>}
    </nav>
  );
}

export { LandingPage, PersistentNav };
export default LandingPage;