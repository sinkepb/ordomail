import { useState, useEffect, useRef } from "react";

const APP_VERSION = "v6.0 · 08/07/2026 22:24";
import {
  authSignInEmail, authSignInPIN, authSignInPSC, authSignOut,
  fetchPharmacie, savePharmacie, savePostes,
  fetchOrdonnances, updateOrdoStatus, updateOrdoExtracted, uploadOrdoFile,
  subscribeToPharmacy, notifyPharmacy,
  addAuditLog, getAuditLogs, exportLogsCSV,
  fetchAbonnement, fetchFactures, changePlan,
  isDemoMode, registerDB, getSupabaseClient, getSignedUrl,
  getCurrentSession, onAuthStateChange,
} from "./supabase.js";

// ─── Palette & tokens ─────────────────────────────────────────────────────────
const C = {
  navy:    "#1a3a6e",  // Bleu HDS
  navyD:   "#0f2347",  // Bleu foncé
  navyL:   "#dbeafe",  // Bleu clair
  green:   "#15623a",  // Vert pharmacie
  greenL:  "#dcfce7",
  white:   "#ffffff",
  ink:     "#0f172a",
  slate:   "#475569",
  muted:   "#94a3b8",
  border:  "#e2e8f0",
  surface: "#f8fafc",
  amber:   "#e6a817",
};

// ─── Données mock pour la démo live ──────────────────────────────────────────
const DEMO_ORDOS = [
  { nom: "MARTIN Pierre",    cv: "1 75 04 75 118 042 18", medecin: "Dr Bernard",  source: "email",  status: "nouveau",  mins: 3  },
  { nom: "DUBOIS Sophie",    cv: "2 82 11 75 063 014 22", medecin: "Dr Leclerc", source: "qrcode", status: "nouveau",  mins: 11 },
  { nom: "LEFEBVRE Jean",    cv: "1 60 03 75 042 118 08", medecin: "Dr Moreau",  source: "email",  status: "nouveau",  mins: 24 },
  { nom: "ROUX Anne",        cv: "2 91 03 69 215 088 45", medecin: "Dr Petit",   source: "qrcode", status: "imprime",  mins: 42 },
  { nom: "THOMAS Isabelle",  cv: "2 77 06 13 042 118 31", medecin: "Dr Gautier", source: "email",  status: "imprime",  mins: 68 },
];

const PLANS = [
  { id: "starter",  name: "Starter",  price: 19, icon: "🌱", color: "#0369a1", features: ["2 postes", "200 ordonnances/mois", "QR Code + Email", "Logs & export CSV"] },
  { id: "standard", name: "Standard", price: 39, icon: "⭐", color: C.navy,    features: ["5 postes", "1 000 ordonnances/mois", "SMTP personnalisé", "Support prioritaire"], popular: true },
  { id: "pro",      name: "Pro",      price: 79, icon: "🏥", color: "#4c1d95", features: ["Postes illimités", "Volume illimité", "Intégration LGO", "SLA 99,9 %"] },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
const useFadeIn = (ref) => {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true); }, { threshold: 0.15 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return visible;
};

// ═══════════════════════════════════════════════════════════════════════════════
// COMPOSANTS SECTION
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Mini dashboard démo (hero) ───────────────────────────────────────────────
function MiniDashboard() {
  const [filter, setFilter] = useState("nouveau");
  const [searchQuery, setSearchQuery] = useState("");
  const [highlighted, setHighlighted] = useState(null);
  const [newArrival, setNewArrival] = useState(false);
  const [ordos, setOrdos] = useState(DEMO_ORDOS);

  // Simule l'arrivée d'une nouvelle ordonnance
  useEffect(() => {
    const t = setTimeout(() => {
      setNewArrival(true);
      setOrdos(prev => [
        { nom: "GARCIA Manuel", cv: "1 73 07 92 042 118 85", medecin: "Dr Vidal", source: "qrcode", status: "nouveau", mins: 0, isNew: true },
        ...prev,
      ]);
      setTimeout(() => setNewArrival(false), 3000);
    }, 3200);
    return () => clearTimeout(t);
  }, []);

  const normalize = s => (s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  const filtered = ordos.filter(o => {
    const matchStatus = filter === "tous" || o.status === filter;
    const matchSearch = !searchQuery || normalize(o.nom).includes(normalize(searchQuery));
    return matchStatus && matchSearch;
  });

  return (
    <div style={{ background: "#fff", borderRadius: 16, overflow: "hidden", boxShadow: "0 24px 64px rgba(15,35,71,0.18), 0 2px 8px rgba(0,0,0,0.06)", border: `1px solid ${C.border}`, fontFamily: "'Inter', system-ui, sans-serif", position: "relative" }}>
      {/* Barre arrivée temps réel */}
      {newArrival && (
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 10, background: C.green, color: "#fff", padding: "7px 14px", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 8, animation: "slideDown 0.3s ease" }}>
          <span style={{ animation: "pulse 0.6s ease infinite" }}>🔔</span>
          Nouvelle ordonnance reçue — GARCIA Manuel
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
        {[["nouveau","🔔 À traiter", ordos.filter(o=>o.status==="nouveau").length],["imprime","✓ Imprimées", ordos.filter(o=>o.status==="imprime").length],["tous","Toutes",ordos.length]].map(([k,l,c])=>(
          <button key={k} onClick={()=>setFilter(k)} style={{ padding:"4px 10px", borderRadius:16, border:`1.5px solid ${filter===k?C.navy:"#e0e0e0"}`, background:filter===k?C.navy:"#fff", color:filter===k?"#fff":"#666", fontWeight:700, fontSize:11, cursor:"pointer", fontFamily:"inherit", display:"flex", alignItems:"center", gap:5 }}>
            {l} <span style={{ background: filter===k?"rgba(255,255,255,0.25)":"#f0f0f0", borderRadius:10, padding:"0 5px", fontSize:10 }}>{c}</span>
          </button>
        ))}
        <div style={{ position:"relative", flex:1 }}>
          <span style={{ position:"absolute", left:8, top:"50%", transform:"translateY(-50%)", fontSize:12 }}>🔍</span>
          <input value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder="Nom patient…" style={{ width:"100%", padding:"5px 8px 5px 24px", border:`1px solid ${C.border}`, borderRadius:8, fontSize:12, outline:"none", fontFamily:"inherit", background:"#fff", boxSizing:"border-box" }} />
        </div>
      </div>

      {/* Grille ordonnances */}
      <div style={{ padding: "10px 10px", display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8, maxHeight: 260, overflowY: "auto" }}>
        {filtered.map((o, i) => {
          const isNew = o.status === "nouveau";
          return (
            <div key={i} onMouseEnter={()=>setHighlighted(i)} onMouseLeave={()=>setHighlighted(null)} style={{
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
    </div>
  );
}

// ─── Section features ─────────────────────────────────────────────────────────
function FeaturesSection() {
  const ref = useRef(); const visible = useFadeIn(ref);
  const features = [
    { icon: "🔍", title: "Identification en 2 secondes", desc: "Le patient dit son nom au comptoir. Le vendeur le repère instantanément dans la grille. Fini de fouiller dans Gmail.", accent: C.navy },
    { icon: "🤖", title: "Extraction IA des données", desc: "Nom patient, numéro de Sécurité Sociale et médicaments extraits automatiquement de chaque ordonnance. OCR souverain hébergé en France.", accent: C.green },
    { icon: "📱", title: "QR Code + Badge NFC", desc: "Le patient scanne ou approche son téléphone. Sa photo d'ordonnance arrive directement dans votre tableau de bord en moins de 5 secondes.", accent: "#7c3aed" },
    { icon: "✉️", title: "Transfert email simplifié", desc: "Si le médecin envoie l'ordonnance par email, le patient transfère d'un clic à l'adresse dédiée de la pharmacie. Zéro ressaisie.", accent: "#0369a1" },
    { icon: "🖨️", title: "Impression avec confirmation", desc: "Un clic → boîte d'impression → confirmation que le papier est sorti. L'ordonnance est marquée traitée uniquement après validation.", accent: C.amber },
    { icon: "🗒️", title: "Journal d'audit complet", desc: "Chaque consultation, chaque impression, chaque connexion est tracée. Export CSV pour les contrôles. Aucune donnée médicale dans les logs.", accent: "#15803d" },
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
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Section Workflow ─────────────────────────────────────────────────────────
function WorkflowSection() {
  const ref = useRef(); const visible = useFadeIn(ref);
  const steps = [
    { who:"Patient", icon:"📱", title:"Il envoie son ordonnance", desc:"Photo depuis le QR code affiché à l'accueil, ou transfert de l'email reçu de son médecin. 10 secondes.", color:C.green },
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

// ─── Section Sécurité / HDS ───────────────────────────────────────────────────
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
            ⚠️ La quasi-totalité des pharmacies françaises utilise Gmail pour recevoir des ordonnances — une violation réglementaire caractérisée.
          </div>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap:12 }}>
          {[
            ["🇫🇷","Données en France","Hébergement Scaleway HDS — aucun flux vers les USA"],
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

// ─── Section Pricing (inline) ─────────────────────────────────────────────────
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
            {[["monthly","Mensuel"],["annual","Annuel −20%"]].map(([k,l])=>(
              <button key={k} onClick={()=>setBilling(k)} style={{ padding:"7px 18px", border:"none", borderRadius:8, cursor:"pointer", fontFamily:"inherit", fontSize:13, fontWeight:billing===k?700:500, background:billing===k?"#fff":"transparent", color:billing===k?C.ink:C.muted, boxShadow:billing===k?"0 1px 4px rgba(0,0,0,0.08)":"none", transition:"all 0.15s" }}>{l}</button>
            ))}
          </div>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap:14, marginBottom:24 }}>
          {PLANS.map(p=>{
            const price = billing==="annual" ? Math.round(p.price*0.8) : p.price;
            return (
              <div key={p.id} style={{ borderRadius:16, padding:"24px 22px", border:p.popular?`2px solid ${p.color}`:`2px solid ${C.border}`, background:"#fff", boxShadow:p.popular?`0 8px 32px ${p.color}20`:"none", position:"relative", display:"flex", flexDirection:"column" }}>
                {p.popular && <div style={{ position:"absolute", top:-12, left:"50%", transform:"translateX(-50%)", background:p.color, color:"#fff", fontSize:10, fontWeight:800, padding:"3px 12px", borderRadius:20, letterSpacing:0.5 }}>LE PLUS CHOISI</div>}
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:16 }}>
                  <div style={{ width:34,height:34,borderRadius:9,background:p.color+"18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18 }}>{p.icon}</div>
                  <span style={{ fontWeight:800, fontSize:17, color:C.ink }}>{p.name}</span>
                </div>
                <div style={{ marginBottom:16 }}>
                  <span style={{ fontSize:38, fontWeight:900, color:p.color }}>{price}</span>
                  <span style={{ fontSize:15, color:C.muted, fontWeight:400 }}> €/mois</span>
                  {billing==="annual" && <div style={{ fontSize:12, color:"#16a34a", fontWeight:600 }}>−{p.price-price}€/mois vs mensuel</div>}
                </div>
                <button onClick={onGoToPricing} style={{ width:"100%", padding:"11px", borderRadius:10, background:p.popular?p.color:C.surface, color:p.popular?"#fff":p.color, fontWeight:700, fontSize:14, cursor:"pointer", fontFamily:"inherit", border:p.popular?"none":`1.5px solid ${p.color}22`, marginBottom:18, transition:"opacity 0.15s" }}
                  onMouseEnter={e=>e.currentTarget.style.opacity="0.85"} onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
                  Commencer l'essai gratuit
                </button>
                {p.features.map((f,i)=>(
                  <div key={i} style={{ display:"flex", gap:8, marginBottom:7, fontSize:13, color:C.slate }}>
                    <span style={{ color:p.color, fontWeight:700, fontSize:14 }}>✓</span>{f}
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

// ─── Section testimonials ─────────────────────────────────────────────────────
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

// ─── CTA final ────────────────────────────────────────────────────────────────
function CTASection({ onCTA }) {
  const ref = useRef(); const visible = useFadeIn(ref);
  return (
    <section ref={ref} style={{ padding:"52px 16px", background:`linear-gradient(135deg, ${C.navyD} 0%, ${C.navy} 60%, ${C.green} 150%)` }}>
      <div style={{ maxWidth:640, margin:"0 auto", textAlign:"center", opacity:visible?1:0, transition:"opacity 0.7s ease" }}>
        <div style={{ fontSize:40, marginBottom:18 }}>💊</div>
        <h2 style={{ fontSize:"clamp(24px, 6vw, 38px)", fontWeight:900, color:"#fff", margin:"0 0 14px", lineHeight:1.2 }}>Prêt à simplifier la réception de vos ordonnances ?</h2>
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
          <span>✓ Données hébergées en France</span>
          <span>✓ Support inclus</span>
        </div>
      </div>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────
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
            ["Contact",["Support","Partenariats","Presse","Recrutement"]],
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
          <span style={{fontSize:10,color:"#94a3b8",fontFamily:"monospace"}}>{APP_VERSION}</span>
          <button onClick={() => onNav("backoffice")} style={{
            background:"none", border:"1px solid #1e293b", borderRadius:6,
            color:"#334155", fontSize:11, fontWeight:600, cursor:"pointer",
            padding:"4px 10px", fontFamily:"inherit",
          }}>
            🛡️ Espace OrdoMail Business
          </button>
          <span style={{ fontSize:12, color:"#334155" }}>Hébergement HDS France · Données médicales sécurisées</span>
        </div>
      </div>
    </footer>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// LANDING PAGE PRINCIPALE
// ═══════════════════════════════════════════════════════════════════════════════
function LandingPage({ onGoToPricing, onGoToApp, onGoToCheckout, onGoToAdmin }) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
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
          {[["Fonctionnalités","features"],["Tarifs","pricing"],["Sécurité","security"]].map(([l,id])=>(
            <button key={l} onClick={() => document.getElementById(id)?.scrollIntoView({ behavior:"smooth" })}
              style={{ padding:"7px 14px", borderRadius:8, color: scrolled?C.slate:"rgba(255,255,255,0.75)", fontSize:14, fontWeight:500, background:"none", border:"none", cursor:"pointer", fontFamily:"inherit" }}>{l}</button>
          ))}
          <div style={{ width:1, height:18, background: scrolled?"#e2e8f0":"rgba(255,255,255,0.2)", margin:"0 6px" }} />
          <button onClick={()=>onGoToApp("login")} className="nav-links" style={{ padding:"7px 16px", border:`1px solid ${scrolled?C.border:"rgba(255,255,255,0.3)"}`, borderRadius:9, background:"transparent", color: scrolled?C.slate:"rgba(255,255,255,0.85)", fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>Connexion</button>
          <button onClick={()=>onGoToCheckout("standard","monthly")} className="nav-cta" style={{ padding:"8px 18px", border:"none", borderRadius:9, background:"#fff", color:C.navy, fontSize:14, fontWeight:800, cursor:"pointer", fontFamily:"inherit", boxShadow:"0 2px 8px rgba(0,0,0,0.12)" }}>Essai gratuit</button>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section ref={heroRef} style={{ minHeight:"100vh", background:`linear-gradient(160deg, ${C.navyD} 0%, ${C.navy} 55%, #1a5c4a 120%)`, padding:"80px 16px 60px", display:"flex", alignItems:"center" }}>
        <div style={{ maxWidth:1100, margin:"0 auto", display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(min(100%, 480px), 1fr))", gap:36, alignItems:"center", width:"100%" }}>
          {/* Texte hero */}
          <div style={{ opacity:heroVisible?1:0, transform:heroVisible?"none":"translateY(24px)", transition:"all 0.7s ease" }}>
            <div style={{ display:"inline-flex", alignItems:"center", gap:8, background:"rgba(255,255,255,0.1)", border:"1px solid rgba(255,255,255,0.15)", borderRadius:20, padding:"6px 14px", marginBottom:24 }}>
              <span style={{ width:7, height:7, borderRadius:"50%", background:"#4ade80", display:"inline-block" }} />
              <span style={{ fontSize:12, fontWeight:700, color:"rgba(255,255,255,0.75)", letterSpacing:0.5 }}>Ordonnances reçues en temps réel</span>
            </div>
            <h1 style={{ fontSize:"clamp(28px, 8vw, 52px)", fontWeight:900, color:"#fff", margin:"0 0 14px", lineHeight:1.1, letterSpacing:"-0.5px" }}>
              Vos ordonnances,<br />
              <span style={{ color:"#86efac" }}>enfin organisées.</span>
            </h1>
            <p style={{ fontSize:18, color:"rgba(255,255,255,0.65)", lineHeight:1.75, marginBottom:36, maxWidth:460 }}>
              OrdoMail remplace la boîte email généraliste par un tableau de bord dédié. Le patient envoie, vous imprimez. En moins d'une minute.
            </p>
            <div style={{ display:"flex", gap:12, flexWrap:"wrap", marginBottom:32 }}>
              <button onClick={()=>onGoToCheckout("standard","monthly")} style={{ padding:"14px 28px", border:"none", borderRadius:12, background:"#fff", color:C.navy, fontWeight:800, fontSize:16, cursor:"pointer", fontFamily:"inherit", boxShadow:"0 4px 20px rgba(0,0,0,0.2)", display:"flex", alignItems:"center", gap:8 }}>
                Essai gratuit 30 jours
                <span style={{ fontSize:14, opacity:0.6 }}>→</span>
              </button>
              <button onClick={()=>onGoToApp("demo")} style={{ padding:"14px 24px", border:"2px solid rgba(255,255,255,0.25)", borderRadius:12, background:"transparent", color:"#fff", fontWeight:700, fontSize:16, cursor:"pointer", fontFamily:"inherit" }}>
                Voir la démo live
              </button>
            </div>
            <div style={{ display:"flex", gap:20, flexWrap:"wrap" }}>
              {[["30j","Essai gratuit"],["<1min","Installation"],["🇫🇷","Données en France"]].map(([v,l])=>(
                <div key={l} style={{ display:"flex", alignItems:"center", gap:7 }}>
                  <span style={{ fontWeight:900, fontSize:16, color:"#86efac" }}>{v}</span>
                  <span style={{ fontSize:13, color:"rgba(255,255,255,0.45)" }}>{l}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Mini dashboard démo — masqué sur très petits écrans */}
          <div style={{ opacity:heroVisible?1:0, transform:heroVisible?"none":"translateY(24px) scale(0.97)", transition:"all 0.8s ease 0.15s" }} className="hero-dashboard">
            <MiniDashboard />
            <div style={{ textAlign:"center", marginTop:10, fontSize:11, color:"rgba(255,255,255,0.35)" }} className="hero-dashboard">
              ↑ Démo interactive — une nouvelle ordonnance arrive dans 3 secondes
            </div>
          </div>
        </div>
      </section>

      {/* ── SECTIONS ── */}
      <div id="features"><FeaturesSection /></div>
      <WorkflowSection />
      <div id="security"><SecuritySection /></div>
      <div id="pricing"><PricingSection onGoToPricing={onGoToPricing} /></div>
      <TestimonialsSection />
      <CTASection onCTA={(action)=>{ if(action==="trial") onGoToCheckout("standard","monthly"); else onGoToApp("demo"); }} />
      <Footer onNav={(l)=>{ if(l==="Tarifs") onGoToPricing(); if(l==="backoffice") onGoToAdmin(); }} />

      <style>{`
        @keyframes slideDown { from { transform: translateY(-100%); } to { transform: translateY(0); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.5; } }
        @keyframes popIn { 0% { opacity:0; transform:scale(0.9) translateY(-8px); } 80% { transform:scale(1.02); } 100% { opacity:1; transform:scale(1); } }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }
        html { scroll-behavior: smooth; }
        a:hover { opacity: 0.75; }
        /* ── Responsive mobile ── */
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

// ─── Nav persistante ─────────────────────────────────────────────────────────
function PersistentNav({ onBack, currentPage, secure }) {
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


// ═══════════════════════════════════════════════════════════════════════════════
// MODULE DASHBOARD — ORDONNANCES (depuis ordonnances-dashboard.jsx)
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// DB
// ═══════════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════════
// JOURNALISATION & RÔLES (MVP — INSERT only, jamais de données médicales)
// ═══════════════════════════════════════════════════════════════════════════════
// Helpers date
// ═══════════════════════════════════════════════════════════════════════════════
// BASE DE DONNÉES MOCK
// ═══════════════════════════════════════════════════════════════════════════════

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
function LogsPanel({ pharmacieId, onClose }) {
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
              {["Heure","Utilisateur","Rôle","Action","ID Ordonnance"].map(h=><th key={h} style={{textAlign:"left",padding:"6px 10px",fontSize:11,color:"#94a3b8",fontWeight:700,textTransform:"uppercase"}}>{h}</th>)}
            </tr></thead>
            <tbody>{logs.map(l=>(
              <tr key={l.id} style={{borderBottom:"1px solid #f8fafc"}}>
                <td style={{padding:"8px 10px",color:"#64748b"}}>{new Date(l.ts).toLocaleTimeString("fr-FR")}</td>
                <td style={{padding:"8px 10px",fontFamily:"monospace",fontSize:11}}>{l.userId}</td>
                <td style={{padding:"8px 10px"}}><span style={{fontSize:10,fontWeight:700,background:l.userRole==="admin"?"#dbeafe":"#dcfce7",color:l.userRole==="admin"?"#1d4ed8":"#15803d",padding:"2px 7px",borderRadius:20}}>{l.userRole}</span></td>
                <td style={{padding:"8px 10px",fontWeight:600}}>{actionLabel[l.action]||l.action}</td>
                <td style={{padding:"8px 10px",fontFamily:"monospace",fontSize:11,color:"#94a3b8"}}>{l.ordonnanceId||"—"}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}


function isSameDay(d1, d2) {
  const a = new Date(d1), b = new Date(d2);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function toDateKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function formatDateLabel(dateKey) {
  const today = toDateKey(new Date());
  const yesterday = toDateKey(new Date(Date.now() - 86400000));
  if (dateKey === today) return "Aujourd'hui";
  if (dateKey === yesterday) return "Hier";
  const [y, m, d] = dateKey.split('-');
  return new Date(y, m-1, d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

function timeAgo(date) {
  const m = Math.floor((Date.now() - new Date(date)) / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h}h`;
  return new Date(date).toLocaleDateString("fr-FR");
}

// ═══════════════════════════════════════════════════════════════════════════════
// OCR TESSERACT.JS — 100% local, aucun réseau, conformité HDS native
// Chargé dynamiquement depuis CDN au premier usage (~2 MB, mis en cache)
// ═══════════════════════════════════════════════════════════════════════════════

let _tesseractWorker = null;
let _tesseractLoading = false;
let _tesseractReady = false;

async function getTesseractWorker() {
  if (_tesseractReady && _tesseractWorker) return _tesseractWorker;
  if (_tesseractLoading) {
    await new Promise(resolve => {
      const iv = setInterval(() => { if (_tesseractReady || !_tesseractLoading) { clearInterval(iv); resolve(); } }, 200);
    });
    return _tesseractWorker;
  }
  _tesseractLoading = true;
  try {
    // Tesseract.js v5 — import ESM depuis esm.sh (même CDN que qrcode, déjà autorisé)
    const { createWorker } = await import('https://esm.sh/tesseract.js@5');
    _tesseractWorker = await createWorker('fra', 1, {
      logger: () => {}, // silencieux
    });
    await _tesseractWorker.setParameters({
      preserve_interword_spaces: '1',
      tessedit_pageseg_mode: '6', // assume un bloc de texte uniforme
    });
    _tesseractReady = true;
    return _tesseractWorker;
  } catch(e) {
    console.warn('[Tesseract] Échec chargement:', e.message);
    _tesseractLoading = false;
    return null;
  } finally {
    _tesseractLoading = false;
  }
}


async function preprocessImage(base64, mimeType) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = Math.max(1, Math.min(3, 2400 / Math.max(img.width, img.height)));
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const id = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = id.data;
      for (let i = 0; i < d.length; i += 4) {
        const g = 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2];
        const v = g < 128 ? Math.max(0, g - 20) : Math.min(255, g + 30);
        d[i] = d[i+1] = d[i+2] = v;
      }
      ctx.putImageData(id, 0, 0);
      resolve(canvas.toDataURL('image/png').split(',')[1]);
    };
    img.src = `data:${mimeType};base64,${base64}`;
  });
}

// Conversion PDF page 1 → image PNG via pdf.js
async function pdfToImage(base64) {
  try {
    const pdfjsLib = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4/build/pdf.min.mjs');
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4/build/pdf.worker.min.mjs';
    const pdf    = await (await pdfjsLib.getDocument({ data: atob(base64) }).promise);
    const page   = await pdf.getPage(1);
    const vp     = page.getViewport({ scale: 2.5 });
    const canvas = document.createElement('canvas');
    canvas.width = vp.width; canvas.height = vp.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    return canvas.toDataURL('image/png').split(',')[1];
  } catch { return null; }
}

// Parsers regex ordonnances françaises
const OCR_PARSERS = {
  carteVitale(txt) {
    const clean = txt.replace(/[^0-9]/g, '');
    const m = clean.match(/([12][0-9]{12,14})/);
    if (!m) return null;
    const r = m[1].slice(0, 15);
    return r.replace(/^(\d)(\d{2})(\d{2})(\d{2})(\d{3})(\d{3})(\d{2})$/, '$1 $2 $3 $4 $5 $6 $7') || null;
  },
  medecin(txt) {
    const m = txt.match(/(?:Dr\.?|Docteur)\s+([A-ZÁÀÂÉÈÊËÎÏÔÙÛÜÇ][a-záàâéèêëîïôùûüç\s\-]{2,30})/i)
           || txt.match(/Prescripteur\s*[:]\s*(.+)/i);
    return m ? ('Dr ' + m[1].trim().slice(0, 40)) : null;
  },
  nom(txt) {
    const m = txt.match(/(?:Patient|Nom|Assuré)\s*[:]\s*([A-ZÁÀÂÉÈÊËÎÏÔÙÛÜÇ][A-Za-záàâéèêëîïôùûüç\s\-]{2,40})/i)
           || txt.match(/^([A-ZÁÀÂÉÈÊËÎÏÔÙÛÜÇ]{2,}(?:\s+[A-ZÁÀÂÉÈÊËÎÏÔÙÛÜÇ][a-z]{1,20}){1,2})/m);
    if (!m) return null;
    const excluded = ['ORDONNANCE','MEDICALE','PRESCRIPTION','REPUBLIQUE','CABINET','MEDECIN'];
    return excluded.includes(m[1].trim().toUpperCase()) ? null : m[1].trim().slice(0, 50);
  },
  date(txt) {
    const m = txt.match(/(\d{1,2})[\/\-.·](\d{1,2})[\/\-.·](\d{2,4})/);
    if (!m) return null;
    const y = m[3].length === 2 ? '20' + m[3] : m[3];
    return `${m[1].padStart(2,'0')}/${m[2].padStart(2,'0')}/${y}`;
  },
  medicaments(txt) {
    const meds = [];
    const lines = txt.split("\n").map(function(l){ return l.trim(); }).filter(function(l){ return l.length > 3; });
    const doseRx = new RegExp("\\d+[,.]?\\d*\\s*(?:mg|g|ml|UI|mcg|%)", "i");
    const formRx = new RegExp("(?:cp|gel|comp|supp|amp|sachet|flacon|patch|tube|pom)", "i");
    for (var j = 0; j < lines.length; j++) {
      var line = lines[j];
      if ((doseRx.test(line) || formRx.test(line)) && line.length < 80) {
        var clean = line.replace(/^[-*.\d]\s+/, "").trim();
        if (clean.length > 3 && meds.indexOf(clean) === -1 && meds.length < 10) meds.push(clean);
      }
    }
    return meds;
  },
};

// Fonction principale — appelée à chaque réception d'image
async function extractFromFile(base64, mimeType, { fallbackName = null } = {}) {
  try {
    let imgB64 = base64;

    // PDF → image (page 1)
    if (mimeType === 'application/pdf') {
      const converted = await pdfToImage(base64);
      if (!converted) return { nom: fallbackName, carteVitale: null, medecin: null, date: null, medicaments: [], _ocrSuccess: false };
      imgB64 = converted; mimeType = 'image/png';
    }

    // Pré-traitement
    const processed = await preprocessImage(imgB64, mimeType);

    // OCR Tesseract
    const worker = await getTesseractWorker();
    if (!worker) {
      // OCR non disponible — utiliser le fallback nom
      return { nom: fallbackName, carteVitale: null, medecin: null, date: null, medicaments: [], _ocrSuccess: false, _confidence: 0 };
    }
    const { data: { text, confidence } } = await worker.recognize(`data:image/png;base64,${processed}`);

    // Confiance insuffisante → fallback nom
    if (!text || confidence < 15) {
      return { nom: fallbackName, carteVitale: null, medecin: null, date: null, medicaments: [], _ocrSuccess: false, _confidence: Math.round(confidence || 0) };
    }

    // OCR simplifié : extraire uniquement nom + prénom du patient
    const nomExtrait = OCR_PARSERS.nom(text) || fallbackName || null;
    const result = {
      nom:          nomExtrait,
      carteVitale:  null,  // non extrait (conformité RGPD)
      medecin:      null,
      date:         null,
      medicaments:  [],
      _confidence:  Math.round(confidence),
      _ocrSuccess:  !!(nomExtrait && confidence >= 15),
    };

    return result;
  } catch(e) {
    console.warn('[OCR Tesseract]', e.message);
    return { nom: fallbackName, carteVitale: null, medecin: null, date: null, medicaments: [], _ocrSuccess: false };
  }
}

// Préchargement silencieux dès la connexion du pharmacien
function prewarmTesseract() { getTesseractWorker().catch(() => {}); }

// ─── UI primitives ────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
// GÉNÉRATEUR PDF — pur canvas/SVG, sans librairie externe
// Produit un dataUrl "data:application/pdf..." via une page HTML imprimable
// encodée en base64, ouverte dans un nouvel onglet avec commande d'impression
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Génère le HTML d'une facture puis l'ouvre en nouvel onglet ───────────────
function generateInvoiceHTML({ invoice, pharmacie, plan }) {
  const planInfo = PLAN_LIMITS[plan] || PLAN_LIMITS.starter;
  const tva = Math.round(invoice.amount * 0.20 * 100) / 100;
  const ht  = Math.round((invoice.amount - tva) * 100) / 100;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Facture ${invoice.id} — OrdoMail</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a1a; background: #fff; padding: 40px 48px; }
  @media print {
    body { padding: 20px 28px; }
    .no-print { display: none !important; }
    @page { margin: 10mm; }
  }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; padding-bottom: 20px; border-bottom: 3px solid #1a3a6e; }
  .logo { font-size: 28px; font-weight: 900; color: #1a3a6e; letter-spacing: -0.5px; }
  .logo-sub { font-size: 11px; color: #94a3b8; letter-spacing: 2px; margin-top: 2px; }
  .badge { background: #1a3a6e; color: #fff; font-size: 11px; font-weight: 800; padding: 4px 12px; border-radius: 20px; letter-spacing: 1px; margin-top: 8px; display: inline-block; }
  .meta { text-align: right; font-size: 12px; color: #64748b; line-height: 1.8; }
  .meta strong { color: #1a1a1a; font-size: 18px; display: block; margin-bottom: 4px; }
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 32px; }
  .party-card { background: #f8fafc; border-radius: 10px; padding: 16px 18px; border-left: 4px solid #1a3a6e; }
  .party-label { font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 8px; }
  .party-name { font-weight: 800; font-size: 15px; color: #1a1a1a; margin-bottom: 4px; }
  .party-info { font-size: 12px; color: #64748b; line-height: 1.7; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  thead tr { background: #1a3a6e; }
  thead th { color: #fff; padding: 11px 14px; text-align: left; font-size: 11px; font-weight: 700; letter-spacing: 0.5px; }
  tbody tr { border-bottom: 1px solid #f1f5f9; }
  tbody tr:hover { background: #f8fafc; }
  tbody td { padding: 12px 14px; font-size: 13px; }
  .total-block { background: #f0f4ff; border-radius: 10px; padding: 16px 18px; margin-left: auto; width: 280px; }
  .total-row { display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 13px; }
  .total-row.main { font-weight: 900; font-size: 16px; color: #1a3a6e; border-top: 2px solid #1a3a6e; padding-top: 10px; margin-top: 6px; }
  .status-badge { display: inline-block; background: #dcfce7; color: #166534; font-size: 11px; font-weight: 800; padding: 3px 10px; border-radius: 20px; margin-bottom: 20px; }
  .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; font-size: 10px; color: #94a3b8; }
  .print-btn { position: fixed; bottom: 24px; right: 24px; background: #1a3a6e; color: #fff; border: none; border-radius: 12px; padding: 12px 24px; font-size: 14px; font-weight: 700; cursor: pointer; font-family: inherit; box-shadow: 0 4px 16px rgba(26,58,110,0.4); }
</style>
</head>
<body>

<button class="no-print print-btn" onclick="window.print()">🖨️ Imprimer / Sauvegarder PDF</button>

<div class="header">
  <div>
    <div class="logo">💊 OrdoMail</div>
    <div class="logo-sub">PLATEFORME ORDONNANCES</div>
    <div class="badge">FACTURE</div>
  </div>
  <div class="meta">
    <strong>${invoice.id}</strong>
    Émise le : ${invoice.date}<br>
    Échéance : ${invoice.date}<br>
    Période : ${invoice.desc || "Abonnement mensuel"}
  </div>
</div>

<div class="status-badge">✓ PAYÉE</div>

<div class="parties">
  <div class="party-card">
    <div class="party-label">Émetteur</div>
    <div class="party-name">OrdoMail SAS</div>
    <div class="party-info">
      12 avenue de la Santé Numérique<br>
      75013 Paris, France<br>
      SIRET : 123 456 789 00012<br>
      TVA : FR 12 123456789<br>
      contact@ordomail.fr
    </div>
  </div>
  <div class="party-card">
    <div class="party-label">Client</div>
    <div class="party-name">${pharmacie?.nom || "Pharmacie"}</div>
    <div class="party-info">
      ${pharmacie?.adresse || pharmacie?.email || "—"}<br>
      ${pharmacie?.email || "—"}<br>
      Plan : ${planInfo.icon} ${planInfo.label}
    </div>
  </div>
</div>

<table>
  <thead>
    <tr>
      <th>Description</th>
      <th>Période</th>
      <th style="text-align:right">Qté</th>
      <th style="text-align:right">P.U. HT</th>
      <th style="text-align:right">Total HT</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        <strong>OrdoMail ${planInfo.label}</strong><br>
        <span style="font-size:11px;color:#64748b">Abonnement mensuel — ${planInfo.maxPostes === 999 ? "Postes illimités" : planInfo.maxPostes + " postes"} · ${planInfo.maxOrdos === 99999 ? "Volume illimité" : planInfo.maxOrdos + " ordo/mois"}</span>
      </td>
      <td style="color:#64748b;font-size:12px">${invoice.desc || "Mois en cours"}</td>
      <td style="text-align:right">1</td>
      <td style="text-align:right">${ht.toFixed(2)} €</td>
      <td style="text-align:right;font-weight:700">${ht.toFixed(2)} €</td>
    </tr>
  </tbody>
</table>

<div style="display:flex;justify-content:flex-end">
  <div class="total-block">
    <div class="total-row"><span>Sous-total HT</span><span>${ht.toFixed(2)} €</span></div>
    <div class="total-row"><span>TVA 20 %</span><span>${tva.toFixed(2)} €</span></div>
    <div class="total-row main"><span>Total TTC</span><span>${invoice.amount.toFixed(2)} €</span></div>
  </div>
</div>

<div class="footer">
  <span>OrdoMail SAS — Capital 10 000 € — RCS Paris 123 456 789</span>
  <span>Document généré le ${new Date().toLocaleDateString("fr-FR")} · Facture acquittée</span>
</div>

</body>
</html>`;
}

// ─── Ouvrir la facture dans un nouvel onglet ──────────────────────────────────
function openInvoicePDF(invoice, pharmacie, plan) {
  const html = generateInvoiceHTML({ invoice, pharmacie, plan });
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const win  = window.open(url, "_blank");
  if (win) win.focus();
  // Révoquer après 60s
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// ─── Génère un PDF d'ordonnance fictif (pour les ordonnances email démo) ──────
function generateOrdoPDF(ordo) {
  const nom = ordo.extracted?.nom || ordo.fromName || "Patient";
  const cv  = ordo.extracted?.carteVitale || "Non disponible";
  const med = ordo.extracted?.medecin || "Dr Inconnu";
  const dat = ordo.extracted?.date || new Date().toLocaleDateString("fr-FR");
  const meds = (ordo.extracted?.medicaments || []).join(", ") || "—";
  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Ordonnance — ${nom}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; color: #1a1a1a; padding: 32px 40px; background: #fff; }
  @media print { body { padding: 16px; } .no-print { display: none; } }
  .header { border-bottom: 2px solid #1a3a6e; padding-bottom: 14px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-start; }
  .ordo-title { font-size: 22px; font-weight: 900; color: #1a3a6e; }
  .ordo-sub { font-size: 10px; color: #94a3b8; letter-spacing: 2px; margin-top: 2px; }
  .patient-block { background: #eef4ff; border-left: 5px solid #1a3a6e; border-radius: 0 10px 10px 0; padding: 16px 20px; margin-bottom: 20px; }
  .patient-name { font-size: 28px; font-weight: 900; color: #1a1a1a; margin-bottom: 8px; }
  .cv-badge { display: inline-block; background: #15623a; color: #fff; font-family: monospace; font-size: 14px; font-weight: 700; padding: 5px 14px; border-radius: 7px; letter-spacing: 2px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 20px; }
  .info-card { background: #f8f9ff; border-radius: 9px; padding: 12px 14px; border: 1px solid #dde4f5; }
  .info-label { font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 4px; }
  .info-val { font-size: 14px; font-weight: 700; }
  .meds { margin-bottom: 24px; }
  .meds-label { font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 10px; }
  .med-item { padding: 8px 12px; border-radius: 7px; background: #f0f7ff; margin-bottom: 6px; font-size: 14px; border-left: 3px solid #1a3a6e; }
  .footer { border-top: 1px solid #e0e0e0; padding-top: 10px; display: flex; justify-content: space-between; font-size: 10px; color: #94a3b8; }
  .print-btn { position: fixed; bottom: 20px; right: 20px; background: #1a3a6e; color: #fff; border: none; border-radius: 10px; padding: 10px 20px; font-size: 13px; font-weight: 700; cursor: pointer; }
</style>
</head>
<body>
<button class="no-print print-btn" onclick="window.print()">🖨️ Imprimer</button>
<div class="header">
  <div>
    <div class="ordo-title">💊 OrdoMail</div>
    <div class="ordo-sub">FICHE ORDONNANCE NUMÉRIQUE</div>
  </div>
  <div style="text-align:right;font-size:11px;color:#64748b">
    Reçue le ${new Date(ordo.receivedAt).toLocaleDateString("fr-FR")}<br>
    Source : ${ordo.source === "qrcode" ? "QR Code patient" : "Email"}<br>
    ID : ${ordo.id}
  </div>
</div>
<div class="patient-block">
  <div style="font-size:10px;font-weight:700;color:#7a9cc8;text-transform:uppercase;letter-spacing:1.2px;margin-bottom:8px">Patient</div>
  <div class="patient-name">${nom}</div>
  ${cv !== "Non disponible" ? `<div class="cv-badge">💳 ${cv}</div>` : '<div style="font-size:12px;color:#aaa;font-style:italic">Numéro SS non extrait</div>'}
</div>
<div class="grid">
  <div class="info-card"><div class="info-label">Médecin prescripteur</div><div class="info-val">${med}</div></div>
  <div class="info-card"><div class="info-label">Date prescription</div><div class="info-val">${dat}</div></div>
</div>
<div class="meds">
  <div class="meds-label">Médicaments prescrits</div>
  ${(ordo.extracted?.medicaments || []).map(m => `<div class="med-item">▸ ${m}</div>`).join("") || '<div class="med-item" style="color:#aaa">Aucun médicament extrait</div>'}
</div>
<div class="footer">
  <span>Imprimé le ${new Date().toLocaleDateString("fr-FR")} à ${new Date().toLocaleTimeString("fr-FR", {hour:"2-digit",minute:"2-digit"})}</span>
  <span>OrdoMail — Document à usage interne pharmacie</span>
</div>
</body>
</html>`;
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  return URL.createObjectURL(blob);
}


function CVBadge({ numero, color = "#15623a" }) {
  if (!numero) return <span style={{ color: "#bbb", fontSize: 12, fontStyle: "italic" }}>Non extrait</span>;
  // Formater le numéro en groupes lisibles : X XX XX XX XXX XXX XX
  const fmt = (n) => n.replace(/\s/g,"").replace(/(.{1})(.{2})(.{2})(.{2})(.{3})(.{3})(.{2})/, "$1 $2 $3 $4 $5 $6 $7").trim();
  const formatted = fmt(numero) || numero;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6,
      background: `${color}14`, border: `1.5px solid ${color}44`,
      borderRadius: 8, padding: "5px 10px",
      minWidth: 0, overflow: "hidden",
    }}>
      <span style={{ fontSize: 14, flexShrink: 0 }}>💳</span>
      <span style={{
        fontFamily: "monospace", fontSize: 12, fontWeight: 700,
        color: color, letterSpacing: 0.5,
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        minWidth: 0,
      }}>{formatted}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// UI PRIMITIVES
// ═══════════════════════════════════════════════════════════════════════════════

function Btn({ children, onClick, disabled, variant="primary", small, style={} }) {
  const base = { display:"inline-flex", alignItems:"center", gap:6, fontFamily:"inherit",
    fontWeight:700, cursor:disabled?"not-allowed":"pointer", borderRadius:9, border:"none",
    fontSize:small?12:14, padding:small?"6px 12px":"10px 18px", transition:"opacity 0.15s",
    opacity:disabled?0.5:1 };
  const variants = {
    primary:   { background:"#1a3a6e", color:"#fff" },
    secondary: { background:"#f0f4ff", color:"#1a3a6e", border:"1.5px solid #c7d2fe" },
    ghost:     { background:"transparent", color:"#475569", border:"1.5px solid #e2e8f0" },
    danger:    { background:"#fee2e2", color:"#dc2626", border:"1.5px solid #fecaca" },
  };
  return <button onClick={disabled?undefined:onClick} style={{...base,...variants[variant],...style}}>{children}</button>;
}

function Input({ label, value, onChange, type="text", placeholder="", icon="" }) {
  return (
    <div style={{marginBottom:14}}>
      {label && <label style={{fontSize:12,fontWeight:700,color:"#374151",display:"block",marginBottom:5}}>{label}</label>}
      <div style={{position:"relative"}}>
        {icon && <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",fontSize:15,pointerEvents:"none"}}>{icon}</span>}
        <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
          style={{width:"100%",padding:icon?"10px 12px 10px 34px":"10px 12px",border:"1.5px solid #e2e8f0",borderRadius:9,fontSize:14,outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}/>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PLAN SYSTEM
// ═══════════════════════════════════════════════════════════════════════════════


// ─── Plans & limites (source de vérité unique) ───────────────────────────────
const PLAN_LIMITS = {
  starter:  { id:"starter",  maxPostes: 2,   maxOrdos: 200,   label:"Starter",  price:19, priceAnnual:15, icon:"🌱", color:"#0369a1", offresStories: true },
  standard: { id:"standard", maxPostes: 5,   maxOrdos: 1000,  label:"Standard", price:39, priceAnnual:31, icon:"⭐", color:"#1a3a6e", offresStories: true },
  pro:      { id:"pro",      maxPostes: 15,  maxOrdos: 99999, label:"Pro",       price:79, priceAnnual:63, icon:"🏥", color:"#4c1d95", offresStories: true },
  premium:  { id:"premium",  maxPostes: 999, maxOrdos: 99999, label:"Premium",  price:119, priceAnnual:95, icon:"💎", color:"#b45309", offresStories: true },
};
const PLAN_ORDER = ["starter","standard","pro","premium"];

function getNextPlan(currentPlan) {
  const idx = PLAN_ORDER.indexOf(currentPlan);
  return PLAN_ORDER[idx+1] || null;
}
function getPrevPlan(currentPlan) {
  const idx = PLAN_ORDER.indexOf(currentPlan);
  return idx > 0 ? PLAN_ORDER[idx-1] : null;
}
function computeImpact(pharmacie, postes, newPlanId) {
  const curr = PLAN_LIMITS[pharmacie.plan];
  const next = PLAN_LIMITS[newPlanId];
  const postesActifs = (postes||[]).filter(p=>p.actif).length;
  const isUpgrade = PLAN_ORDER.indexOf(newPlanId) > PLAN_ORDER.indexOf(pharmacie.plan);
  const priceDiff = next.price - curr.price;
  const postesASusprimer = isUpgrade ? 0 : Math.max(0, postesActifs - next.maxPostes);
  return { isUpgrade, priceDiff, curr, next, postesActifs, postesASusprimer };
}
function canAddPoste(pharmacie) {
  const limit = PLAN_LIMITS[pharmacie.plan]?.maxPostes || 2;
  return (pharmacie.postes||[]).filter(p=>p.actif).length < limit;
}

// ─── UpgradeModal ─────────────────────────────────────────────────────────────
function UpgradeModal({ currentPlan, reason, onConfirm, onClose }) {
  const nextPlan = getNextPlan(currentPlan);
  const next = PLAN_LIMITS[nextPlan];
  const curr = PLAN_LIMITS[currentPlan];
  if (!next) return null;
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:2000,padding:24}}>
      <div style={{background:"#fff",borderRadius:20,padding:32,maxWidth:440,width:"100%",boxShadow:"0 24px 60px rgba(0,0,0,0.25)",fontFamily:"'Inter',system-ui,sans-serif"}}>
        <div style={{fontSize:44,textAlign:"center",marginBottom:16}}>🚀</div>
        <h2 style={{fontWeight:900,fontSize:22,color:"#0f172a",textAlign:"center",marginBottom:8}}>Limite atteinte</h2>
        <p style={{fontSize:14,color:"#64748b",textAlign:"center",marginBottom:24,lineHeight:1.7}}>{reason}</p>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:24}}>
          <div style={{borderRadius:12,padding:"14px 16px",background:"#f8fafc",border:"1.5px solid #e2e8f0",opacity:0.7}}>
            <div style={{fontSize:11,fontWeight:700,color:"#94a3b8",marginBottom:6}}>Actuel</div>
            <div style={{fontWeight:900,fontSize:18,color:curr.color}}>{curr.icon} {curr.label}</div>
            <div style={{fontSize:13,color:"#64748b",marginTop:4}}>{curr.maxPostes} postes · {curr.price} €/mois</div>
          </div>
          <div style={{borderRadius:12,padding:"14px 16px",background:`${next.color}08`,border:`1.5px solid ${next.color}`,position:"relative"}}>
            <div style={{position:"absolute",top:-10,left:"50%",transform:"translateX(-50%)",background:next.color,color:"#fff",fontSize:10,fontWeight:800,padding:"2px 10px",borderRadius:20}}>RECOMMANDÉ</div>
            <div style={{fontSize:11,fontWeight:700,color:next.color,marginBottom:6}}>Supérieur</div>
            <div style={{fontWeight:900,fontSize:18,color:next.color}}>{next.icon} {next.label}</div>
            <div style={{fontSize:13,color:"#64748b",marginTop:4}}>{next.maxPostes===999?"Illimité":next.maxPostes} postes · {next.price} €/mois</div>
          </div>
        </div>
        <div style={{display:"flex",gap:10}}>
          <button onClick={onClose} style={{flex:1,padding:"11px",border:"1.5px solid #e2e8f0",borderRadius:10,background:"#fff",color:"#475569",fontWeight:600,fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>Rester</button>
          <button onClick={()=>onConfirm(nextPlan)} style={{flex:2,padding:"11px",border:"none",borderRadius:10,background:next.color,color:"#fff",fontWeight:800,fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>Passer en {next.label} →</button>
        </div>
      </div>
    </div>
  );
}

// ─── PlanSwitcher ─────────────────────────────────────────────────────────────
function PlanSwitcher({ pharmacie, postes, onConfirm, onClose }) {
  const [billingCycle, setBillingCycle] = useState("monthly");
  const [selected, setSelected] = useState(null);
  const [step, setStep] = useState("choose");

  const impact = selected ? computeImpact(pharmacie, postes, selected.id) : null;

  if (step === "done") return (
    <div style={{textAlign:"center",padding:"24px 0"}}>
      <div style={{fontSize:64,marginBottom:16}}>✅</div>
      <div style={{fontWeight:900,fontSize:20,color:"#0f172a",marginBottom:8}}>Plan mis à jour !</div>
      <div style={{fontSize:14,color:"#64748b",marginBottom:24,lineHeight:1.7}}>
        Vous êtes sur le plan <strong style={{color:selected.color}}>{selected.icon} {selected.label}</strong>.<br/>
        {impact.isUpgrade?"Accès immédiat.":"Effet au prochain renouvellement."}
      </div>
      <button onClick={onClose} style={{padding:"11px 28px",border:"none",borderRadius:10,background:"#1a3a6e",color:"#fff",fontWeight:800,fontSize:15,cursor:"pointer",fontFamily:"inherit"}}>Fermer</button>
    </div>
  );

  if (step === "processing") return (
    <div style={{textAlign:"center",padding:"32px 0"}}>
      <div style={{fontSize:48,marginBottom:16,animation:"spin 1s linear infinite",display:"inline-block"}}>⚙️</div>
      <div style={{fontWeight:700,fontSize:16,color:"#1a3a6e"}}>Mise à jour en cours…</div>
    </div>
  );

  if (step === "confirm" && selected && impact) return (
    <div>
      <button onClick={()=>setStep("choose")} style={{border:"none",background:"none",cursor:"pointer",color:"#64748b",fontSize:13,marginBottom:20,fontFamily:"inherit"}}>← Retour</button>
      <h3 style={{fontWeight:900,fontSize:18,color:"#0f172a",marginBottom:4}}>{impact.isUpgrade?"↑ Passer en":"↓ Rétrograder en"} {selected.label}</h3>
      <p style={{fontSize:13,color:"#64748b",marginBottom:20}}>{impact.isUpgrade?"Effet immédiat · Prorata facturé.":"Effet au prochain renouvellement."}</p>
      <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",gap:12,alignItems:"center",marginBottom:20}}>
        <div style={{borderRadius:12,padding:"14px 16px",background:"#f8fafc",border:"1.5px solid #e2e8f0",opacity:0.7}}>
          <div style={{fontSize:10,fontWeight:700,color:"#94a3b8",marginBottom:4}}>Actuel</div>
          <div style={{fontWeight:900,color:impact.curr.color}}>{impact.curr.icon} {impact.curr.label}</div>
          <div style={{fontSize:12,color:"#64748b",marginTop:3}}>{impact.curr.price} €/mois</div>
        </div>
        <div style={{fontSize:20}}>→</div>
        <div style={{borderRadius:12,padding:"14px 16px",background:`${selected.color}08`,border:`1.5px solid ${selected.color}`}}>
          <div style={{fontSize:10,fontWeight:700,color:selected.color,marginBottom:4}}>Nouveau</div>
          <div style={{fontWeight:900,color:selected.color}}>{selected.icon} {selected.label}</div>
          <div style={{fontSize:12,color:"#64748b",marginTop:3}}>{selected.price} €/mois</div>
        </div>
      </div>
      <div style={{borderRadius:12,padding:"14px 16px",background:impact.isUpgrade?"#f0fdf4":"#fff7ed",border:`1px solid ${impact.isUpgrade?"#bbf7d0":"#fed7aa"}`,marginBottom:16}}>
        <div style={{fontWeight:700,fontSize:13,color:impact.isUpgrade?"#15803d":"#92400e",marginBottom:8}}>{impact.isUpgrade?"✅ Gains":"⚠️ Impacts"}</div>
        {[["💰 Prix",`${impact.curr.price} € → ${selected.price} € (${impact.isUpgrade?"+":""}${impact.priceDiff} €/mois)`],
          ["🖥️ Postes",`${impact.curr.maxPostes===999?"∞":impact.curr.maxPostes} → ${selected.maxPostes===999?"∞":selected.maxPostes}`],
          ["📋 Volume",`${impact.curr.maxOrdos===99999?"∞":impact.curr.maxOrdos} → ${selected.maxOrdos===99999?"∞":selected.maxOrdos}/mois`],
        ].map(([l,v])=>(
          <div key={l} style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:4}}>
            <span style={{color:"#374151"}}>{l}</span><span style={{fontWeight:700}}>{v}</span>
          </div>
        ))}
        {impact.postesASusprimer>0&&(
          <div style={{marginTop:10,padding:"8px 12px",background:"#fee2e2",borderRadius:8,fontSize:12,color:"#dc2626",fontWeight:600}}>
            🚫 {impact.postesASusprimer} poste(s) seront désactivés automatiquement
          </div>
        )}
      </div>
      <div style={{display:"flex",gap:10}}>
        <button onClick={onClose} style={{flex:1,padding:"11px",border:"1.5px solid #e2e8f0",borderRadius:10,background:"#fff",color:"#475569",fontWeight:600,fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>Annuler</button>
        <button onClick={()=>{
          setStep("processing");
          (async () => {
            try {
              // Si downgrade : désactiver les postes excédentaires en Supabase
              if (impact && impact.postesASusprimer > 0 && !isDemoMode) {
                const sb = getSupabaseClient();
                const actifs = (pharmacie.postes||[]).filter(p=>p.actif);
                for (let i = actifs.length-1; i >= selected.maxPostes; i--) {
                  await sb.from("postes").update({ actif: false }).eq("id", actifs[i].id);
                }
              }
              await onConfirm(selected.id);
              setStep("done");
            } catch(e) {
              console.error("[PlanSwitcher]", e.message);
              setStep("done"); // afficher done quand même
            }
          })();
        }} style={{flex:2,padding:"11px",border:"none",borderRadius:10,background:impact.isUpgrade?selected.color:"#92400e",color:"#fff",fontWeight:800,fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>
          {impact.isUpgrade?`↑ Passer en ${selected.label}`:`↓ Rétrograder en ${selected.label}`}
        </button>
      </div>
    </div>
  );

  return (
    <div>
      <div style={{marginBottom:18}}>
        <h3 style={{fontWeight:900,fontSize:18,color:"#0f172a",marginBottom:4,marginTop:0}}>Changer de plan</h3>
        <div style={{display:"inline-flex",background:"#f1f5f9",borderRadius:10,padding:3,gap:3}}>
          {[["monthly","Mensuel"],["annual","Annuel −20%"]].map(([k,l])=>(
            <button key={k} onClick={()=>setBillingCycle(k)} style={{padding:"5px 14px",border:"none",borderRadius:8,cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:billingCycle===k?700:500,background:billingCycle===k?"#fff":"transparent",color:billingCycle===k?"#1a1a1a":"#94a3b8"}}>{l}</button>
          ))}
        </div>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:18}}>
        {PLAN_ORDER.map(planId=>{
          const plan=PLAN_LIMITS[planId]; const isCurrent=pharmacie.plan===planId;
          const isSelected=selected?.id===planId; const price=billingCycle==="annual"?plan.priceAnnual:plan.price;
          const isUpgrade=PLAN_ORDER.indexOf(planId)>PLAN_ORDER.indexOf(pharmacie.plan);
          const isDowngrade=PLAN_ORDER.indexOf(planId)<PLAN_ORDER.indexOf(pharmacie.plan);
          const imp=computeImpact(pharmacie,postes||[],planId);
          return (
            <div key={planId} onClick={()=>!isCurrent&&setSelected(plan)}
              style={{borderRadius:12,padding:"14px 16px",border:isSelected?`2px solid ${plan.color}`:isCurrent?`2px solid ${plan.color}55`:"2px solid #e2e8f0",background:isSelected?`${plan.color}08`:isCurrent?`${plan.color}04`:"#fff",cursor:isCurrent?"default":"pointer",display:"flex",alignItems:"center",gap:14}}>
              <div style={{width:42,height:42,borderRadius:10,background:isCurrent?plan.color:`${plan.color}18`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{plan.icon}</div>
              <div style={{flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2}}>
                  <span style={{fontWeight:800,fontSize:14,color:"#0f172a"}}>{plan.label}</span>
                  {isCurrent&&<span style={{fontSize:9,fontWeight:800,background:plan.color,color:"#fff",padding:"1px 7px",borderRadius:20}}>ACTUEL</span>}
                  {isUpgrade&&!isCurrent&&<span style={{fontSize:9,fontWeight:700,background:"#dcfce7",color:"#15803d",padding:"1px 7px",borderRadius:20}}>↑ HAUSSE</span>}
                  {isDowngrade&&<span style={{fontSize:9,fontWeight:700,background:"#fff7ed",color:"#92400e",padding:"1px 7px",borderRadius:20}}>↓ BAISSE</span>}
                </div>
                <div style={{fontSize:11,color:"#64748b"}}>{plan.maxPostes===999?"Illimité":`${plan.maxPostes} postes`} · {plan.maxOrdos===99999?"∞":`${plan.maxOrdos}`} ordo/mois</div>
                {isDowngrade&&imp.postesASusprimer>0&&<div style={{fontSize:11,color:"#dc2626",fontWeight:600,marginTop:2}}>⚠️ {imp.postesASusprimer} poste(s) désactivé(s)</div>}
              </div>
              <div style={{textAlign:"right",flexShrink:0}}>
                <div style={{fontWeight:900,fontSize:20,color:isCurrent?"#94a3b8":plan.color}}>{price}</div>
                <div style={{fontSize:11,color:"#94a3b8"}}>€/mois</div>
              </div>
              <div style={{width:20,height:20,borderRadius:"50%",border:`2px solid ${isSelected?plan.color:"#e2e8f0"}`,background:isSelected?plan.color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                {(isSelected||isCurrent)&&<div style={{width:7,height:7,borderRadius:"50%",background:isSelected?"#fff":plan.color}}/>}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{display:"flex",gap:10}}>
        <button onClick={onClose} style={{flex:1,padding:"11px",border:"1.5px solid #e2e8f0",borderRadius:10,background:"#fff",color:"#475569",fontWeight:600,fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>Annuler</button>
        <button disabled={!selected} onClick={()=>selected&&setStep("confirm")}
          style={{flex:2,padding:"11px",border:"none",borderRadius:10,background:!selected?"#e2e8f0":selected.color,color:!selected?"#94a3b8":"#fff",fontWeight:800,fontSize:14,cursor:!selected?"default":"pointer",fontFamily:"inherit"}}>
          {!selected?"Sélectionnez un plan":`Continuer avec ${selected.label} →`}
        </button>
      </div>
    </div>
  );
}

function PlanSwitcherModal({ pharmacie, postes, onConfirm, onClose }) {
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:2000,padding:24}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"#fff",borderRadius:20,padding:28,maxWidth:520,width:"100%",maxHeight:"90vh",overflowY:"auto",boxShadow:"0 24px 60px rgba(0,0,0,0.3)",fontFamily:"'Inter',system-ui,sans-serif"}}>
        <PlanSwitcher pharmacie={pharmacie} postes={postes} onConfirm={onConfirm} onClose={onClose}/>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ABONNEMENT & COMPTE (ParametresTab sub-sections)
// ═══════════════════════════════════════════════════════════════════════════════


// ─── Section Offres Stories (Premium) ────────────────────────────────────────
function OffresSection({ pharmacie, planInfo }) {
  const isPremium = planInfo?.offresStories === true;
  const [offres, setOffres]     = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState({ type:"promo", titre:"", description:"", emoji:"🎁", badge:"", couleur:"#1a3a6e", actif:true, date_fin:"" });
  const [saving, setSaving]     = useState(false);
  const sb = getSupabaseClient();

  // Types d'offres
  const TYPES = [
    { id:"promo",    label:"Promotion",   emoji:"🏷️", desc:"Réduction sur un produit" },
    { id:"service",  label:"Service",     emoji:"🩺", desc:"Mise en avant d'un service" },
    { id:"fidelite", label:"Fidélité",    emoji:"🎁", desc:"Offre de fidélité" },
  ];

  useEffect(() => {
    if (!isPremium || !sb) return;
    sb.from("offres_stories").select("*").eq("pharmacie_id", pharmacie.id).order("created_at", { ascending: false })
      .then(({ data }) => { if (data) setOffres(data); });
  }, [isPremium]);

  async function saveOffre() {
    if (!form.titre.trim()) return;
    setSaving(true);
    const payload = { ...form, pharmacie_id: pharmacie.id };
    if (sb && !isDemoMode) {
      const { data } = await sb.from("offres_stories").insert(payload).select().single();
      if (data) setOffres(prev => [data, ...prev]);
    } else {
      setOffres(prev => [{ ...payload, id: `o${Date.now()}`, created_at: new Date().toISOString() }, ...prev]);
    }
    setForm({ type:"promo", titre:"", description:"", emoji:"🎁", badge:"", couleur:"#1a3a6e", actif:true, date_fin:"" });
    setShowForm(false);
    setSaving(false);
  }

  async function toggleOffre(id, actif) {
    setOffres(prev => prev.map(o => o.id === id ? { ...o, actif: !actif } : o));
    if (sb && !isDemoMode) await sb.from("offres_stories").update({ actif: !actif }).eq("id", id);
  }

  async function deleteOffre(id) {
    setOffres(prev => prev.filter(o => o.id !== id));
    if (sb && !isDemoMode) await sb.from("offres_stories").delete().eq("id", id);
  }

  // Paywall si pas premium
  if (!isPremium) return (
    <div style={{ background:"#fff", borderRadius:14, padding:28, boxShadow:"0 2px 10px rgba(0,0,0,0.07)", textAlign:"center" }}>
      <div style={{ fontSize:48, marginBottom:12 }}>💎</div>
      <div style={{ fontWeight:900, fontSize:18, color:"#1a1a1a", marginBottom:8 }}>Offres & Promotions en Stories</div>
      <div style={{ fontSize:14, color:"#64748b", lineHeight:1.7, marginBottom:20, maxWidth:340, margin:"0 auto 20px" }}>
        Diffusez vos promotions, services et offres de fidélité directement dans les stories vues par vos patients pendant leur attente.<br/><br/>
        Fonctionnalité disponible avec le plan <strong>Premium</strong>.
      </div>
      <div style={{ background:"#fef9f0", border:"1.5px solid #f59e0b", borderRadius:12, padding:"16px 20px", marginBottom:20, display:"inline-block", textAlign:"left" }}>
        <div style={{ fontWeight:800, fontSize:15, color:"#92400e", marginBottom:8 }}>💎 Plan Premium — 119€/mois</div>
        {["Postes illimités","Offres & Promotions en Stories","Ordonnances illimitées","Support prioritaire"].map(f=>(
          <div key={f} style={{ fontSize:13, color:"#78350f", marginBottom:4 }}>✅ {f}</div>
        ))}
      </div>
      <br/>
      <button style={{ padding:"12px 28px", border:"none", borderRadius:12, background:"#b45309", color:"#fff", fontWeight:800, fontSize:15, cursor:"pointer", fontFamily:"inherit" }}>
        Passer en Premium →
      </button>
    </div>
  );

  return (
    <div style={{ background:"#fff", borderRadius:14, padding:22, boxShadow:"0 2px 10px rgba(0,0,0,0.07)" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:18 }}>
        <div>
          <div style={{ fontWeight:800, fontSize:15 }}>🎯 Offres & Promotions</div>
          <div style={{ fontSize:12, color:"#64748b", marginTop:2 }}>Affichées dans les stories de vos patients en attente</div>
        </div>
        <button onClick={()=>setShowForm(true)}
          style={{ padding:"8px 16px", border:"none", borderRadius:10, background:"#1a3a6e", color:"#fff", fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>
          + Nouvelle offre
        </button>
      </div>

      {/* Formulaire création */}
      {showForm && (
        <div style={{ background:"#f8faff", border:"1.5px solid #e0e7ff", borderRadius:12, padding:18, marginBottom:18 }}>
          <div style={{ fontWeight:700, fontSize:14, marginBottom:14 }}>Créer une offre</div>

          {/* Type */}
          <div style={{ display:"flex", gap:8, marginBottom:14 }}>
            {TYPES.map(t=>(
              <button key={t.id} onClick={()=>setForm(f=>({...f,type:t.id}))}
                style={{ flex:1, padding:"8px 4px", border:`2px solid ${form.type===t.id?"#1a3a6e":"#e0e7ff"}`, borderRadius:10,
                  background:form.type===t.id?"#1a3a6e":"#fff", color:form.type===t.id?"#fff":"#374151",
                  fontWeight:700, fontSize:12, cursor:"pointer", fontFamily:"inherit", textAlign:"center" }}>
                <div style={{ fontSize:18, marginBottom:2 }}>{t.emoji}</div>
                <div>{t.label}</div>
              </button>
            ))}
          </div>

          {/* Emoji + titre */}
          <div style={{ display:"flex", gap:8, marginBottom:10 }}>
            <input value={form.emoji} onChange={e=>setForm(f=>({...f,emoji:e.target.value}))}
              style={{ width:52, border:"1.5px solid #e0e7ff", borderRadius:8, padding:"8px", fontSize:20, textAlign:"center", fontFamily:"inherit" }}/>
            <input value={form.titre} onChange={e=>setForm(f=>({...f,titre:e.target.value}))}
              placeholder="Titre de l'offre (ex: -20% sur Doliprane)"
              style={{ flex:1, border:"1.5px solid #e0e7ff", borderRadius:8, padding:"8px 12px", fontSize:14, fontFamily:"inherit" }}/>
          </div>

          {/* Description */}
          <textarea value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))}
            placeholder="Description courte (1-2 lignes)"
            rows={2}
            style={{ width:"100%", border:"1.5px solid #e0e7ff", borderRadius:8, padding:"8px 12px", fontSize:13, fontFamily:"inherit", resize:"none", marginBottom:10 }}/>

          {/* Badge + couleur + date fin */}
          <div style={{ display:"flex", gap:8, marginBottom:14 }}>
            <input value={form.badge} onChange={e=>setForm(f=>({...f,badge:e.target.value}))}
              placeholder='Badge (ex: "-20%")'
              style={{ flex:1, border:"1.5px solid #e0e7ff", borderRadius:8, padding:"8px 12px", fontSize:13, fontFamily:"inherit" }}/>
            <input type="color" value={form.couleur} onChange={e=>setForm(f=>({...f,couleur:e.target.value}))}
              style={{ width:44, height:38, border:"1.5px solid #e0e7ff", borderRadius:8, cursor:"pointer", padding:2 }}/>
            <input type="date" value={form.date_fin} onChange={e=>setForm(f=>({...f,date_fin:e.target.value}))}
              style={{ flex:1, border:"1.5px solid #e0e7ff", borderRadius:8, padding:"8px 12px", fontSize:13, fontFamily:"inherit" }}/>
          </div>

          {/* Preview story */}
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:11, fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>Aperçu story</div>
            <div style={{ width:120, height:200, borderRadius:16, background:`linear-gradient(160deg,${form.couleur},${form.couleur}99)`, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:10, textAlign:"center", boxShadow:"0 4px 16px rgba(0,0,0,0.15)" }}>
              {form.badge && <div style={{ background:"rgba(255,255,255,0.25)", borderRadius:20, padding:"2px 8px", fontSize:11, fontWeight:900, color:"#fff", marginBottom:6 }}>{form.badge}</div>}
              <div style={{ fontSize:28, marginBottom:6 }}>{form.emoji||"🎁"}</div>
              <div style={{ fontSize:11, fontWeight:800, color:"#fff", lineHeight:1.3 }}>{form.titre||"Titre"}</div>
              {form.description && <div style={{ fontSize:9, color:"rgba(255,255,255,0.8)", marginTop:4, lineHeight:1.4 }}>{form.description.slice(0,40)}</div>}
            </div>
          </div>

          <div style={{ display:"flex", gap:8 }}>
            <button onClick={()=>setShowForm(false)}
              style={{ flex:1, padding:"10px", border:"1.5px solid #e0e7ff", borderRadius:10, background:"#fff", color:"#374151", fontWeight:600, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>
              Annuler
            </button>
            <button onClick={saveOffre} disabled={!form.titre.trim()||saving}
              style={{ flex:2, padding:"10px", border:"none", borderRadius:10, background:"#1a3a6e", color:"#fff", fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>
              {saving ? "Enregistrement…" : "✅ Publier l'offre"}
            </button>
          </div>
        </div>
      )}

      {/* Liste des offres */}
      {offres.length === 0 && !showForm && (
        <div style={{ textAlign:"center", padding:"32px 0", color:"#94a3b8" }}>
          <div style={{ fontSize:36, marginBottom:8 }}>🎯</div>
          <div style={{ fontSize:14, fontWeight:600 }}>Aucune offre créée</div>
          <div style={{ fontSize:12, marginTop:4 }}>Créez votre première offre pour l'afficher dans les stories</div>
        </div>
      )}
      {offres.map(offre => (
        <div key={offre.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 14px", border:`1.5px solid ${offre.actif?"#e0e7ff":"#f1f5f9"}`, borderRadius:12, marginBottom:8, background:offre.actif?"#f8faff":"#f8f9fa" }}>
          <div style={{ width:44, height:44, borderRadius:10, background:`linear-gradient(135deg,${offre.couleur||"#1a3a6e"},${offre.couleur||"#1a3a6e"}88)`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, flexShrink:0 }}>
            {offre.emoji||"🎁"}
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontWeight:700, fontSize:14, color:offre.actif?"#1a1a1a":"#94a3b8", display:"flex", alignItems:"center", gap:6 }}>
              {offre.titre}
              {offre.badge && <span style={{ fontSize:10, background:"#fef3c7", color:"#92400e", borderRadius:20, padding:"1px 7px", fontWeight:800 }}>{offre.badge}</span>}
              <span style={{ fontSize:10, background:offre.type==="promo"?"#fee2e2":offre.type==="service"?"#dbeafe":"#dcfce7", color:offre.type==="promo"?"#dc2626":offre.type==="service"?"#1e40af":"#15803d", borderRadius:20, padding:"1px 7px", fontWeight:700 }}>
                {offre.type==="promo"?"Promotion":offre.type==="service"?"Service":"Fidélité"}
              </span>
            </div>
            {offre.description && <div style={{ fontSize:12, color:"#64748b", marginTop:2, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{offre.description}</div>}
            {offre.date_fin && <div style={{ fontSize:11, color:"#f59e0b", marginTop:2 }}>Jusqu'au {new Date(offre.date_fin).toLocaleDateString("fr-FR")}</div>}
          </div>
          <div style={{ display:"flex", gap:6, flexShrink:0 }}>
            <button onClick={()=>toggleOffre(offre.id, offre.actif)}
              style={{ padding:"5px 10px", border:`1.5px solid ${offre.actif?"#e0e7ff":"#bbf7d0"}`, borderRadius:8, background:offre.actif?"#fff":"#f0fdf4", color:offre.actif?"#64748b":"#15803d", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
              {offre.actif?"Pause":"▶ Activer"}
            </button>
            <button onClick={()=>deleteOffre(offre.id)}
              style={{ padding:"5px 8px", border:"1.5px solid #fee2e2", borderRadius:8, background:"#fff5f5", color:"#dc2626", fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}


function AbonnementSection({ pharmacie, onUpgrade }) {
  const [showPlanSwitcher, setShowPlanSwitcher] = useState(false);
  const plan = PLAN_LIMITS[pharmacie.plan] || PLAN_LIMITS.starter;
  const postes = pharmacie.postes || [];
  const postesActifs = postes.filter(p=>p.actif).length;
  const ordos = (pharmacie.ordonnances||[]).length;
  const invoices = [
    {id:"INV-2025-006",date:"15/06/2025",desc:`OrdoMail ${plan.label} — Juin 2025`,amount:plan.price,status:"paid"},
    {id:"INV-2025-005",date:"15/05/2025",desc:`OrdoMail ${plan.label} — Mai 2025`,amount:plan.price,status:"paid"},
    {id:"INV-2025-004",date:"15/04/2025",desc:`OrdoMail ${plan.label} — Avril 2025`,amount:plan.price,status:"paid"},
  ];
  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{background:"#fff",borderRadius:14,padding:22,boxShadow:"0 2px 10px rgba(0,0,0,0.07)",border:`2px solid ${plan.color}22`}}>
        <div style={{fontWeight:800,fontSize:15,marginBottom:14,display:"flex",alignItems:"center",gap:8}}>💳 Abonnement actuel</div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:`${plan.color}08`,border:`1px solid ${plan.color}33`,borderRadius:12,padding:"14px 16px",marginBottom:14}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{width:42,height:42,borderRadius:11,background:plan.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>{plan.icon}</div>
            <div><div style={{fontWeight:900,fontSize:17,color:"#0f172a"}}>OrdoMail {plan.label}</div><div style={{fontSize:12,color:"#64748b"}}>Facturation mensuelle</div></div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontWeight:900,fontSize:24,color:plan.color}}>{plan.price} <span style={{fontSize:13,fontWeight:400,color:"#94a3b8"}}>€/mois</span></div>
            <div style={{fontSize:11,color:"#94a3b8"}}>Prochain : 15/07/2025</div>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
          {[[`🖥️ Postes actifs`,postesActifs,plan.maxPostes===999?null:plan.maxPostes,plan.maxPostes===999?0.1:postesActifs/plan.maxPostes],
            [`📋 Ordonnances`,ordos,plan.maxOrdos===99999?null:plan.maxOrdos,plan.maxOrdos===99999?0.1:ordos/plan.maxOrdos]
          ].map(([label,used,max,ratio])=>(
            <div key={label} style={{background:"#f8fafc",borderRadius:10,padding:"12px 14px"}}>
              <div style={{fontSize:12,color:"#64748b",marginBottom:4}}>{label}</div>
              <div style={{fontWeight:800,fontSize:18,color:ratio>0.8?"#ef4444":"#1a1a1a"}}>{used}{max?<span style={{fontSize:12,fontWeight:400,color:"#94a3b8"}}> / {max}</span>:<span style={{fontSize:12,fontWeight:400,color:"#94a3b8"}}> / ∞</span>}</div>
              <div style={{marginTop:5,height:4,background:"#e2e8f0",borderRadius:4}}><div style={{width:`${Math.min(ratio*100,100)}%`,height:"100%",background:ratio>0.8?"#ef4444":plan.color,borderRadius:4}}/></div>
            </div>
          ))}
        </div>
        <div style={{borderTop:"1px solid #f0f4ff",paddingTop:12,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <button onClick={()=>setShowPlanSwitcher(true)} style={{padding:"10px 18px",border:"none",borderRadius:10,background:"#1a3a6e",color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>↕ Changer de plan</button>
          {plan.id!=="starter"&&<button onClick={()=>setShowPlanSwitcher(true)} style={{padding:"8px 14px",border:"1.5px solid #e2e8f0",borderRadius:10,background:"#fff",color:"#94a3b8",fontWeight:600,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>↓ Rétrograder</button>}
        </div>
      </div>
      <div style={{background:"#fff",borderRadius:14,padding:22,boxShadow:"0 2px 10px rgba(0,0,0,0.07)"}}>
        <div style={{fontWeight:800,fontSize:15,marginBottom:14}}>🧾 Historique</div>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
          <thead><tr style={{borderBottom:"2px solid #f0f4ff"}}>
            {["N°","Date","Description","Montant","",""].map(h=><th key={h} style={{padding:"0 0 8px",textAlign:"left",fontSize:10,fontWeight:700,color:"#94a3b8",textTransform:"uppercase"}}>{h}</th>)}
          </tr></thead>
          <tbody>{invoices.map(inv=>(
            <tr key={inv.id} style={{borderBottom:"1px solid #f8fafc"}}>
              <td style={{padding:"9px 0",fontFamily:"monospace",fontSize:10,color:"#94a3b8"}}>{inv.id}</td>
              <td style={{padding:"9px 0",color:"#475569"}}>{inv.date}</td>
              <td style={{padding:"9px 0",color:"#1a1a1a",fontWeight:500}}>{inv.desc}</td>
              <td style={{padding:"9px 0",fontWeight:800}}>{inv.amount} €</td>
              <td style={{padding:"9px 0"}}><span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:20,background:"#dcfce7",color:"#166534"}}>✓ Payée</span></td>
              <td style={{padding:"9px 0",textAlign:"right"}}><button onClick={()=>openInvoicePDF(inv,pharmacie,pharmacie.plan)} style={{fontSize:11,color:"#3b82f6",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>📄 PDF</button></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {showPlanSwitcher&&<PlanSwitcherModal pharmacie={pharmacie} postes={pharmacie.postes||[]} onConfirm={(newPlan)=>{onUpgrade(newPlan);setShowPlanSwitcher(false);}} onClose={()=>setShowPlanSwitcher(false)}/>}
    </div>
  );
}

function CompteSection({ pharmacie, postes, planInfo, onUpgrade }) {
  const [pwdOld,setPwdOld]=useState(""); const [pwdNew,setPwdNew]=useState(""); const [pwdMsg,setPwdMsg]=useState(null);
  const [showPlanSwitcher,setShowPlanSwitcher]=useState(false);
  const plan=planInfo||PLAN_LIMITS[pharmacie.plan]||PLAN_LIMITS.starter;
  const postesActifs=(postes||[]).filter(p=>p.actif).length;
  const ordosTraitees=(pharmacie.ordonnances||[]).filter(o=>o.status==="imprime").length;
  const invoices=[
    {id:"INV-2025-006",date:"15/06/2025",desc:`OrdoMail ${plan.label} — Juin 2025`,amount:plan.price},
    {id:"INV-2025-005",date:"15/05/2025",desc:`OrdoMail ${plan.label} — Mai 2025`,amount:plan.price},
    {id:"INV-2025-004",date:"15/04/2025",desc:`OrdoMail ${plan.label} — Avril 2025`,amount:plan.price},
    {id:"INV-2025-003",date:"15/03/2025",desc:`OrdoMail ${plan.label} — Mars 2025`,amount:plan.price},
    {id:"INV-2025-002",date:"15/02/2025",desc:`OrdoMail ${plan.label} — Fév. 2025`,amount:plan.price},
    {id:"INV-2025-001",date:"15/01/2025",desc:`OrdoMail ${plan.label} — Jan. 2025`,amount:plan.price},
  ];
  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      {/* Infos compte */}
      <div style={{background:"#fff",borderRadius:14,padding:22,boxShadow:"0 2px 10px rgba(0,0,0,0.07)"}}>
        <div style={{fontWeight:800,fontSize:15,marginBottom:16}}>👤 Informations du compte</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:18}}>
          {[["Email",pharmacie.email],["Pharmacie",pharmacie.nom],["Membre depuis",new Date(pharmacie.createdAt).toLocaleDateString("fr-FR")],["Ordonnances traitées",ordosTraitees],["Postes configurés",`${postesActifs} actifs / ${(postes||[]).length} total`]].map(([l,v])=>(
            <div key={l} style={{background:"#f8f9ff",borderRadius:10,padding:"10px 13px"}}>
              <div style={{fontSize:10,color:"#94a3b8",fontWeight:700,textTransform:"uppercase",letterSpacing:0.5,marginBottom:3}}>{l}</div>
              <div style={{fontSize:13,fontWeight:600,color:"#1a1a1a"}}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{borderTop:"1px solid #f0f4ff",paddingTop:14}}>
          <div style={{fontSize:13,fontWeight:700,color:"#374151",marginBottom:10}}>🔑 Mot de passe</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
            <Input label="Actuel" value={pwdOld} onChange={setPwdOld} type="password" placeholder="••••••••" icon="🔒"/>
            <Input label="Nouveau" value={pwdNew} onChange={setPwdNew} type="password" placeholder="••••••••" icon="🔒"/>
          </div>
          <Btn variant="secondary" small onClick={()=>{
            if(!pwdOld||!pwdNew){setPwdMsg({ok:false,text:"Remplissez les deux champs"});return;}
            if(pwdNew.length<6){setPwdMsg({ok:false,text:"6 caractères minimum"});return;}
            setPwdMsg({ok:true,text:"Mot de passe mis à jour ✓"});setPwdOld("");setPwdNew("");setTimeout(()=>setPwdMsg(null),3000);
          }}>Mettre à jour</Btn>
          {pwdMsg&&<div style={{marginTop:8,fontSize:12,fontWeight:600,color:pwdMsg.ok?"#15803d":"#dc2626",padding:"6px 10px",background:pwdMsg.ok?"#dcfce7":"#fee2e2",borderRadius:7}}>{pwdMsg.text}</div>}
        </div>
      </div>
      {/* Abonnement */}
      <div style={{background:"#fff",borderRadius:14,padding:22,boxShadow:"0 2px 10px rgba(0,0,0,0.07)",border:`2px solid ${plan.color}22`}}>
        <div style={{fontWeight:800,fontSize:15,marginBottom:14}}>💳 Abonnement</div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:`${plan.color}08`,borderRadius:12,padding:"14px 16px",marginBottom:12}}>
          <div style={{display:"flex",gap:10,alignItems:"center"}}>
            <div style={{width:40,height:40,borderRadius:10,background:plan.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>{plan.icon}</div>
            <div><div style={{fontWeight:900,fontSize:16}}>OrdoMail {plan.label}</div><div style={{fontSize:12,color:"#64748b"}}>{plan.price} €/mois</div></div>
          </div>
          <button onClick={()=>setShowPlanSwitcher(true)} style={{padding:"9px 16px",border:"none",borderRadius:9,background:"#1a3a6e",color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>↕ Changer</button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          {[[`🖥️ Postes`,postesActifs,plan.maxPostes===999?null:plan.maxPostes],[`📋 Ordonnances`,ordosTraitees,plan.maxOrdos===99999?null:plan.maxOrdos]].map(([l,u,m])=>(
            <div key={l} style={{background:"#f8fafc",borderRadius:9,padding:"10px 12px"}}>
              <div style={{fontSize:11,color:"#64748b",marginBottom:3}}>{l}</div>
              <div style={{fontWeight:800,fontSize:17}}>{u}{m?<span style={{fontSize:11,fontWeight:400,color:"#94a3b8"}}> / {m}</span>:<span style={{fontSize:11,fontWeight:400,color:"#94a3b8"}}> / ∞</span>}</div>
            </div>
          ))}
        </div>
      </div>
      {/* Factures */}
      <div style={{background:"#fff",borderRadius:14,padding:22,boxShadow:"0 2px 10px rgba(0,0,0,0.07)"}}>
        <div style={{fontWeight:800,fontSize:15,marginBottom:14}}>🧾 Historique factures</div>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
          <thead><tr style={{borderBottom:"2px solid #f0f4ff"}}>{["N°","Date","Description","Montant","",""].map(h=><th key={h} style={{padding:"0 0 8px",textAlign:"left",fontSize:10,fontWeight:700,color:"#94a3b8",textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
          <tbody>{invoices.map(inv=>(
            <tr key={inv.id} style={{borderBottom:"1px solid #f8fafc"}}>
              <td style={{padding:"8px 0",fontFamily:"monospace",fontSize:10,color:"#94a3b8"}}>{inv.id}</td>
              <td style={{padding:"8px 0",color:"#475569"}}>{inv.date}</td>
              <td style={{padding:"8px 0",fontWeight:500}}>{inv.desc}</td>
              <td style={{padding:"8px 0",fontWeight:800}}>{inv.amount} €</td>
              <td style={{padding:"8px 0"}}><span style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:20,background:"#dcfce7",color:"#166534"}}>✓</span></td>
              <td style={{padding:"8px 0",textAlign:"right"}}><button onClick={()=>openInvoicePDF(inv,pharmacie,pharmacie.plan)} style={{fontSize:11,color:"#3b82f6",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>📄</button></td>
            </tr>
          ))}</tbody>
        </table>
        <div style={{marginTop:12,padding:"8px 12px",background:"#f8fafc",borderRadius:8,fontSize:12,color:"#94a3b8",display:"flex",justifyContent:"space-between"}}>
          <span>Total 2025</span><span style={{fontWeight:700,color:"#1a1a1a"}}>{invoices.reduce((s,i)=>s+i.amount,0)} €</span>
        </div>
      </div>
      {/* Zone danger */}
      <div style={{background:"#fff",borderRadius:14,padding:20,border:"1px solid #fee2e2"}}>
        <div style={{fontWeight:700,fontSize:14,color:"#dc2626",marginBottom:10}}>⚠️ Zone de danger</div>
        <div style={{fontSize:13,color:"#64748b",marginBottom:12}}>La suppression est définitive. Les données sont conservées 90 jours.</div>
        <Btn variant="danger" small>🗑 Supprimer mon compte</Btn>
      </div>
      {showPlanSwitcher&&<PlanSwitcherModal pharmacie={pharmacie} postes={postes||[]} onConfirm={(p)=>{onUpgrade(p);setShowPlanSwitcher(false);}} onClose={()=>setShowPlanSwitcher(false)}/>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PARAMÈTRES TAB
// ═══════════════════════════════════════════════════════════════════════════════

function ParametresTab({ pharmacie, onSave }) {
  const [section, setSection] = useState("pharmacie");
  const [showUpgrade, setShowUpgrade] = useState(null);
  const [nom, setNom] = useState(pharmacie.nom||"");
  const [adresse, setAdresse] = useState(pharmacie.adresse||"");
  const [couleur, setCouleur] = useState(pharmacie.couleur||"#1a3a6e");
  const [emailNotif, setEmailNotif] = useState(pharmacie.email||"");
  const [smtpHost, setSmtpHost] = useState(pharmacie.smtp?.host||"");
  const [postes, setPostes] = useState(pharmacie.postes||[]);
  const [saved, setSaved] = useState(false);
  const planInfo = PLAN_LIMITS[pharmacie.plan] || PLAN_LIMITS.starter;

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
      const { data, error } = await sb.from("postes")
        .insert({ pharmacie_id: pharmacie.id, nom, actif: true })
        .select().single();
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
    await Promise.all([
      onSave({nom,adresse,couleur,email:emailNotif}),
      savePostes(pharmacie.id, postes.map(p=>({...p,pin:undefined})), pinChanges),
    ]);
    setSaved(true); setTimeout(()=>setSaved(false),2500);
  }

  const tabs = [["pharmacie","🏥","Pharmacie"],["postes","🖥️","Postes"],["offres","🎯","Offres"],["email","✉️","Email"],["abonnement","💳","Abonnement"],["compte","👤","Compte"]];

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

        {section==="pharmacie"&&(
          <div style={{background:"#fff",borderRadius:14,padding:22,boxShadow:"0 2px 10px rgba(0,0,0,0.07)"}}>
            <Input label="Nom de la pharmacie" value={nom} onChange={setNom} placeholder="Pharmacie..." icon="🏥"/>
            <Input label="Adresse" value={adresse} onChange={setAdresse} placeholder="12 rue..." icon="📍"/>
            <div style={{marginBottom:14}}>
              <label style={{fontSize:12,fontWeight:700,color:"#374151",display:"block",marginBottom:5}}>Couleur de la pharmacie</label>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <input type="color" value={couleur} onChange={e=>setCouleur(e.target.value)} style={{width:40,height:40,border:"none",cursor:"pointer",borderRadius:8}}/>
                <span style={{fontSize:14,fontFamily:"monospace",fontWeight:700,color:couleur}}>{couleur}</span>
                <div style={{width:32,height:32,borderRadius:8,background:couleur}}/>
              </div>
            </div>
          </div>
        )}

        {section==="postes"&&(
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
                        if(sb && !isDemoMode) {
                          await sb.functions.invoke("update-pin", { body:{ posteId: poste.id, pin: v } });
                        }
                        setPostes(prev=>prev.map(p=>p.id===poste.id?{...p,_pinSaved:true}:p));
                      } catch(err) {
                        console.error("[PIN save]", err.message);
                      }
                    }}
                    placeholder="••••"
                    style={{width:80,border:`1.5px solid ${poste._pinSaved?"#15803d":poste.pin&&poste.pin.length===4?"#f59e0b":"#c7d2fe"}`,borderRadius:6,padding:"4px 10px",fontSize:16,fontFamily:"monospace",textAlign:"center",outline:"none",transition:"border 0.2s"}}/>
                  <span style={{fontSize:11,fontWeight:600,color:poste._pinSaved?"#15803d":poste.pin&&poste.pin.length===4?"#f59e0b":"#94a3b8"}}>
                    {poste._pinSaved?"✅ Enregistré":poste.pin&&poste.pin.length===4?"⏳ Saisissez pour enregistrer":"⚠️ PIN manquant"}
                  </span>
                  <span style={{fontSize:10,color:"#94a3b8",marginLeft:"auto"}}>Rôle : Vendeur</span>
                </div>
              </div>
            ))}
            <Btn variant="ghost" small onClick={addPoste} style={{width:"100%",justifyContent:"center",borderStyle:"dashed",marginTop:4}}>+ Ajouter un poste</Btn>
            <div style={{marginTop:16,background:"#f0f7ff",borderRadius:12,padding:"14px 16px",border:"1px solid #dbeafe"}}>
              <div style={{fontWeight:700,fontSize:13,color:"#1a3a6e",marginBottom:8}}>Qui accède à quoi ?</div>
              <div style={{display:"flex",flexDirection:"column",gap:5}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"6px 10px",background:"#fff",borderRadius:8}}>
                  <span style={{fontWeight:700,color:"#1a3a6e"}}>👑 Titulaire (PSC)</span>
                  <span style={{color:"#15803d",fontWeight:600}}>Accès complet</span>
                </div>
                {postes.filter(p=>p.actif).map(p=>(
                  <div key={p.id} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"6px 10px",background:"#fff",borderRadius:8}}>
                    <span style={{fontWeight:600,color:"#475569"}}>🖥️ {p.nom} · PIN {p.pin?"•".repeat(p.pin.length):"—"}</span>
                    <span style={{color:"#0369a1",fontWeight:600}}>Ordonnances + Impression</span>
                  </div>
                ))}
              </div>
              <div style={{marginTop:8,fontSize:11,color:"#64748b",lineHeight:1.6}}>ℹ️ C'est le titulaire qui crée et modifie les codes PIN depuis cette page.</div>
            </div>
          </div>
        )}

        {section==="email"&&(
          <div style={{background:"#fff",borderRadius:14,padding:22,boxShadow:"0 2px 10px rgba(0,0,0,0.07)"}}>
            <div style={{fontWeight:800,fontSize:15,marginBottom:14}}>✉️ Configuration email</div>
            <div style={{background:"#f0f7ff",borderRadius:10,padding:"10px 14px",marginBottom:14,border:"1px solid #dbeafe",fontSize:13}}>
              <div style={{fontWeight:700,color:"#1a3a6e",marginBottom:4}}>Adresse de réception ordonnances</div>
              <code style={{fontSize:13,color:"#0369a1"}}>{pharmacie.emailReception||`${pharmacie.id}@in.ordomail.fr`}</code>
              <div style={{fontSize:11,color:"#64748b",marginTop:4}}>Les patients envoient leurs ordonnances à cette adresse. Elle est automatiquement traitée par OrdoMail.</div>
            </div>
            <Input label="Email de notification" value={emailNotif} onChange={setEmailNotif} type="email" placeholder="contact@pharmacie.fr" icon="✉️"/>
            <div style={{borderTop:"1px solid #f0f4ff",paddingTop:14,marginTop:4}}>
              <div style={{fontSize:13,fontWeight:700,color:"#374151",marginBottom:10}}>SMTP personnalisé (optionnel)</div>
              <Input label="Serveur SMTP" value={smtpHost} onChange={setSmtpHost} placeholder="smtp.gmail.com" icon="🌐"/>
            </div>
          </div>
        )}

        {section==="offres"&&(
          <OffresSection pharmacie={pharmacie} planInfo={planInfo}/>
        )}
        {section==="abonnement"&&(
          <AbonnementSection pharmacie={pharmacie} onUpgrade={async (newPlan)=>{
            try {
              await changePlan(pharmacie.id, newPlan);
              // Recharger la pharmacie depuis Supabase pour avoir le bon plan
              const sb = getSupabaseClient();
              if (sb) {
                const { data: ph } = await sb.from("pharmacies").select("*, postes(*)").eq("id", pharmacie.id).maybeSingle();
                if (ph) {
                  setPharmacie(ph);
                  setPostes(ph.postes || []);
                }
              } else {
                onSave({...pharmacie, plan: newPlan});
              }
            } catch(e) {
              console.error("[changePlan]", e.message);
            }
          }}/>
        )}

        {section==="compte"&&(
          <CompteSection pharmacie={pharmacie} postes={postes} planInfo={planInfo} onUpgrade={async (newPlan)=>{
            try {
              await changePlan(pharmacie.id, newPlan);
              const sb = getSupabaseClient();
              if (sb) {
                const { data: ph } = await sb.from("pharmacies").select("*, postes(*)").eq("id", pharmacie.id).maybeSingle();
                if (ph) { setPharmacie(ph); setPostes(ph.postes || []); }
              } else {
                onSave({...pharmacie, plan: newPlan});
              }
            } catch(e) { console.error("[changePlan]", e.message); }
          }}/>
        )}

      </div>

      {showUpgrade&&(
        <UpgradeModal currentPlan={pharmacie.plan} reason={showUpgrade.reason}
          onConfirm={async (newPlan)=>{
            try {
              await changePlan(pharmacie.id, newPlan);
              setShowUpgrade(null);
              // Recharger depuis Supabase
              const sb = getSupabaseClient();
              if (sb) {
                const { data: ph } = await sb.from("pharmacies").select("*, postes(*)").eq("id", pharmacie.id).maybeSingle();
                if (ph) { setPharmacie(ph); setPostes(ph.postes || []); }
              } else {
                onSave({...pharmacie, plan: newPlan});
              }
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

// ═══════════════════════════════════════════════════════════════════════════════
// BACKOFFICE — BillingAdmin + PricingEditor
// ═══════════════════════════════════════════════════════════════════════════════

function PricingEditor() {
  const [plans,setPlans]=useState(()=>Object.entries(PLAN_LIMITS).map(([id,p])=>({...p,id})));
  const [saved,setSaved]=useState(false);
  function update(planId,field,value){setPlans(prev=>prev.map(p=>p.id===planId?{...p,[field]:field.includes("price")||field.includes("max")?Number(value):value}:p));setSaved(false);}
  function save(){plans.forEach(p=>{PLAN_LIMITS[p.id]={...p};});setSaved(true);setTimeout(()=>setSaved(false),3000);}
  return (
    <div style={{maxWidth:900,margin:"0 auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div><div style={{fontWeight:800,fontSize:20,color:"#fff"}}>Éditeur de pricing</div><div style={{fontSize:13,color:"#64748b",marginTop:2}}>Modifications en temps réel</div></div>
        <button onClick={save} style={{padding:"10px 24px",border:"none",borderRadius:10,background:saved?"#15803d":"#3b82f6",color:"#fff",fontWeight:800,fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>{saved?"✅ Sauvegardé":"💾 Sauvegarder"}</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,260px),1fr))",gap:16,marginBottom:24}}>
        {plans.map(plan=>(
          <div key={plan.id} style={{background:"#1e293b",borderRadius:14,padding:20,border:`2px solid #334155`}}>
            <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:14}}>
              <input value={plan.icon} onChange={e=>update(plan.id,"icon",e.target.value)} style={{width:34,textAlign:"center",background:"#0f172a",border:"1px solid #334155",borderRadius:6,fontSize:18,padding:"3px 4px",color:"#fff"}}/>
              <input value={plan.label} onChange={e=>update(plan.id,"label",e.target.value)} style={{flex:1,background:"#0f172a",border:"1px solid #334155",borderRadius:6,fontSize:15,fontWeight:700,padding:"5px 10px",color:"#fff",fontFamily:"inherit"}}/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
              {[["price","Mensuel €"],["priceAnnual","Annuel €"]].map(([field,lbl])=>(
                <div key={field}><div style={{fontSize:10,color:"#475569",marginBottom:3}}>{lbl}</div>
                  <input type="number" value={plan[field]} onChange={e=>update(plan.id,field,e.target.value)} style={{width:"100%",background:"#0f172a",border:"1px solid #334155",borderRadius:6,padding:"5px 8px",color:plan.color,fontWeight:900,fontSize:16,fontFamily:"monospace",outline:"none"}}/></div>
              ))}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
              {[["maxPostes","Postes"],["maxOrdos","Ordo/mois"]].map(([field,lbl])=>(
                <div key={field}><div style={{fontSize:10,color:"#475569",marginBottom:3}}>{lbl}</div>
                  <input type="number" value={plan[field]} onChange={e=>update(plan.id,field,e.target.value)} style={{width:"100%",background:"#0f172a",border:"1px solid #334155",borderRadius:6,padding:"5px 8px",color:"#e2e8f0",fontWeight:700,fontSize:13,fontFamily:"monospace",outline:"none"}}/></div>
              ))}
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <input type="color" value={plan.color} onChange={e=>update(plan.id,"color",e.target.value)} style={{width:30,height:30,border:"none",cursor:"pointer",borderRadius:5}}/>
              <input value={plan.color} onChange={e=>update(plan.id,"color",e.target.value)} style={{flex:1,background:"#0f172a",border:"1px solid #334155",borderRadius:6,padding:"4px 8px",color:plan.color,fontWeight:700,fontSize:12,fontFamily:"monospace",outline:"none"}}/>
              <div style={{width:26,height:26,borderRadius:7,background:plan.color}}/>
            </div>
          </div>
        ))}
      </div>
      <div style={{background:"#1e293b",borderRadius:12,padding:18,border:"1px solid #334155"}}>
        <div style={{fontSize:11,fontWeight:700,color:"#64748b",letterSpacing:1,marginBottom:14}}>APERÇU TEMPS RÉEL</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,200px),1fr))",gap:12}}>
          {plans.map(plan=>(
            <div key={plan.id} style={{background:"#fff",borderRadius:10,padding:"14px 12px",border:`2px solid ${plan.color}33`}}>
              <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:8}}><span style={{fontSize:16}}>{plan.icon}</span><span style={{fontWeight:800,fontSize:13,color:"#0f172a"}}>{plan.label}</span></div>
              <div style={{fontWeight:900,fontSize:22,color:plan.color}}>{plan.price}<span style={{fontSize:11,fontWeight:400,color:"#94a3b8"}}> €/mois</span></div>
              <div style={{fontSize:11,color:"#64748b",marginTop:3}}>{plan.maxPostes===999?"Illimité":`${plan.maxPostes} postes`}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}




function BillingAdmin() {
  const [tab,setTab]=useState("dashboard");
  const [filterStatus,setFilterStatus]=useState("all");
  const activeCount=MOCK_SUBSCRIPTIONS.filter(s=>s.status==="active").length;
  const trialCount=MOCK_SUBSCRIPTIONS.filter(s=>s.status==="trialing").length;
  const mrr=MOCK_SUBSCRIPTIONS.filter(s=>s.status==="active").reduce((s,sub)=>s+sub.mrr,0);

  return (
    <div style={{minHeight:"100vh",background:"#0f172a",fontFamily:"'Inter',system-ui,sans-serif",padding:24}}>
      <div style={{display:"flex",gap:6,marginBottom:24,flexWrap:"wrap"}}>
        {[["dashboard","📊 Dashboard"],["subscriptions","📋 Abonnements"],["invoices","🧾 Factures"],["pricing","🏷️ Pricing"]].map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)} style={{padding:"8px 16px",border:"none",borderRadius:8,cursor:"pointer",fontFamily:"inherit",fontSize:13,fontWeight:tab===k?700:500,background:tab===k?"#3b82f6":"#1e293b",color:tab===k?"#fff":"#64748b"}}>{l}</button>
        ))}
      </div>

      {tab==="dashboard"&&(
        <div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,200px),1fr))",gap:14,marginBottom:24}}>
            {[["MRR",`${mrr} €`,"#3b82f6"],["ARR",`${mrr*12} €`,"#10b981"],["Clients actifs",activeCount,"#6366f1"],["En essai",trialCount,"#f59e0b"]].map(([l,v,color])=>(
              <div key={l} style={{background:"#1e293b",borderRadius:12,padding:20,border:`1px solid #334155`}}>
                <div style={{fontSize:12,color:"#64748b",marginBottom:6}}>{l}</div>
                <div style={{fontWeight:900,fontSize:26,color}}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{background:"#1e293b",borderRadius:12,padding:20,border:"1px solid #334155"}}>
            <div style={{fontWeight:700,fontSize:14,color:"#fff",marginBottom:14}}>Derniers abonnements</div>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
              <thead><tr style={{borderBottom:"1px solid #334155"}}>{["Pharmacie","Plan","MRR","Statut","Renouvellement"].map(h=><th key={h} style={{textAlign:"left",padding:"6px 10px",fontSize:11,fontWeight:700,color:"#64748b",textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
              <tbody>{MOCK_SUBSCRIPTIONS.slice(0,5).map(s=>(
                <tr key={s.id} style={{borderBottom:"1px solid #1e293b"}}>
                  <td style={{padding:"9px 10px",color:"#e2e8f0",fontWeight:600}}>{s.pharmacie}</td>
                  <td style={{padding:"9px 10px"}}><span style={{fontSize:11,fontWeight:700,background:"#334155",color:"#94a3b8",padding:"2px 8px",borderRadius:20}}>{PLAN_LIMITS[s.plan]?.icon} {PLAN_LIMITS[s.plan]?.label}</span></td>
                  <td style={{padding:"9px 10px",fontWeight:700,color:"#10b981"}}>{s.mrr} €</td>
                  <td style={{padding:"9px 10px"}}><span style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:20,background:s.status==="active"?"#dcfce7":s.status==="trialing"?"#dbeafe":"#fee2e2",color:s.status==="active"?"#166534":s.status==="trialing"?"#1d4ed8":"#dc2626"}}>{s.status}</span></td>
                  <td style={{padding:"9px 10px",color:"#64748b",fontSize:12}}>{s.renewal}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      {tab==="subscriptions"&&(
        <div style={{background:"#1e293b",borderRadius:12,padding:20,border:"1px solid #334155"}}>
          <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"}}>
            {[["all","Tous"],["active","Actifs"],["trialing","Essai"],["past_due","Impayés"],["canceled","Annulés"]].map(([k,l])=>(
              <button key={k} onClick={()=>setFilterStatus(k)} style={{padding:"5px 12px",border:`1px solid ${filterStatus===k?"#3b82f6":"#334155"}`,borderRadius:7,background:filterStatus===k?"#3b82f6":"transparent",color:filterStatus===k?"#fff":"#64748b",fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>{l}</button>
            ))}
          </div>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
            <thead><tr style={{borderBottom:"1px solid #334155"}}>{["Pharmacie","Plan","Facturation","MRR","Statut","Renouvellement"].map(h=><th key={h} style={{textAlign:"left",padding:"6px 10px",fontSize:11,fontWeight:700,color:"#64748b",textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
            <tbody>{MOCK_SUBSCRIPTIONS.filter(s=>filterStatus==="all"||s.status===filterStatus).map(s=>(
              <tr key={s.id} style={{borderBottom:"1px solid #0f172a"}}>
                <td style={{padding:"9px 10px",color:"#e2e8f0",fontWeight:600}}>{s.pharmacie}</td>
                <td style={{padding:"9px 10px"}}><span style={{fontSize:11,background:"#334155",color:"#94a3b8",padding:"2px 8px",borderRadius:20,fontWeight:700}}>{PLAN_LIMITS[s.plan]?.icon} {PLAN_LIMITS[s.plan]?.label}</span></td>
                <td style={{padding:"9px 10px",color:"#64748b",fontSize:12,textTransform:"capitalize"}}>{s.billing}</td>
                <td style={{padding:"9px 10px",fontWeight:700,color:"#10b981"}}>{s.mrr} €</td>
                <td style={{padding:"9px 10px"}}><span style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:20,background:s.status==="active"?"#dcfce7":s.status==="trialing"?"#dbeafe":s.status==="past_due"?"#fef9c3":"#fee2e2",color:s.status==="active"?"#166534":s.status==="trialing"?"#1d4ed8":s.status==="past_due"?"#92400e":"#dc2626"}}>{s.status}</span></td>
                <td style={{padding:"9px 10px",color:"#64748b",fontSize:12}}>{s.renewal}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {tab==="invoices"&&(
        <div style={{background:"#1e293b",borderRadius:12,padding:20,border:"1px solid #334155"}}>
          <div style={{fontWeight:700,fontSize:14,color:"#fff",marginBottom:14}}>🧾 Factures</div>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
            <thead><tr style={{borderBottom:"1px solid #334155"}}>{["N°","Date","Description","Montant","Statut",""].map(h=><th key={h} style={{textAlign:"left",padding:"6px 10px",fontSize:11,fontWeight:700,color:"#64748b",textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
            <tbody>{MOCK_INVOICES.map(inv=>{
              const sub=MOCK_SUBSCRIPTIONS.find(s=>s.id===inv.subId);
              return (
                <tr key={inv.id} style={{borderBottom:"1px solid #0f172a"}}>
                  <td style={{padding:"9px 10px",fontFamily:"monospace",fontSize:11,color:"#64748b"}}>{inv.id}</td>
                  <td style={{padding:"9px 10px",color:"#94a3b8"}}>{inv.date}</td>
                  <td style={{padding:"9px 10px",color:"#e2e8f0"}}>{inv.desc}</td>
                  <td style={{padding:"9px 10px",fontWeight:800,color:"#fff"}}>{inv.amount} €</td>
                  <td style={{padding:"9px 10px"}}><span style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:20,background:"#dcfce7",color:"#166534"}}>✓ Payée</span></td>
                  <td style={{padding:"9px 10px",textAlign:"right"}}>
                    <button onClick={()=>openInvoicePDF({...inv,desc:inv.desc},{nom:sub?.pharmacie,email:sub?.email},sub?.plan||"starter")} style={{fontSize:12,color:"#3b82f6",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>📄 PDF</button>
                  </td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}

      {tab==="pricing"&&<PricingEditor/>}
    </div>
  );
}


// ─── QR Code généré en pur SVG — aucune dépendance externe ──────────────────
// QRCode — génération via qrcode npm (ESM) importé dynamiquement depuis esm.sh
function QRCode({ url, size = 220, color = "#1a3a6e", printId }) {
  const [dataUrl, setDataUrl] = useState(null);
  const [error, setError]     = useState(false);

  useEffect(() => {
    if (!url) return;
    setDataUrl(null); setError(false);

    // qrcode via esm.sh — transforme le package npm en ESM navigateur natif
    // toDataURL retourne une Promise avec le PNG en base64
    import("https://esm.sh/qrcode@1.5.4")
      .then(mod => {
        const QR = mod.default || mod;
        return QR.toDataURL(url, {
          errorCorrectionLevel: "M",
          margin: 2,
          width: size,
          color: { dark: "#000000", light: "#ffffff" },
          type: "image/png",
        });
      })
      .then(dataURL => setDataUrl(dataURL))
      .catch(err => {
        console.error("[QRCode]", err);
        setError(true);
      });
  }, [url, color, size]);

  if (error) return (
    <div style={{width:size,height:size,display:"flex",alignItems:"center",justifyContent:"center",background:"#fee2e2",borderRadius:8,fontSize:11,color:"#dc2626",textAlign:"center",padding:8}}>
      ⚠️ Erreur génération QR
    </div>
  );

  if (!dataUrl) return (
    <div style={{width:size,height:size,display:"flex",alignItems:"center",justifyContent:"center",background:"#f8fafc",borderRadius:8}}>
      <div style={{fontSize:11,color:"#94a3b8",textAlign:"center"}}>
        <div style={{animation:"spin 1s linear infinite",fontSize:22,marginBottom:4}}>⏳</div>
        Génération QR…
      </div>
    </div>
  );

  return (
    <img
      id={printId || undefined}
      src={dataUrl}
      width={size}
      height={size}
      style={{display:"block",borderRadius:4}}
      alt="QR Code"
    />
  );
}


// ─── Thumbnail fichier avec chargement signed URL ────────────────────────────
function AttachmentThumb({ att, style }) {
  const [src, setSrc] = useState(att?.dataUrl || null);
  useEffect(() => {
    if (src || !att?.path) return;
    getSignedUrl(att.path, 3600).then(url => { if (url) setSrc(url); });
  }, [att?.path]);
  if (!src) return <div style={{...style, background:"#f0f0f0", display:"flex", alignItems:"center", justifyContent:"center", color:"#aaa", fontSize:12}}>⏳</div>;
  return <img src={src} alt="" style={style}/>;
}


// ─── Ordo Card — vue grille ───────────────────────────────────────────────────

// ─── Print Confirm Modal ──────────────────────────────────────────────────────

// ─── Viewer Modal ─────────────────────────────────────────────────────────────
// Images : affichées directement via src="data:..." (fonctionne partout)
// PDF    : ouvert dans un nouvel onglet via window.open(dataUrl)
//          car les iframes/embed avec data: ou blob: sont bloqués dans les environnements sandboxés
function ViewerModal({ att, onClose }) {
  if (!att) return null;

  const isPdf = att.type === "pdf";

  // Pour les PDF : ouvrir dans un nouvel onglet au montage
  useEffect(() => {
    if (!isPdf || !att.dataUrl) return;
    const win = window.open(att.dataUrl, "_blank");
    // Si le navigateur bloque le popup, on reste dans la modale avec le message
    if (win) { win.focus(); onClose(); }
  }, []);

  // Pour les images : affichage inline dans la modale
  if (!isPdf) {
    return (
      <div
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}
        onClick={onClose}
      >
        <div
          style={{ background: "#1e293b", borderRadius: 14, overflow: "hidden", maxWidth: "92vw", maxHeight: "92vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 60px rgba(0,0,0,0.6)" }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div style={{ padding: "12px 18px", borderBottom: "1px solid #334155", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 18 }}>🖼️</span>
              <span style={{ fontWeight: 700, color: "#fff", fontSize: 14 }}>{att.name}</span>
              <span style={{ fontSize: 11, color: "#64748b", background: "#0f172a", padding: "2px 8px", borderRadius: 6 }}>{att.size}</span>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <a href={att.dataUrl} download={att.name} style={{ padding: "6px 12px", border: "1.5px solid #475569", borderRadius: 8, color: "#94a3b8", fontWeight: 600, fontSize: 12, textDecoration: "none", display: "flex", alignItems: "center", gap: 5 }}>⬇️ Télécharger</a>
              <button onClick={onClose} style={{ width: 32, height: 32, border: "none", background: "#334155", borderRadius: 8, color: "#94a3b8", cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
            </div>
          </div>
          {/* Image */}
          <div style={{ flex: 1, overflow: "auto", background: "#0f172a", display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}>
            <img src={att.dataUrl} alt={att.name} style={{ maxWidth: "100%", maxHeight: "80vh", objectFit: "contain", borderRadius: 6 }} />
          </div>
        </div>
      </div>
    );
  }

  // PDF — modale avec bouton "Ouvrir" si window.open a été bloqué
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}
      onClick={onClose}
    >
      <div
        style={{ background: "#1e293b", borderRadius: 16, padding: 32, maxWidth: 420, width: "100%", textAlign: "center", boxShadow: "0 24px 60px rgba(0,0,0,0.5)" }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ fontSize: 52, marginBottom: 14 }}>📄</div>
        <div style={{ fontWeight: 800, fontSize: 18, color: "#fff", marginBottom: 6 }}>{att.name}</div>
        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 24 }}>
          Les PDF s'ouvrent dans un nouvel onglet pour un affichage optimal.
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <a
            href={att.dataUrl}
            target="_blank"
            rel="noreferrer"
            style={{ padding: "12px 24px", border: "none", borderRadius: 10, background: "#3b82f6", color: "#fff", fontWeight: 700, fontSize: 15, textDecoration: "none", display: "flex", alignItems: "center", gap: 8 }}
          >
            🔗 Ouvrir le PDF
          </a>
          <a
            href={att.dataUrl}
            download={att.name}
            style={{ padding: "12px 20px", border: "1.5px solid #475569", borderRadius: 10, background: "transparent", color: "#94a3b8", fontWeight: 600, fontSize: 14, textDecoration: "none", display: "flex", alignItems: "center", gap: 6 }}
          >
            ⬇️ Télécharger
          </a>
        </div>
        <button onClick={onClose} style={{ marginTop: 18, background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 13 }}>Fermer</button>
      </div>
    </div>
  );
}

function PrintConfirmModal({ ordo, couleur, onConfirm, onCancel }) {
  const nom    = ordo.extracted?.nom || ordo.fromName;
  const email  = ordo.fromEmail || "";
  const medecin = ordo.extracted?.medecin || "";
  const date    = ordo.extracted?.date    || "";
  const medicaments = ordo.extracted?.medicaments || [];
  const [step, setStep] = useState("ready");

  async function doPrint() {
    setStep("ready");
    const printArea = document.getElementById("ordomail-print-area");
    if (!printArea) { window.print(); setTimeout(() => setStep("confirm"), 500); return; }

    const att = ordo.attachments?.[0];
    // En prod : charger la signed URL si dataUrl absent mais path disponible
    if (att && !att.dataUrl && att.path) {
      att.dataUrl = await getSignedUrl(att.path, 300); // 5 minutes
    }
    const hasFile = att?.dataUrl;
    const receivedDate = new Date(ordo.receivedAt).toLocaleDateString("fr-FR");
    const receivedTime = new Date(ordo.receivedAt).toLocaleTimeString("fr-FR", {hour:"2-digit",minute:"2-digit"});
    const printedDate = new Date().toLocaleDateString("fr-FR");
    const printedTime = new Date().toLocaleTimeString("fr-FR", {hour:"2-digit",minute:"2-digit"});

    // Bandeau patient affiché dans tous les cas au-dessus du document
    const banner = `<div style="font-family:Arial,sans-serif;padding:10px 16px;background:#1a3a6e;color:#fff;display:flex;justify-content:space-between;align-items:center;page-break-after:avoid">
      <div style="display:flex;align-items:center;gap:14px">
        <div style="font-size:18px;font-weight:900;letter-spacing:0.5px">OrdoMail</div>
        <div style="width:1px;height:24px;background:rgba(255,255,255,0.3)"></div>
        <div>
          <div style="font-size:16px;font-weight:700">${nom || "—"}</div>
          ${email ? `<div style="font-size:12px;opacity:0.8">${email}</div>` : ""}
        </div>
      </div>
      <div style="text-align:right;font-size:11px;opacity:0.75">
        <div>${medecin || ""} ${date ? "· " + date : ""}</div>
        <div>Reçue le ${receivedDate} à ${receivedTime}</div>
        <div>Imprimé le ${printedDate} à ${printedTime}</div>
      </div>
    </div>`;

    if (hasFile && att.type === "image") {
      // ── Cas 1 : image JPEG/PNG — attendre le chargement avant print ──────────
      printArea.innerHTML = banner + `<div style="text-align:center;padding:8px">
        <img id="ordo-print-img" src="${att.dataUrl}" style="max-width:100%;max-height:calc(100vh - 80px);object-fit:contain;display:block;margin:0 auto" />
      </div>`;
      // Attendre que l'image soit chargée avant d'imprimer
      const imgEl = document.getElementById("ordo-print-img");
      await new Promise(resolve => {
        if (imgEl.complete) resolve();
        else { imgEl.onload = resolve; imgEl.onerror = resolve; }
        setTimeout(resolve, 3000); // timeout de sécurité
      });
      window.print();
      setTimeout(() => { printArea.innerHTML = ""; setStep("confirm"); }, 500);

    } else if (hasFile && att.type === "pdf") {
      // ── Cas 2 : PDF — ouvrir dans un nouvel onglet pour impression native ────
      // Le navigateur imprime le PDF dans son viewer natif
      printArea.innerHTML = banner + `<div style="font-family:Arial;padding:20px;text-align:center;color:#555;font-size:14px">
        <div style="font-size:32px;margin-bottom:10px">📄</div>
        <div style="font-weight:700;margin-bottom:6px">${att.name}</div>
        <div>Le PDF s'ouvre dans un nouvel onglet pour l'impression.</div>
      </div>`;
      // Ouvrir le PDF dans un nouvel onglet — le navigateur affiche sa boîte d'impression native
      const pdfWin = window.open("", "_blank");
      if (pdfWin) {
        pdfWin.document.write(
          '<html><head><title>' + (nom || "Ordonnance") + '</title>' +
          '<style>body{margin:0}embed{width:100vw;height:100vh}</style></head>' +
          '<body><embed src="' + att.dataUrl + '" type="application/pdf" /></body></html>'
        );
        pdfWin.document.close();
        pdfWin.onload = () => { pdfWin.focus(); pdfWin.print(); };
      }
      setTimeout(() => { printArea.innerHTML = ""; setStep("confirm"); }, 800);

    } else {
      // ── Cas 3 : pas de fichier — générer PDF via generateOrdoPDF si source email ──
      if (ordo.source === "email") {
        const pdfUrl = generateOrdoPDF(ordo);
        const pdfWin = window.open(pdfUrl, "_blank");
        if (pdfWin) { pdfWin.focus(); }
        setTimeout(() => {
          if (printArea) printArea.innerHTML = "";
          URL.revokeObjectURL(pdfUrl);
          setStep("confirm");
        }, 800);
        return;
      }
      // Fiche de synthèse simple si aucune source
      const medsHtml = medicaments.filter(Boolean).map(m =>
        `<li style="font-size:14px;margin-bottom:5px">${m}</li>`
      ).join("");
      printArea.innerHTML = banner + `<div style="font-family:Arial,sans-serif;padding:20px 28px;max-width:620px;margin:0 auto">
        <div style="background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:12px 16px;margin-bottom:18px;font-size:13px;color:#856404">
          ⚠️ Aucun fichier d'ordonnance joint. Impression de la fiche de synthèse.
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:18px">
          <div style="background:#f8f9ff;padding:14px;border-radius:9px;border:1px solid #dde4f5">
            <div style="font-size:10px;font-weight:700;color:#888;text-transform:uppercase;margin-bottom:5px">Médecin</div>
            <div style="font-size:15px;font-weight:700">${medecin || "—"}</div>
          </div>
          <div style="background:#f8f9ff;padding:14px;border-radius:9px;border:1px solid #dde4f5">
            <div style="font-size:10px;font-weight:700;color:#888;text-transform:uppercase;margin-bottom:5px">Date prescription</div>
            <div style="font-size:15px;font-weight:700">${date || "—"}</div>
          </div>
        </div>
        ${medsHtml ? `<div><div style="font-size:10px;font-weight:700;color:#888;text-transform:uppercase;margin-bottom:8px">Médicaments</div><ul style="margin:0;padding-left:20px;line-height:1.8">${medsHtml}</ul></div>` : ""}
      </div>`;
      window.print();
      setTimeout(() => { printArea.innerHTML = ""; setStep("confirm"); }, 500);
    }
  }

  useEffect(() => {
    const t = setTimeout(doPrint, 150);
    return () => clearTimeout(t);
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000, padding: 24 }}>
      <div style={{ background: "#fff", borderRadius: 20, padding: 32, maxWidth: 420, width: "100%", boxShadow: "0 24px 60px rgba(0,0,0,0.35)", animation: "popIn 0.2s ease" }}>
        {step === "ready" ? (
          <div style={{ textAlign: "center", padding: "16px 0" }}>
            <div style={{ fontSize: 56, marginBottom: 16, display: "inline-block", animation: "pulse 0.7s ease infinite" }}>🖨️</div>
            <div style={{ fontWeight: 800, fontSize: 18, color: "#1a1a1a", marginBottom: 6 }}>Ouverture de l'impression…</div>
            <div style={{ fontSize: 14, color: "#888" }}>La boîte de sélection d'imprimante va s'ouvrir</div>
          </div>
        ) : (
          <>
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <div style={{ fontSize: 48, marginBottom: 10 }}>🖨️</div>
              <div style={{ fontWeight: 800, fontSize: 20, color: "#1a1a1a", marginBottom: 6 }}>L'impression est-elle réussie ?</div>
              <div style={{ fontSize: 13, color: "#888", lineHeight: 1.6 }}>Confirmez que l'ordonnance a bien été imprimée pour la marquer comme traitée.</div>
            </div>
            <div style={{ background: "#f8f9ff", border: `1.5px solid ${couleur}44`, borderRadius: 12, padding: "14px 18px", marginBottom: 24 }}>
              <div style={{ fontSize: 10, color: "#aaa", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>Ordonnance de</div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 46, height: 46, borderRadius: "50%", background: couleur, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 900, fontSize: 20, flexShrink: 0 }}>
                  {nom?.charAt(0) || "?"}
                </div>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 20, color: "#1a1a1a" }}>{nom}</div>
                  {email && <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>✉️ {email}</div>}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={doPrint} style={{ flex: 1, padding: "12px", border: "1.5px solid #e0e0e0", borderRadius: 10, background: "#fff", color: "#555", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                🔄 Réimprimer
              </button>
              <button onClick={onConfirm} style={{ flex: 2, padding: "12px", border: "none", borderRadius: 10, background: "#2e7d32", color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 3px 12px rgba(46,125,50,0.3)", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                ✅ Oui, bien imprimée
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Palette de couleurs d'accent par ordonnance ─────────────────────────────
// Génère une couleur douce et cohérente à partir de l'id (déterministe)
const ACCENT_PALETTE = [
  { bg: "#e0f2fe", avatar: "#0369a1", border: "#bae6fd", bandeau: "#0284c7" }, // bleu ciel
  { bg: "#dcfce7", avatar: "#15803d", border: "#bbf7d0", bandeau: "#16a34a" }, // vert
  { bg: "#ede9fe", avatar: "#6d28d9", border: "#ddd6fe", bandeau: "#7c3aed" }, // violet
  { bg: "#fef3c7", avatar: "#b45309", border: "#fde68a", bandeau: "#d97706" }, // ambre
  { bg: "#fce7f3", avatar: "#be185d", border: "#fbcfe8", bandeau: "#db2777" }, // rose
  { bg: "#ccfbf1", avatar: "#0f766e", border: "#99f6e4", bandeau: "#0d9488" }, // teal
  { bg: "#fee2e2", avatar: "#b91c1c", border: "#fecaca", bandeau: "#dc2626" }, // rouge doux
  { bg: "#fff7ed", avatar: "#c2410c", border: "#fed7aa", bandeau: "#ea580c" }, // orange
  { bg: "#f0fdf4", avatar: "#166534", border: "#bbf7d0", bandeau: "#15803d" }, // vert foncé
  { bg: "#eef2ff", avatar: "#3730a3", border: "#c7d2fe", bandeau: "#4338ca" }, // indigo
  { bg: "#fdf4ff", avatar: "#7e22ce", border: "#e9d5ff", bandeau: "#9333ea" }, // violet clair
  { bg: "#f0f9ff", avatar: "#0c4a6e", border: "#bae6fd", bandeau: "#0369a1" }, // bleu foncé
];

function getOrdoAccent(id) {
  // Hash simple déterministe sur l'id de l'ordonnance
  let hash = 0;
  for (let i = 0; i < (id || "").length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) % ACCENT_PALETTE.length;
  }
  return ACCENT_PALETTE[Math.abs(hash) % ACCENT_PALETTE.length];
}


function OrdoCard({ ordo, couleur, onPrint, onView, onUpload, onReopen, loadingId }) {
  const isNew = ordo.status === "nouveau";
  const nom    = ordo.extracted?.nom || ordo.fromName || "Patient";
  const email  = ordo.fromEmail || "";
  const initiale = nom?.charAt(0)?.toUpperCase() || "?";
  const uploadRef = useRef();
  const isLoading = loadingId === ordo.id;
  const accent = getOrdoAccent(ordo.id); // couleur unique par ordonnance

  return (
    <div style={{
      background: "#fff", borderRadius: 16, overflow: "hidden",
      boxShadow: isNew ? `0 4px 20px ${accent.avatar}22, 0 1px 4px rgba(0,0,0,0.08)` : "0 1px 6px rgba(0,0,0,0.06)",
      border: isNew ? `2px solid ${accent.border}` : `2px solid ${accent.border}55`,
      transition: "box-shadow 0.2s",
    }}>
      {/* Bandeau statut — couleur unique par ordonnance */}
      <div style={{
        background: isNew ? accent.bandeau : accent.bg,
        padding: "8px 16px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: isNew ? "#fff" : accent.avatar, letterSpacing: 0.8 }}>
            {isNew ? "🔔 À TRAITER" : "✓ IMPRIMÉE"}
          </span>
          {/* Icône source : ✉️ email / 📱 QR / ⬇️ upload */}
          <span style={{ fontSize: 13 }} title={ordo.source === "email" ? "Envoyé par email" : ordo.source === "qrcode" ? "Envoyé via QR code" : "Chargé manuellement"}>
            {ordo.source === "email" ? "✉️" : ordo.source === "qrcode" ? "📱" : "⬇️"}
          </span>
        </div>
        <span style={{ fontSize: 11, color: isNew ? "rgba(255,255,255,0.8)" : accent.avatar + "99" }}>{timeAgo(ordo.receivedAt)}</span>
      </div>

      {/* Corps */}
      <div style={{ padding: "12px 14px 10px" }}>

        {/* Avatar + Nom */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <div style={{
            width: 44, height: 44, borderRadius: "50%",
            background: isNew ? accent.bandeau : accent.bg,
            border: `2px solid ${accent.border}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, color: isNew ? "#fff" : accent.avatar, fontWeight: 900, flexShrink: 0,
          }}>{initiale}</div>
          <div>
            <div style={{ fontSize: 10, color: "#aaa", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>Patient</div>
            <div style={{ fontSize: 17, fontWeight: 900, color: "#1a1a1a", lineHeight: 1.15, wordBreak: "break-word" }}>{nom}</div>
          </div>
        </div>

        {/* Carte vitale */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: "#aaa", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5 }}>Carte Vitale</div>
          {isLoading
            ? <div style={{ fontSize: 12, color: "#1a3a6e", animation: "pulse 1s ease infinite" }}>🔍 Analyse en cours…</div>
            : null
          }
        </div>

        {/* Miniature ordonnance si dispo */}
        {(ordo.attachments[0]?.dataUrl || ordo.attachments[0]?.path) && ordo.attachments[0].type === "image" && (
          <div style={{ marginBottom: 14, cursor: "pointer" }} onClick={onView}>
            <AttachmentThumb att={ordo.attachments[0]} style={{ width: "100%", height: 90, objectFit: "cover", borderRadius: 8, border: "1px solid #eee" }} />
          </div>
        )}
        {(ordo.attachments[0]?.dataUrl || ordo.attachments[0]?.path) && ordo.attachments[0].type === "pdf" && (
          <div onClick={onView} style={{ marginBottom: 14, background: "#f5f5f5", borderRadius: 8, padding: "10px", textAlign: "center", cursor: "pointer", border: "1px solid #eee" }}>
            <div style={{ fontSize: 24 }}>📄</div>
            <div style={{ fontSize: 11, color: "#888" }}>{ordo.attachments[0].name}</div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ padding: "0 14px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", gap: 8 }}>
          {ordo.attachments[0]?.dataUrl ? (
            <button onClick={onView} style={{
              flex: 1, padding: "9px", border: "1.5px solid #e0e0e0", borderRadius: 9,
              background: "#fff", color: "#555", fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
            }}>👁 Voir</button>
          ) : (
            <div style={{ flex: 1, display: "flex", gap: 5 }}>
              <input ref={uploadRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: "none" }}
                  onChange={e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = ev => onUpload(f, ev.target.result); r.readAsDataURL(f); }}/>
              {ordo.source === "email" && (
                <button onClick={() => { const url = generateOrdoPDF(ordo); window.open(url, "_blank"); }}
                  title="Voir la fiche ordonnance PDF"
                  style={{ padding: "9px 10px", border: "1.5px solid #c7d2fe", borderRadius: 9, background: "#f0f4ff", color: "#4338ca", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                  📄
                </button>
              )}
            </div>
          )}
          <button onClick={onPrint} style={{
            flex: 1, padding: "13px 8px", border: "none", borderRadius: 9,
            background: isNew ? accent.bandeau : "#475569", color: "#fff",
            fontWeight: 800, fontSize: 15, cursor: "pointer", fontFamily: "inherit",
            boxShadow: isNew ? `0 4px 12px ${accent.avatar}55` : "none",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
          }}>
            🖨️ Imprimer
          </button>
        </div>
        {/* Bouton remettre à traiter — visible uniquement sur les ordonnances imprimées */}
        {!isNew && (
          <button onClick={onReopen} style={{
            width: "100%", padding: "7px", border: "1.5px solid #e6a817", borderRadius: 9,
            background: "#fffbf0", color: "#92400e", fontWeight: 700, fontSize: 12,
            cursor: "pointer", fontFamily: "inherit",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
          }}>
            ↩ Remettre à traiter
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Ordo Row — vue liste ─────────────────────────────────────────────────────
function OrdoRow({ ordo, couleur, onPrint, onView, onReopen }) {
  const isNew   = ordo.status === "nouveau";
  const nom     = ordo.extracted?.nom || ordo.fromName || "Patient";
  const email   = ordo.fromEmail || "";
  const accent  = getOrdoAccent(ordo.id);
  const hasFile = !!(ordo.attachments?.[0]?.dataUrl || ordo.attachments?.[0]?.path);
  const srcIcon = ordo.source === "email" ? "✉️" : ordo.source === "qrcode" ? "📱" : "⬇️";

  return (
    <div style={{
      background: isNew ? accent.bg + "55" : "#fff",
      borderRadius: 12, marginBottom: 6, padding: "12px 18px",
      display: "flex", alignItems: "center", gap: 14,
      border: `1.5px solid ${accent.border}`,
      boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
    }}>
      {/* Avatar */}
      <div style={{ width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
        background: isNew ? accent.bandeau : accent.bg,
        border: `2px solid ${accent.border}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: isNew ? "#fff" : accent.avatar, fontWeight: 900, fontSize: 17 }}>
        {nom?.charAt(0)?.toUpperCase() || "?"}
      </div>

      {/* Nom + email */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 15, color: "#1a1a1a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{nom}</div>
        {email && <div style={{ fontSize: 11, color: "#64748b", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{email}</div>}
        <div style={{ fontSize: 10, color: "#aaa", marginTop: 1 }}>{timeAgo(ordo.receivedAt)}</div>
      </div>

      {/* Source + statut */}
      <span style={{ fontSize: 14, flexShrink: 0 }} title={ordo.source}>{srcIcon}</span>
      <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 20, flexShrink: 0,
        background: isNew ? "#fff8e1" : "#e8f5e9",
        color: isNew ? "#b7791f" : "#2e7d32",
        border: `1px solid ${isNew ? "#f6e05e" : "#a5d6a7"}` }}>
        {isNew ? "NOUVEAU" : "IMPRIMÉ"}
      </span>

      {/* Actions */}
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
        <button onClick={onView} disabled={!hasFile}
          style={{ padding: "6px 10px", border: `1.5px solid ${hasFile ? accent.border : "#e2e8f0"}`,
            borderRadius: 8, background: hasFile ? "#f8faff" : "#f5f5f5",
            color: hasFile ? accent.avatar : "#ccc", fontWeight: 700, fontSize: 13,
            cursor: hasFile ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
          👁
        </button>
        <button onClick={onPrint}
          style={{ padding: "6px 12px", border: "none", borderRadius: 8,
            background: isNew ? accent.bandeau : "#475569", color: "#fff",
            fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
          🖨️ Imprimer
        </button>
        {!isNew && (
          <button onClick={onReopen}
            style={{ padding: "6px 9px", border: "1.5px solid #e6a817", borderRadius: 8,
              background: "#fffbf0", color: "#92400e", fontWeight: 700, fontSize: 11,
              cursor: "pointer", fontFamily: "inherit" }}>↩</button>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE PATIENT
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Stories post-envoi (format WhatsApp/Instagram) ─────────────────────────
const HEALTH_STORIES = [
  {
    id: 1,
    emoji: "✅",
    bg: ["#1a6e3a", "#15803d"],
    title: "Ordonnance reçue !",
    text: "Votre pharmacien prépare votre commande. Restez dans la file — nous vous appelons quand c'est prêt.",
    type: "info",
  },
  {
    id: 2,
    emoji: "💊",
    bg: ["#1a3a6e", "#1e40af"],
    title: "Le saviez-vous ?",
    text: "1 patient sur 3 arrête son traitement trop tôt. Même si vous vous sentez mieux, terminez toujours votre prescription.",
    type: "info",
  },
  {
    id: 3,
    emoji: "🧠",
    bg: ["#4c1d95", "#6d28d9"],
    title: "Quiz santé",
    text: null,
    type: "quiz",
    question: "Que faire avec les médicaments non utilisés ?",
    answers: [
      { text: "Les jeter à la poubelle", correct: false, emoji: "🗑️" },
      { text: "Les rapporter en pharmacie", correct: true, emoji: "✅" },
      { text: "Les garder pour plus tard", correct: false, emoji: "📦" },
    ],
    explanation: "Les pharmacies collectent gratuitement vos médicaments non utilisés via le programme Cyclamed.",
  },
  {
    id: 4,
    emoji: "💬",
    bg: ["#92400e", "#b45309"],
    title: "À demander au pharmacien",
    text: "Puis-je prendre ce médicament avec mon traitement habituel ? Y a-t-il un générique disponible ?",
    type: "info",
  },
  {
    id: 5,
    emoji: "🎁",
    bg: ["#065f46", "#047857"],
    title: "Le saviez-vous ?",
    text: "Votre pharmacie propose souvent la vaccination sans RDV, des bilans de médication gratuits et la livraison à domicile.",
    type: "info",
  },
];

function PatientStories({ pharmacie, nom, onRestart }) {
  const [current, setCurrent] = useState(0);
  const [progress, setProgress] = useState(0);
  const [quizAnswer, setQuizAnswer] = useState(null); // index réponse choisie
  const [touchStart, setTouchStart] = useState(null);
  const timerRef = useRef(null);
  const DURATION = 6000;
  const [allStories, setAllStories] = useState(HEALTH_STORIES);

  useEffect(() => {
    const sb = getSupabaseClient();
    let base = [...HEALTH_STORIES];

    async function loadDynamic() {
      if (!sb) return;

      // Charger contenu santé aléatoire depuis la table stories_content
      try {
        const { data: contents } = await sb
          .from("stories_content")
          .select("*")
          .eq("actif", true);
        if (contents && contents.length > 0) {
          // Mélanger et prendre 3 max
          const shuffled = contents.sort(() => Math.random() - 0.5).slice(0, 3);
          const dynamicStories = shuffled.map(s => ({
            id: `content-${s.id}`,
            emoji: s.emoji || "💡",
            bg: s.type === "quiz"
              ? ["#4c1d95", "#6d28d9"]
              : s.type === "conseil"
              ? ["#1a3a6e", "#1e40af"]
              : ["#065f46", "#047857"],
            title: s.titre,
            text: s.type !== "quiz" ? s.contenu : null,
            type: s.type, // "info" | "quiz" | "conseil"
            question: s.question || null,
            answers: s.reponses ? JSON.parse(s.reponses) : null,
            explanation: s.explication || null,
          }));
          // Remplacer les stories statiques par les dynamiques (garder story 1 confirmation)
          base = [base[0], ...dynamicStories];
        }
      } catch(e) { console.warn("[stories_content]", e.message); }

      // Charger offres pharmacie
      if (pharmacie?.id) {
        try {
          const { data: offres } = await sb
            .from("offres_stories")
            .select("*")
            .eq("pharmacie_id", pharmacie.id)
            .eq("actif", true);
          if (offres && offres.length > 0) {
            const offreStories = offres
              .filter(o => !o.date_fin || new Date(o.date_fin) >= new Date())
              .map(o => ({
                id: `offre-${o.id}`,
                emoji: o.emoji || "🎁",
                bg: [o.couleur || "#1a3a6e", (o.couleur || "#1a3a6e") + "99"],
                title: o.titre,
                text: o.description || "",
                type: "offre",
                badge: o.badge || null,
              }));
            // Insérer les offres en 2ème position
            base.splice(1, 0, ...offreStories);
          }
        } catch(e) { console.warn("[offres_stories]", e.message); }
      }

      setAllStories(base);
    }

    loadDynamic();
  }, [pharmacie?.id]);

  const story = allStories[current];
  const totalStories = allStories.length;
  const isQuiz = story?.type === "quiz";
  const isOffre = story?.type === "offre";
  const couleur = pharmacie?.couleur || "#1a3a6e";

  // Avancer automatiquement sauf si quiz en cours
  useEffect(() => {
    setProgress(0);
    setQuizAnswer(null);
    if (isQuiz) return; // Pause sur le quiz

    const start = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.min((elapsed / DURATION) * 100, 100);
      setProgress(pct);
      if (pct >= 100) {
        clearInterval(timerRef.current);
        goNext();
      }
    }, 50);
    return () => clearInterval(timerRef.current);
  }, [current]);

  // Reprendre après réponse quiz
  useEffect(() => {
    if (!isQuiz || quizAnswer === null) return;
    const t = setTimeout(() => goNext(), 3000);
    return () => clearTimeout(t);
  }, [quizAnswer]);

  function goNext() {
    if (current < allStories.length - 1) {
      setCurrent(c => c + 1);
    }
  }
  function goPrev() {
    if (current > 0) setCurrent(c => c - 1);
  }

  // Swipe tactile — coordonnées X ET Y pour différencier swipe horizontal / scroll
  const touchStartY = useRef(null);
  function handleTouchStart(e) {
    setTouchStart(e.touches[0].clientX);
    touchStartY.current = e.touches[0].clientY;
  }
  function handleTouchEnd(e) {
    if (touchStart === null) return;
    const diffX = touchStart - e.changedTouches[0].clientX;
    const diffY = (touchStartY.current || 0) - e.changedTouches[0].clientY;
    // Swipe horizontal uniquement si deplacement X > Y (pas un scroll vertical)
    if (Math.abs(diffX) > 40 && Math.abs(diffX) > Math.abs(diffY)) {
      diffX > 0 ? goNext() : goPrev();
    } else if (Math.abs(diffX) < 10 && Math.abs(diffY) < 10) {
      // Tap simple : gauche = prev, droite = next
      const screenW = window.innerWidth;
      const tapX = e.changedTouches[0].clientX;
      if (tapX < screenW * 0.35) goPrev();
      else if (tapX > screenW * 0.65) goNext();
    }
    setTouchStart(null);
    touchStartY.current = null;
  }

  const [r1, r2] = story.bg;

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      style={{
        minHeight: "100vh", width: "100%",
        background: `linear-gradient(160deg, ${r1} 0%, ${r2} 100%)`,
        display: "flex", flexDirection: "column",
        position: "relative", overflow: "hidden",
        userSelect: "none",
      }}>

      {/* Barres de progression */}
      <div style={{ display: "flex", gap: 4, padding: "14px 16px 8px", position: "relative", zIndex: 10 }}>
        {allStories.map((s, i) => (
          <div key={s.id} style={{ flex: 1, height: 3, borderRadius: 2, background: "rgba(255,255,255,0.25)", overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 2,
              background: "#fff",
              width: i < current ? "100%" : i === current ? (isQuiz && quizAnswer !== null ? "100%" : `${progress}%`) : "0%",
              transition: i === current && !isQuiz ? "none" : "width 0.3s",
            }}/>
          </div>
        ))}
      </div>

      {/* Header */}
      <div style={{ padding: "6px 16px 0", display: "flex", alignItems: "center", gap: 10, zIndex: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>💊</div>
        <div>
          <div style={{ color: "#fff", fontWeight: 800, fontSize: 13 }}>{pharmacie?.nom || "Votre pharmacie"}</div>
          <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 11 }}>Bonjour {nom} 👋</div>
        </div>
      </div>

      {/* Navigation tap : géré dans handleTouchEnd */}

      {/* Contenu story */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "20px 28px", textAlign: "center", position: "relative", zIndex: 6 }}>

        <div style={{ fontSize: 72, marginBottom: 20, filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.2))" }}>{story.emoji}</div>
        <div style={{ fontSize: 24, fontWeight: 900, color: "#fff", marginBottom: 16, lineHeight: 1.2 }}>{story.title}</div>

        {/* Story info */}
        {!isQuiz && !isOffre && (
          <div style={{ fontSize: 16, color: "rgba(255,255,255,0.85)", lineHeight: 1.7, maxWidth: 300 }}>{story.text}</div>
        )}

        {/* Story offre pharmacie */}
        {story.type === "offre" && (
          <div style={{ width:"100%", maxWidth:300 }}>
            {story.badge && (
              <div style={{ display:"inline-block", background:"rgba(255,255,255,0.25)", borderRadius:24, padding:"4px 16px", fontSize:18, fontWeight:900, color:"#fff", marginBottom:14, border:"2px solid rgba(255,255,255,0.4)" }}>
                {story.badge}
              </div>
            )}
            <div style={{ fontSize:15, color:"rgba(255,255,255,0.9)", lineHeight:1.7, maxWidth:280 }}>{story.text}</div>
            <div style={{ marginTop:18, padding:"10px 16px", background:"rgba(255,255,255,0.15)", borderRadius:12, fontSize:13, color:"rgba(255,255,255,0.8)", fontWeight:600 }}>
              💬 Demandez à votre pharmacien
            </div>
          </div>
        )}
        {/* Story quiz */}
        {isQuiz && (
          <div style={{ width: "100%", maxWidth: 320 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#fff", marginBottom: 18, lineHeight: 1.5 }}>{story.question}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {story.answers.map((ans, idx) => {
                const chosen = quizAnswer === idx;
                const revealed = quizAnswer !== null;
                const isCorrect = ans.correct;
                let bg = "rgba(255,255,255,0.15)";
                let border = "rgba(255,255,255,0.3)";
                if (revealed && isCorrect) { bg = "rgba(34,197,94,0.35)"; border = "#4ade80"; }
                else if (revealed && chosen && !isCorrect) { bg = "rgba(239,68,68,0.35)"; border = "#f87171"; }
                return (
                  <button key={idx}
                    onClick={e => { e.stopPropagation(); if (quizAnswer === null) setQuizAnswer(idx); }}
                    style={{
                      padding: "13px 16px", borderRadius: 14,
                      border: `2px solid ${border}`,
                      background: bg, color: "#fff",
                      fontWeight: 700, fontSize: 15,
                      cursor: quizAnswer === null ? "pointer" : "default",
                      fontFamily: "inherit", textAlign: "left",
                      display: "flex", alignItems: "center", gap: 10,
                      transition: "all 0.3s",
                    }}>
                    <span>{ans.emoji}</span>
                    <span>{ans.text}</span>
                    {revealed && isCorrect && <span style={{ marginLeft: "auto" }}>✓</span>}
                    {revealed && chosen && !isCorrect && <span style={{ marginLeft: "auto" }}>✗</span>}
                  </button>
                );
              })}
            </div>
            {quizAnswer !== null && (
              <div style={{ marginTop: 14, padding: "12px 16px", background: "rgba(255,255,255,0.12)", borderRadius: 12, fontSize: 13, color: "rgba(255,255,255,0.9)", lineHeight: 1.6 }}>
                💡 {story.explanation}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Indicateur swipe */}
      {quizAnswer === null && !isQuiz && (
        <div style={{ padding: "0 0 24px", textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: 12, zIndex: 10 }}>
          ← Swipez →
        </div>
      )}
      {quizAnswer !== null && (
        <div style={{ padding: "0 0 24px", textAlign: "center", color: "rgba(255,255,255,0.5)", fontSize: 12, zIndex: 10 }}>
          Suite dans 3 secondes…
        </div>
      )}

      {/* Bouton fin de stories */}
      {current === allStories.length - 1 && progress > 80 && (
        <div style={{ padding: "0 24px 32px", zIndex: 10 }}>
          <button onClick={onRestart}
            style={{ width: "100%", padding: "14px", border: "none", borderRadius: 14, background: "rgba(255,255,255,0.2)", color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}>
            Envoyer une autre ordonnance
          </button>
        </div>
      )}
    </div>
  );
}


function PatientPage({ pharmacie, onBack }) {
  const [step, setStep]       = useState("form");
  const [nom, setNom]         = useState("");
  const [files, setFiles]     = useState([]); // plusieurs ordonnances
  const [copied, setCopied]   = useState(false);
  const [sending, setSending] = useState(false);
  const inputRef              = useRef();
  const couleur               = pharmacie?.couleur || "#1a3a6e";
  const emailReception        = pharmacie?.email_reception || pharmacie?.emailReception || `${pharmacie?.id}@in.ordomail.fr`;

  // Ajouter un ou plusieurs fichiers
  function handleFiles(selectedFiles) {
    const arr = Array.from(selectedFiles);
    const newFiles = arr.map(f => ({
      file: f,
      name: f.name,
      type: f.type,
      dataUrl: null,
      preview: null,
    }));
    // Lire les previews
    newFiles.forEach((item, idx) => {
      const r = new FileReader();
      r.onload = e => {
        setFiles(prev => prev.map((x, i) =>
          i === prev.length - newFiles.length + idx
            ? { ...x, dataUrl: e.target.result }
            : x
        ));
      };
      r.readAsDataURL(item.file);
    });
    setFiles(prev => [...prev, ...newFiles]);
  }

  function removeFile(idx) {
    setFiles(prev => prev.filter((_, i) => i !== idx));
  }

  function handleCopyEmail() {
    const doCopy = () => { setCopied(true); setTimeout(() => setCopied(false), 2500); };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(emailReception).then(doCopy).catch(() => {
        const el = document.createElement("textarea");
        el.value = emailReception; document.body.appendChild(el);
        el.select(); document.execCommand("copy"); document.body.removeChild(el); doCopy();
      });
    } else {
      const el = document.createElement("textarea");
      el.value = emailReception; document.body.appendChild(el);
      el.select(); document.execCommand("copy"); document.body.removeChild(el); doCopy();
    }
  }

  async function handleSubmit() {
    if (!nom.trim() || files.length === 0) return;
    setSending(true);
    setStep("uploading");

    // Préparer tous les envois en parallèle
    async function sendOne(item) {
      const base64    = item.dataUrl?.split(",")[1] || "";
      const extracted = await extractFromFile(base64, item.type, { fallbackName: nom || null });
      const ext       = item.name.split(".").pop().toLowerCase();

      if (isDemoMode) {
        addOrdonnance(pharmacie.id, {
          id: `qr-${Date.now()}-${Math.random()}`, fromName: nom.toUpperCase(),
          subject: "Ordonnance envoyée via QR Code", receivedAt: new Date(),
          status: "nouveau", source: "qrcode",
          attachments: [{ name: item.name, type: ext === "pdf" ? "pdf" : "image",
            size: `${(item.file.size/1024).toFixed(0)} Ko`, dataUrl: item.dataUrl }],
          extracted: extracted || { nom: nom.toUpperCase() },
        });
        return { ok: true };
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const formData = new FormData();
      formData.append("pharmacie_id", pharmacie.id);
      formData.append("from_name",    nom.toUpperCase());
      formData.append("patient_nom",  extracted?.nom || nom.toUpperCase());
      formData.append("patient_cv",   "");
      formData.append("medecin",      "");
      formData.append("medicaments",  JSON.stringify([]));
      formData.append("file",         item.file, item.name);

      const res = await fetch(`${supabaseUrl}/functions/v1/submit-ordonnance`, {
        method: "POST", body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Erreur ${res.status}`);
      }
      return res.json();
    }

    try {
      // Envoi de tous les fichiers en parallèle — chaque fichier est traité
      // simultanément : OCR + upload + INSERT en base se font en même temps
      const results = await Promise.allSettled(files.map(sendOne));

      // Vérifier si au moins un a échoué
      const failed = results.filter(r => r.status === "rejected");
      if (failed.length === files.length) {
        // Tous ont échoué
        throw new Error(failed[0].reason?.message || "Erreur envoi");
      }
      // Succès total ou partiel
      setStep("success");
    } catch(e) {
      console.error("[PatientPage]", e.message);
      setStep("error");
    }
    setSending(false);
  }

  if (step === "success") return (
    <PatientStories
      pharmacie={pharmacie}
      nom={nom}
      onRestart={() => { setStep("form"); setFiles([]); setNom(""); }}
    />
  );

  if (step === "uploading") return (
    <div style={{ minHeight:"100vh", background:"#f0f4ff", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16 }}>
      <div style={{ fontSize:48, animation:"spin 1s linear infinite" }}>📤</div>
      <div style={{ fontWeight:700, fontSize:16, color:couleur }}>
        Envoi en cours ({files.length} ordonnance{files.length>1?"s":""})…
      </div>
    </div>
  );

  if (step === "error") return (
    <div style={{ minHeight:"100vh", background:"#fff5f5", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16, padding:24 }}>
      <div style={{ fontSize:48 }}>⚠️</div>
      <div style={{ fontWeight:700, fontSize:16, color:"#dc2626", textAlign:"center" }}>Erreur lors de l'envoi</div>
      <div style={{ fontSize:13, color:"#64748b", textAlign:"center" }}>Veuillez réessayer ou envoyer l'ordonnance par e-mail.</div>
      <button onClick={()=>setStep("form")} style={{ padding:"10px 24px", borderRadius:20, border:"none", background:couleur, color:"#fff", fontWeight:600, cursor:"pointer" }}>Réessayer</button>
    </div>
  );

  return (
    <div style={{ minHeight:"100vh", background:"#f5f7ff", display:"flex", flexDirection:"column" }}>

      {/* Header */}
      <div style={{ background:couleur, color:"#fff", padding:"16px 20px", display:"flex", alignItems:"center", gap:12 }}>
        {onBack && <button onClick={onBack} style={{ background:"none", border:"none", color:"#fff", fontSize:20, cursor:"pointer", padding:0 }}>←</button>}
        <span style={{ fontSize:24 }}>💊</span>
        <div>
          <div style={{ fontWeight:800, fontSize:16 }}>{pharmacie?.nom || "Pharmacie"}</div>
          <div style={{ fontSize:11, opacity:0.7 }}>{pharmacie?.adresse}</div>
        </div>
      </div>

      <div style={{ padding:"20px 20px 32px", maxWidth:480, width:"100%", margin:"0 auto", display:"flex", flexDirection:"column", gap:16 }}>

        {/* Nom */}
        <Input label="Votre nom complet" value={nom} onChange={setNom} placeholder="Ex : MARTIN Pierre" icon="👤" required />

        {/* ── Bloc 1 : Ajouter ordonnances ── */}
        <div style={{ background:"#fff", borderRadius:14, overflow:"hidden", border:`1.5px solid ${files.length>0 ? couleur : "#e0e7ff"}`, boxShadow:files.length>0 ? `0 4px 16px ${couleur}18` : "0 1px 4px rgba(0,0,0,0.06)", transition:"border 0.2s" }}>
          {/* En-tête */}
          <div style={{ padding:"14px 16px", background:files.length>0 ? `${couleur}08` : "#f8f9ff", borderBottom:`1px solid ${files.length>0 ? couleur+"22" : "#f0f0f0"}`, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:32, height:32, borderRadius:8, background:couleur, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, flexShrink:0 }}>📋</div>
              <div>
                <div style={{ fontWeight:700, fontSize:14, color:"#1a1a1a" }}>Ajouter votre ordonnance</div>
                <div style={{ fontSize:11, color:"#888" }}>JPEG, PNG ou PDF — plusieurs fichiers possibles</div>
              </div>
            </div>
            {files.length > 0 && (
              <span style={{ fontSize:11, fontWeight:700, background:couleur, color:"#fff", borderRadius:20, padding:"2px 10px" }}>
                {files.length} fichier{files.length>1?"s":""}
              </span>
            )}
          </div>

          {/* Liste des fichiers ajoutés */}
          {files.length > 0 && (
            <div style={{ padding:"10px 14px 0", display:"flex", flexDirection:"column", gap:6 }}>
              {files.map((item, idx) => (
                <div key={idx} style={{ display:"flex", alignItems:"center", gap:8, background:"#f8faff", borderRadius:8, padding:"8px 10px", border:"1px solid #e0e7ff" }}>
                  <span style={{ fontSize:16 }}>{item.type === "application/pdf" ? "📄" : "🖼️"}</span>
                  <span style={{ flex:1, fontSize:12, color:"#1a1a1a", fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{item.name}</span>
                  <button onClick={()=>removeFile(idx)} style={{ background:"none", border:"none", color:"#dc2626", cursor:"pointer", fontSize:16, padding:"0 2px", flexShrink:0 }}>×</button>
                </div>
              ))}
            </div>
          )}

          {/* Zone d'ajout */}
          <div style={{ padding:14 }}>
            <div onClick={()=>inputRef.current.click()} style={{ border:`2px dashed ${files.length>0 ? couleur+"66" : "#c8d5e8"}`, borderRadius:10, padding:"18px 16px", textAlign:"center", cursor:"pointer", background:files.length>0 ? `${couleur}05` : "#fafbff" }}>
              <div style={{ fontSize:26, marginBottom:4 }}>➕</div>
              <div style={{ fontWeight:600, color:couleur, fontSize:13 }}>
                {files.length===0 ? "Appuyez pour ajouter un fichier" : "Ajouter une autre ordonnance"}
              </div>
              <div style={{ fontSize:11, color:"#aaa", marginTop:2 }}>JPEG, PNG ou PDF</div>
              <input ref={inputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" multiple style={{ display:"none" }}
                onChange={e => handleFiles(e.target.files)} />
            </div>
          </div>
        </div>

        {/* Bouton envoyer */}
        <button onClick={handleSubmit} disabled={!nom.trim() || files.length===0 || sending}
          style={{ width:"100%", padding:"15px", border:"none", borderRadius:12, background:!nom.trim()||files.length===0?`${couleur}55`:couleur, color:"#fff", fontWeight:800, fontSize:16, cursor:!nom.trim()||files.length===0?"not-allowed":"pointer", fontFamily:"inherit", boxShadow:nom.trim()&&files.length>0?`0 4px 16px ${couleur}44`:"none" }}>
          {sending ? "Envoi en cours…" : files.length > 1 ? `Envoyer ${files.length} ordonnances →` : "Envoyer l'ordonnance →"}
        </button>

        {/* ── Bloc 2 : E-mail ── */}
        <div style={{ background:"#fff", borderRadius:14, overflow:"hidden", border:`1.5px solid ${copied?"#16a34a":"#e0eeff"}`, boxShadow:copied?"0 4px 16px #16a34a18":"0 1px 4px rgba(0,0,0,0.06)", transition:"border 0.3s" }}>
          <div style={{ padding:"14px 16px", background:"#f0f7ff", borderBottom:"1px solid #e0eeff", display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ width:32, height:32, borderRadius:8, background:"#1e40af", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, flexShrink:0 }}>✉️</div>
            <div>
              <div style={{ fontWeight:700, fontSize:14, color:"#1a1a1a" }}>Transférer par e-mail</div>
            </div>
          </div>
          <div style={{ padding:14, display:"flex", flexDirection:"column", gap:10 }}>
            <div style={{ fontSize:11, fontWeight:700, color:"#999", textTransform:"uppercase", letterSpacing:0.8 }}>E-mail de votre pharmacie</div>
            <div style={{ fontSize:13, fontWeight:700, color:"#1a1a1a", fontFamily:"monospace", background:"#f0f7ff", borderRadius:8, padding:"11px 14px", wordBreak:"break-all", lineHeight:1.5, border:"1px solid #dbeafe" }}>
              {emailReception}
            </div>
            <button onClick={handleCopyEmail} style={{ width:"100%", padding:"13px", border:"none", borderRadius:10, background:copied?"#16a34a":"#1e40af", color:"#fff", fontWeight:800, fontSize:15, cursor:"pointer", fontFamily:"inherit", display:"flex", alignItems:"center", justifyContent:"center", gap:8, transition:"background 0.3s" }}>
              {copied ? "✅ E-mail copié !" : "📋 Copier l'e-mail"}
            </button>
          </div>
        </div>

        <div style={{ fontSize:11, color:"#bbb", textAlign:"center" }}>Données transmises de manière sécurisée à votre pharmacie uniquement.</div>
      </div>
    </div>
  );
}



// ═══════════════════════════════════════════════════════════════════════════════
// QR CODE + NFC TAB
// ═══════════════════════════════════════════════════════════════════════════════
function QRNFCTab({ pharmacie, couleur, qrUrl, onPatientPage }) {
  const [nfcStatus, setNfcStatus] = useState("idle");
  const [activeSection, setActiveSection] = useState("qr");
  const isLocal = typeof window !== "undefined" &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

  async function handleNFCWrite() {
    if (!("NDEFReader" in window)) { setNfcStatus("unsupported"); return; }
    try {
      setNfcStatus("writing");
      const ndef = new window.NDEFReader();
      await ndef.write({ records: [{ recordType: "url", data: qrUrl }] });
      setNfcStatus("success");
    } catch(e) { setNfcStatus("error"); }
  }

  async function handlePrint() {
    // Récupérer le QR code déjà généré
    const qrImg = document.querySelector("#qr-print-img");
    let qrSrc = qrImg?.src || "";

    // Générer si pas encore chargé
    if (!qrSrc || !qrSrc.startsWith("data:")) {
      try {
        const mod = await import("https://esm.sh/qrcode@1.5.4");
        const QR = mod.default || mod;
        qrSrc = await QR.toDataURL(qrUrl, {
          errorCorrectionLevel: "H",
          margin: 1,
          width: 600,
          color: { dark: "#000000", light: "#ffffff" },
        });
      } catch(e) { qrSrc = ""; }
    }

    const nom = pharmacie?.nom?.toUpperCase() || "VOTRE PHARMACIE";
    const bg  = "#d6e8e0"; // vert menthe clair comme sur le design

    const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8">
<title>OrdoMail — ${nom}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;800;900&display=swap');
@page { size: A4 portrait; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: 'Inter', Arial, sans-serif;
  background: ${bg};
  width: 210mm; height: 297mm;
  display: flex; flex-direction: column;
  align-items: center;
  padding: 8mm 12mm 5mm;
  overflow: hidden;
  print-color-adjust: exact;
  -webkit-print-color-adjust: exact;
}
.logo-row { display: flex; align-items: center; gap: 8px; margin-bottom: 4mm; }
.logo-pill { width: 26px; height: 26px; background: linear-gradient(135deg, #1a6e3a, #2d9d5e); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; }
.logo-text { font-size: 20px; font-weight: 900; color: #1a1a1a; }
.logo-text span { color: #1a6e3a; }
.title-band { background: #1a4a35; width: 100%; border-radius: 10px 10px 0 0; padding: 7px 16px; display: flex; align-items: center; justify-content: center; gap: 10px; }
.cross { font-size: 18px; color: rgba(255,255,255,0.4); }
.title-text { font-size: 21px; font-weight: 900; color: #fff; letter-spacing: 1px; text-transform: uppercase; }
.pharma-band { background: #c8ddd5; width: 100%; padding: 6px 16px; text-align: center; margin-bottom: 3mm; border-radius: 0 0 6px 6px; }
.pharma-name { font-size: 17px; font-weight: 900; color: #1a3a2a; letter-spacing: 1.5px; text-transform: uppercase; }

/* QR — flex:1 pour prendre tout l'espace disponible */
.qr-card { background: #e8f2ee; border-radius: 14px; width: 100%; padding: 3mm 4mm; display: flex; flex-direction: column; align-items: center; margin-bottom: 1.5mm; flex: 0; }
.method-badge { background: #1a4a35; border-radius: 8px; padding: 6px 20px; font-size: 22px; font-weight: 900; color: #fff; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 3mm; width: 100%; text-align: center; }
.qr-wrap { background: #fff; border-radius: 12px; padding: 4mm; display: inline-block; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
.qr-wrap img { width: 122mm; height: 122mm; display: block; }

/* NFC card */
.nfc-card { background: linear-gradient(135deg, #1a4a35 0%, #2d6e50 100%); border-radius: 14px; width: 100%; overflow: hidden; flex-shrink: 0; }
.nfc-top { padding: 4mm 7mm; display: flex; align-items: center; gap: 5mm; }

/* Logo NFC officiel : cercle blanc avec ondes + texte NFC */
.nfc-logo-wrap {
  width: 62px; height: 62px; flex-shrink: 0;
  background: #fff;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
}

.nfc-method-text { flex: 1; }

/* Titre sur UNE seule ligne */
.nfc-method-title { font-size: 22px; font-weight: 900; color: #fff; text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap; }

.nfc-bottom { background: #c8ddd5; padding: 4mm 7mm; text-align: center; }
.nfc-instruction { font-size: 21px; font-weight: 800; color: #1a3a2a; line-height: 1.45; }

@media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } .no-print { display: none !important; } }
</style></head>
<body>

<div class="logo-row">
  <div class="logo-pill">&#128138;</div>
  <div class="logo-text">Ordo<span>Mail</span></div>
</div>

<div class="title-band">
  <span class="cross">&#10010;</span>
  <span class="title-text">Envoyez votre ordonnance</span>
  <span class="cross">&#10010;</span>
</div>

<div class="pharma-band">
  <div class="pharma-name">${nom}</div>
</div>

<div class="qr-card">
  <div class="method-badge">M&#233;thode 1 : Scannez le code QR</div>
  <div class="qr-wrap">
    ${qrSrc ? `<img src="${qrSrc}" alt="QR"/>` : `<div style="width:122mm;height:122mm;display:flex;align-items:center;justify-content:center;color:#aaa">QR non disponible</div>`}
  </div>
</div>

<div class="nfc-card">
  <div class="nfc-top">

    <!-- Logo NFC officiel : cercle blanc + ondes wifi + NFC -->
    <div class="nfc-logo-wrap">
      <svg width="46" height="46" viewBox="0 0 46 46" fill="none" xmlns="http://www.w3.org/2000/svg">
        <!-- Cercle extérieur -->
        <circle cx="23" cy="23" r="21" stroke="#111" stroke-width="2.5" fill="white"/>
        <!-- Arc externe (grand) -->
        <path d="M10.5 20 C10.5 13.1 16.2 7.5 23 7.5 C29.8 7.5 35.5 13.1 35.5 20" stroke="#111" stroke-width="2.8" stroke-linecap="round" fill="none"/>
        <!-- Arc moyen -->
        <path d="M14 21.5 C14 16.8 18.1 13 23 13 C27.9 13 32 16.8 32 21.5" stroke="#111" stroke-width="2.8" stroke-linecap="round" fill="none"/>
        <!-- Arc interne (petit) -->
        <path d="M17.5 23 C17.5 20.5 20 18.5 23 18.5 C26 18.5 28.5 20.5 28.5 23" stroke="#111" stroke-width="2.8" stroke-linecap="round" fill="none"/>
        <!-- Point central -->
        <circle cx="23" cy="25.5" r="2.2" fill="#111"/>
        <!-- Texte NFC -->
        <text x="23" y="38.5" text-anchor="middle" font-family="Arial, sans-serif" font-weight="900" font-size="8.5" fill="#111" letter-spacing="1.5">NFC</text>
      </svg>
    </div>

    <div class="nfc-method-text">
      <div class="nfc-method-title">M&#233;thode 2 : Ouverture automatique</div>
    </div>
  </div>
  <div class="nfc-bottom">
    <div class="nfc-instruction">Approchez votre t&#233;l&#233;phone du badge<br>pour ouvrir la page d'envoi automatiquement</div>
  </div>
</div>

</body>
<button class="no-print" onclick="window.print()" style="position:fixed;bottom:16px;right:16px;background:#1a4a35;color:#fff;border:none;border-radius:10px;padding:10px 22px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit">
  &#128438; Imprimer / PDF
</button>
</html>`;

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const blobUrl = URL.createObjectURL(blob);
    const win = window.open(blobUrl, "_blank");
    if (win) { win.focus(); setTimeout(() => URL.revokeObjectURL(blobUrl), 30000); }
  }

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "20px" }}>
      {/* Toggle QR / NFC */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {[["qr", "📱 QR Code"], ["nfc", "🏷️ Badge NFC"]].map(([k, l]) => (
          <button key={k} onClick={() => setActiveSection(k)} style={{
            padding: "8px 18px", border: `1.5px solid ${activeSection === k ? couleur : "#e0e0e0"}`,
            borderRadius: 20, background: activeSection === k ? couleur : "#fff",
            color: activeSection === k ? "#fff" : "#555", fontWeight: 700, fontSize: 13,
            cursor: "pointer", fontFamily: "inherit",
          }}>{l}</button>
        ))}
      </div>

      {/* ── Section QR ── */}
      {activeSection === "qr" && (
        <div style={{ maxWidth: 420, margin: "0 auto" }}>
          {/* Badge environnement */}
          <div style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"4px 12px", borderRadius:20, fontSize:11, fontWeight:700, marginBottom:12,
            background: isLocal ? "#fef9c3" : "#dcfce7",
            color: isLocal ? "#92400e" : "#166534" }}>
            {isLocal ? "🧪 Mode test local — localhost:5173" : "🌐 Production"}
          </div>

          {/* QR Code */}
          <div style={{ textAlign: "center", marginBottom: 16 }}>
            <div id="qr-container" style={{ display: "inline-block", background: "#fff", padding: 16, borderRadius: 14, boxShadow: `0 4px 20px ${couleur}22`, border: `2px solid ${couleur}18` }}>
              <QRCode url={qrUrl} size={220} color={couleur} printId="qr-print-img" />
            </div>
          </div>

          {/* Nom pharmacie */}
          <div style={{ textAlign: "center", fontWeight: 800, fontSize: 16, marginBottom: 4 }}>{pharmacie?.nom}</div>



          {/* Avertissement local */}
          {isLocal && (
            <div style={{ marginBottom: 14, fontSize: 12, color: "#92400e", background: "#fef9c3", border: "1px solid #fde68a", borderRadius: 8, padding: "10px 14px", lineHeight: 1.7 }}>
              <div style={{ fontWeight: 800, marginBottom: 5 }}>🧪 Mode test local</div>
              <div style={{ marginBottom: 4 }}>Le QR code encode <code style={{background:"#fff",padding:"1px 5px",borderRadius:3}}>localhost</code> — illisible depuis un téléphone.</div>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Pour tester sur téléphone :</div>
              <div>1. Repérer l'adresse <strong>Network</strong> dans le terminal après <code style={{background:"#fff",padding:"1px 4px",borderRadius:3}}>npm run dev</code></div>
              <div>2. Elle ressemble à : <code style={{background:"#fff",padding:"2px 5px",borderRadius:3}}>http://192.168.1.X:5173</code></div>
              <div>3. Scanner le QR code depuis votre téléphone sur le même réseau Wi-Fi</div>
            </div>
          )}

          {/* Mode d'emploi */}
          <div style={{ background: "#f8f9ff", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#555", marginBottom: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 6, color: couleur }}>📷 Mode d'emploi</div>
            <div style={{ lineHeight: 1.9 }}>
              <div>1. Imprimez et affichez ce QR code à l'accueil</div>
              <div>2. Le patient scanne avec l'appareil photo de son téléphone</div>
              <div>3. La page s'ouvre directement — sans application</div>
              <div>4. Il prend une photo et envoie son ordonnance</div>
            </div>
          </div>

          {/* Boutons */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <button onClick={() => onPatientPage(pharmacie)} style={{
              padding: "13px", border: "none", borderRadius: 10, background: couleur,
              color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}>📱 Tester la page</button>
            <button onClick={handlePrint} style={{
              padding: "13px", border: `1.5px solid ${couleur}`, borderRadius: 10,
              background: "#fff", color: couleur, fontWeight: 700, fontSize: 14,
              cursor: "pointer", fontFamily: "inherit",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}>🖨️ Imprimer</button>
          </div>
        </div>
      )}

      {/* ── Section NFC ── */}
      {activeSection === "nfc" && (
        <div style={{ maxWidth: 420, margin: "0 auto" }}>
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <div style={{ fontSize: 52, marginBottom: 16 }}>🏷️</div>
            <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 8 }}>Badge NFC</div>
            <div style={{ fontSize: 14, color: "#64748b", marginBottom: 24, lineHeight: 1.7 }}>
              Programmez un badge NTAG213 (~0,50€). Le patient approche son téléphone — la page s'ouvre instantanément.
            </div>
            {nfcStatus === "idle" && (
              <button onClick={handleNFCWrite} style={{ padding: "13px 28px", border: "none", borderRadius: 12, background: couleur, color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}>
                📡 Programmer un badge NFC
              </button>
            )}
            {nfcStatus === "writing" && <div style={{ color: couleur, fontWeight: 700 }}>📡 Approchez le badge…</div>}
            {nfcStatus === "success" && <div style={{ color: "#15803d", fontWeight: 800, fontSize: 16 }}>✅ Badge programmé !</div>}
            {nfcStatus === "error"   && <div style={{ color: "#dc2626", fontWeight: 700 }}>⚠️ Erreur — Réessayez</div>}
            {nfcStatus === "unsupported" && (
              <div style={{ background: "#fef9c3", border: "1px solid #fde68a", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#92400e", textAlign: "left" }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>NFC non disponible dans ce navigateur</div>
                <div>Utilisez Chrome sur Android. Sur iPhone, la programmation NFC n'est pas prise en charge (lecture seule).</div>
              </div>
            )}
          </div>
          <div style={{ background: "#f8f9ff", borderRadius: 10, padding: "12px 14px", fontSize: 12, color: "#64748b", lineHeight: 1.8 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Compatibilité</div>
            <div>📱 Programmation : Chrome Android uniquement</div>
            <div>✅ Lecture : iPhone 7+ et Android avec NFC</div>
            <div>🛒 Badge NTAG213 : ~0,50€ sur Amazon</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Bottom Navigation Bar (mobile) ──────────────────────────────────────────
function BottomNav({ tab, showLogs, canAdmin, setTab, setShowLogs }) {
  const items = [
    { id: "ordonnances", icon: "📋", label: "Ordo", always: true },
    { id: "qrcode",      icon: "📱", label: "QR Code", adminOnly: true },
    { id: "parametres",  icon: "⚙️", label: "Paramètres", adminOnly: true },
    { id: "logs",        icon: "🗒️", label: "Logs", adminOnly: true },
  ].filter(it => !it.adminOnly || canAdmin);
  const active = showLogs ? "logs" : tab;
  return (
    <nav style={{ position:"fixed", bottom:0, left:0, right:0, zIndex:200, background:"#fff", borderTop:"1px solid #e2e8f0", display:"flex", justifyContent:"space-around", alignItems:"stretch", height:60 }} className="bottom-nav">
      {items.map(it => {
        const isActive = active === it.id;
        return (
          <button key={it.id} onClick={() => { if(it.id==="logs"){setShowLogs(true);}else{setTab(it.id);setShowLogs(false);} }}
            style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:2, border:"none", background:"none", cursor:"pointer", fontFamily:"inherit", borderTop: isActive?"2px solid #1a3a6e":"2px solid transparent" }}>
            <span style={{ fontSize:20 }}>{it.icon}</span>
            <span style={{ fontSize:9, fontWeight:isActive?800:500, color:isActive?"#1a3a6e":"#94a3b8" }}>{it.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

// ─── PharmacieDashboard ───────────────────────────────────────────────────────
function PharmacieDashboard({ pharmacieId, onLogout, onPatientPage, userRole = "admin", userId = "demo" }) {
  const [pharmacie, setPharmacie] = useState(null);
  const [ordonnances, setOrdonnances] = useState([]);
  const [dashLoading, setDashLoading] = useState(true);
  const [tab, setTab] = useState("ordonnances");
  const [showLogs, setShowLogs] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()));
  const [viewMode, setViewMode] = useState("grid");
  const [loadingId, setLoadingId] = useState(null);
  const [viewerAtt, setViewerAtt] = useState(null);
  const [printModal, setPrintModal] = useState(null);
  const [filterStatus, setFilterStatus] = useState("nouveau");

  const searchRef = useRef(null);
  const userId2 = userId;

  const canAdmin = userRole !== "vendeur";

  // Chargement initial + Realtime
  // ─── OCR automatique dès réception ──────────────────────────────────────────
  async function triggerOcrOnNew(ordos) {
    const sb = getSupabaseClient();
    for (const ordo of ordos) {
      if (ordo.extracted?._ocrSuccess) continue;
      const att = ordo.attachments?.[0];
      if (!att?.path && !att?.dataUrl) continue;
      try {
        let dataUrl = att.dataUrl;
        if (!dataUrl && att.path) {
          const signedUrl = await getSignedUrl(att.path, 300);
          if (!signedUrl) continue;
          const resp = await fetch(signedUrl);
          const blob = await resp.blob();
          dataUrl = await new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.readAsDataURL(blob);
          });
        }
        if (!dataUrl) continue;
        const base64 = dataUrl.split(",")[1];
        const mimeType = att.type === "pdf" ? "application/pdf" : "image/jpeg";
        const extracted = await extractFromFile(base64, mimeType, {
          fallbackName: ordo.fromName || null,
        });
        if (extracted?._ocrSuccess) {
          if (sb && !isDemoMode) {
            await sb.from("ordonnances").update({
              patient_nom:    extracted.nom        || null,
              ocr_confidence: extracted._confidence || 0,
            }).eq("id", ordo.id);
          }
          setOrdonnances(prev => prev.map(o =>
            o.id === ordo.id ? { ...o, extracted } : o
          ));
        }
      } catch(e) {
        console.warn("[OCR auto]", ordo.id, e.message);
      }
    }
  }

  // Préchauffer Tesseract dès le login (évite le délai au 1er scan)
  useEffect(() => { prewarmTesseract(); }, []);

  useEffect(() => {
    let unsub = () => {};
    async function load() {
      setDashLoading(true);
      const [ph, ordos] = await Promise.all([
        fetchPharmacie(pharmacieId),
        fetchOrdonnances(pharmacieId, 7),
      ]);
      if (ph) setPharmacie(ph);
      if (ordos) {
        setOrdonnances(ordos);
        // OCR sur les ordonnances déjà en base sans extraction
        setTimeout(() => triggerOcrOnNew(ordos), 2000);
      }
      setDashLoading(false);
      // Réaltime / pub-sub
      unsub = subscribeToPharmacy(pharmacieId, async () => {
        const updated = await fetchPharmacie(pharmacieId);
        if (updated) setPharmacie(updated);
        const updatedOrdos = await fetchOrdonnances(pharmacieId, 7);
        if (updatedOrdos) {
          setOrdonnances(updatedOrdos);
          // Déclencher OCR automatique sur les nouvelles ordonnances sans extraction
          triggerOcrOnNew(updatedOrdos, pharmacieId);
        }
      });
    }
    load();
    return () => unsub();
  }, [pharmacieId]);

  if (dashLoading) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",flexDirection:"column",gap:12,fontFamily:"'Inter',system-ui,sans-serif"}}>
      <div style={{fontSize:48}}>💊</div>
      <div style={{fontWeight:700,fontSize:16,color:"#1a3a6e"}}>Chargement OrdoMail…</div>
      {isDemoMode && <div style={{fontSize:12,color:"#94a3b8"}}>Mode démonstration</div>}
    </div>
  );
  if (!pharmacie) return <div style={{padding:40,textAlign:"center",color:"#dc2626"}}>Erreur : pharmacie introuvable</div>;
  const ordonnancesJour = (ordonnances||[]).filter(o => isSameDay(o.receivedAt, selectedDate));
  const normalize = (s) => (s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"");
  const filteredByDate = ordonnancesJour;
  const filteredBySearch = searchQuery
    ? filteredByDate.filter(o => {
        const nom = o.extracted?.nom || o.fromName || "";
        const words = normalize(searchQuery).split(/\s+/).filter(Boolean);
        return words.every(w => normalize(nom).includes(w));
      })
    : filteredByDate;

  const filteredOrdos = filterStatus === "tous" ? filteredBySearch
    : filteredBySearch.filter(o => o.status === filterStatus);

  const nouveaux = ordonnances.filter(o => o.status === "nouveau").length;
  const couleur = pharmacie?.couleur || "#1a3a6e";
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://ordomail.fr";
  const qrUrl = `${baseUrl}/?patient=${pharmacie?.id}`;
  const joursDispos = [...new Set([toDateKey(new Date()), ...(ordonnances||[]).map(o => toDateKey(o.receivedAt))])].sort().reverse();

  async function updateOrdo(id, patch) {
    // Mise à jour optimiste locale immédiate
    setOrdonnances(prev => prev.map(o => o.id === id ? {...o,...patch} : o));
    // Persistance async
    if (patch.status) {
      await updateOrdoStatus(id, pharmacieId, patch.status);
    }
    if (patch.extracted) {
      await updateOrdoExtracted(id, pharmacieId, patch.extracted);
    }
  }
  function handleViewOrdo(id) { addAuditLog({userId:userId2,userRole,pharmacieId,action:"view",ordonnanceId:id}).catch(()=>{}); }
  function handlePrintOrdo(id) { addAuditLog({userId:userId2,userRole,pharmacieId,action:"print",ordonnanceId:id}).catch(()=>{}); }
  async function handleFile(ordoId, file, dataUrl) {
    setLoadingId(ordoId);
    // Upload vers Storage (ou mémoire en mode démo)
    await uploadOrdoFile(pharmacieId, ordoId, file, dataUrl);
    // Mise à jour locale immédiate
    const ext = file.name.split(".").pop().toLowerCase();
    setOrdonnances(prev => prev.map(o => o.id === ordoId ? {
      ...o, attachments:[{name:file.name,type:ext==="pdf"?"pdf":"image",dataUrl,size:`${(file.size/1024).toFixed(0)} Ko`}]
    } : o));
    // OCR
    const ordo = ordonnances.find(o => o.id === ordoId);
    const fallbackName = ordo?.fromName || ordo?.extracted?.nom || null;
    const extracted = await extractFromFile(dataUrl.split(",")[1], file.type, { fallbackName });
    await updateOrdo(ordoId, {extracted});
    setLoadingId(null);
  }
  async function handleSaveParams(patch) {
    await savePharmacie(pharmacieId, patch);
    setPharmacie(p=>({...p,...patch}));
  }

  return (
    <div style={{fontFamily:"'Inter',system-ui,sans-serif",minHeight:"100vh",background:"#f0f2f8",display:"flex",flexDirection:"column"}}>
      <header style={{background:couleur,color:"#fff",height:52,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 14px",boxShadow:"0 2px 12px rgba(0,0,0,0.2)"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,minWidth:0,flex:1}}>
          {pharmacie?.logo?<img src={pharmacie.logo} alt="logo" style={{width:30,height:30,objectFit:"cover",borderRadius:7,flexShrink:0}}/>:<span style={{fontSize:20,flexShrink:0}}>💊</span>}
          <div style={{minWidth:0}}>
            <div style={{fontWeight:800,fontSize:13,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{pharmacie?.nom}</div>
            <div style={{fontSize:9,opacity:0.6,letterSpacing:0.5}}>ORDOMAIL</div>
          </div>
        </div>
        <div style={{display:"flex",gap:2,flexShrink:0}} className="desktop-nav">
          <button onClick={()=>{setTab("ordonnances");setShowLogs(false);}} style={{padding:"5px 12px",border:"none",borderRadius:7,cursor:"pointer",background:tab==="ordonnances"&&!showLogs?"rgba(255,255,255,0.25)":"transparent",color:"#fff",fontWeight:tab==="ordonnances"&&!showLogs?700:400,fontSize:12,fontFamily:"inherit"}}>📋 Ordonnances</button>
          {canAdmin&&<><button onClick={()=>{setTab("qrcode");setShowLogs(false);}} style={{padding:"5px 12px",border:"none",borderRadius:7,cursor:"pointer",background:tab==="qrcode"&&!showLogs?"rgba(255,255,255,0.25)":"transparent",color:"#fff",fontWeight:tab==="qrcode"&&!showLogs?700:400,fontSize:12,fontFamily:"inherit"}}>📱 QR Code</button>
          <button onClick={()=>{setTab("parametres");setShowLogs(false);}} style={{padding:"5px 12px",border:"none",borderRadius:7,cursor:"pointer",background:tab==="parametres"&&!showLogs?"rgba(255,255,255,0.25)":"transparent",color:"#fff",fontWeight:tab==="parametres"&&!showLogs?700:400,fontSize:12,fontFamily:"inherit"}}>⚙️ Paramètres</button>
          <button onClick={()=>setShowLogs(l=>!l)} style={{padding:"5px 12px",border:"none",borderRadius:7,cursor:"pointer",background:showLogs?"rgba(255,255,255,0.25)":"transparent",color:"#fff",fontWeight:showLogs?700:400,fontSize:12,fontFamily:"inherit"}}>🗒️ Logs</button></>}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
          {nouveaux>0&&<div style={{background:"#e6a817",borderRadius:20,padding:"2px 10px",fontSize:11,fontWeight:800}}>{nouveaux} 🔔</div>}
          <button onClick={onLogout} style={{border:"1px solid rgba(255,255,255,0.35)",borderRadius:7,background:"transparent",color:"#fff",padding:"5px 10px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>⏏ Quitter</button>
          <span style={{fontSize:9,color:"rgba(255,255,255,0.3)",fontFamily:"monospace",marginLeft:6}}>{APP_VERSION}</span>
        </div>
      </header>
      <BottomNav tab={tab} showLogs={showLogs} canAdmin={canAdmin} setTab={setTab} setShowLogs={setShowLogs} />

      {showLogs&&canAdmin&&<LogsPanel pharmacieId={pharmacieId} onClose={()=>setShowLogs(false)}/>}

      {tab==="ordonnances"&&!showLogs&&(
        <div style={{flex:1,overflow:"hidden",display:"flex",flexDirection:"column",paddingBottom:60}}>
          <div style={{background:"#fff",borderBottom:"1px solid #e8eaf0",padding:"10px 16px",display:"flex",flexDirection:"column",gap:8,flexShrink:0}}>
            <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
              <div style={{display:"flex",alignItems:"center",gap:6,background:"#f0f2f8",borderRadius:10,padding:"5px 10px",flexShrink:0}}>
                <span style={{fontSize:14}}>📅</span>
                <select value={selectedDate} onChange={e=>{setSelectedDate(e.target.value);setSearchQuery("");}}
                  style={{border:"none",background:"transparent",fontFamily:"inherit",fontSize:13,fontWeight:700,color:"#1a3a6e",cursor:"pointer",outline:"none"}}>
                  {joursDispos.map(d=><option key={d} value={d}>{formatDateLabel(d)}</option>)}
                </select>
              </div>
              <div style={{flex:1,position:"relative",minWidth:120}}>
                <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",fontSize:14,pointerEvents:"none"}}>🔍</span>
                <input ref={searchRef} value={searchQuery} onChange={e=>setSearchQuery(e.target.value)}
                  placeholder="Rechercher…"
                  style={{width:"100%",padding:"8px 10px 8px 32px",border:`1.5px solid ${searchQuery?couleur:"#e0e0e0"}`,borderRadius:10,fontSize:13,fontFamily:"inherit",outline:"none",background:"#fff",boxSizing:"border-box"}}/>
              </div>
              <div style={{display:"flex",gap:4}}>
                <button onClick={()=>setViewMode("grid")} style={{width:32,height:32,border:`1.5px solid ${viewMode==="grid"?couleur:"#e0e0e0"}`,borderRadius:8,background:viewMode==="grid"?couleur:"#fff",color:viewMode==="grid"?"#fff":"#888",cursor:"pointer",fontSize:14}}>⊞</button>
                <button onClick={()=>setViewMode("list")} style={{width:32,height:32,border:`1.5px solid ${viewMode==="list"?couleur:"#e0e0e0"}`,borderRadius:8,background:viewMode==="list"?couleur:"#fff",color:viewMode==="list"?"#fff":"#888",cursor:"pointer",fontSize:14}}>☰</button>
              </div>
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
              {[["nouveau","🔔 À traiter",ordonnancesJour.filter(o=>o.status==="nouveau").length],["imprime","✓ Imprimées",ordonnancesJour.filter(o=>o.status==="imprime").length],["tous","Toutes",ordonnancesJour.length]].map(([k,l,count])=>(
                <button key={k} onClick={()=>setFilterStatus(k)}
                  style={{padding:"5px 12px",borderRadius:16,border:`1.5px solid ${filterStatus===k?couleur:"#e0e0e0"}`,background:filterStatus===k?couleur:"#fff",color:filterStatus===k?"#fff":"#555",fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:5}}>
                  {l}<span style={{background:filterStatus===k?"rgba(255,255,255,0.25)":"#f0f0f0",borderRadius:10,padding:"0 6px",fontSize:11}}>{count}</span>
                </button>
              ))}
              <span style={{fontSize:12,color:"#bbb",marginLeft:4}}>{filteredOrdos.length} ordonnance{filteredOrdos.length!==1?"s":""}</span>
            </div>
          </div>
          <div style={{flex:1,overflow:"auto",padding:"12px 12px 80px"}}>
            {filteredOrdos.length===0?(
              <div style={{textAlign:"center",padding:"40px 20px",color:"#bbb"}}>
                <div style={{fontSize:36,marginBottom:10}}>📭</div>
                <div style={{fontSize:15,fontWeight:600}}>Aucune ordonnance</div>
              </div>
            ):viewMode==="grid"?(
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(min(100%,300px),1fr))",gap:12}}>
                {filteredOrdos.map(o=>{
                  const accent=getOrdoAccent(o.id);
                  return <OrdoCard key={o.id} ordo={o} couleur={couleur} accent={accent}
                    onPrint={()=>{handlePrintOrdo(o.id);setPrintModal(o);}}
                    onView={()=>{handleViewOrdo(o.id);(async () => {
              const a = o.attachments?.[0];
              if (!a) return;
              if (a.dataUrl) { setViewerAtt(a); return; }
              if (a.path) {
                const url = await getSignedUrl(a.path, 300);
                if (url) setViewerAtt({ ...a, dataUrl: url });
              }
            })();}}
                    onUpload={(file,dataUrl)=>handleFile(o.id,file,dataUrl)}
                    onReopen={()=>{updateOrdo(o.id,{status:"nouveau"});addAuditLog({userId:userId2,userRole,pharmacieId,action:"reopen",ordonnanceId:o.id});}}
                    loadingId={loadingId}/>;
                })}
              </div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {filteredOrdos.map(o=>{
                  const accent=getOrdoAccent(o.id);
                  return <OrdoRow key={o.id} ordo={o} couleur={couleur} accent={accent}
                    onPrint={()=>{handlePrintOrdo(o.id);setPrintModal(o);}}
                    onView={()=>(async () => {
              const a = o.attachments?.[0];
              if (!a) return;
              if (a.dataUrl) { setViewerAtt(a); return; }
              if (a.path) {
                const url = await getSignedUrl(a.path, 300);
                if (url) setViewerAtt({ ...a, dataUrl: url });
              }
            })()}
                    onReopen={()=>{updateOrdo(o.id,{status:"nouveau"});addAuditLog({userId:userId2,userRole,pharmacieId,action:"reopen",ordonnanceId:o.id});}}/>;
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {tab==="qrcode"&&canAdmin&&!showLogs&&<QRNFCTab pharmacie={pharmacie} couleur={couleur} qrUrl={qrUrl} onPatientPage={onPatientPage}/>}
      {tab==="parametres"&&canAdmin&&!showLogs&&<ParametresTab pharmacie={pharmacie} onSave={handleSaveParams}/>}

      {viewerAtt&&<ViewerModal att={viewerAtt} onClose={()=>setViewerAtt(null)}/>}
      {printModal&&<PrintConfirmModal ordo={printModal}
        onConfirm={()=>{updateOrdo(printModal.id,{status:"imprime"});setPrintModal(null);}}
        onCancel={()=>setPrintModal(null)}/>}

      <div id="ordomail-print-area" style={{display:"none"}}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}@keyframes popIn{0%{opacity:0;transform:scale(0.92)}100%{opacity:1;transform:scale(1)}}*{box-sizing:border-box}::-webkit-scrollbar{width:6px}::-webkit-scrollbar-thumb{background:#ddd;border-radius:3px}@media print{body>*{display:none!important}#ordomail-print-area{display:block!important;position:fixed;top:0;left:0;width:100%;background:#fff}}@media(max-width:640px){.hide-mobile{display:none!important}.desktop-nav{display:none!important}.bottom-nav{display:flex!important}}@media(min-width:641px){.desktop-nav{display:flex!important}.bottom-nav{display:none!important}.mobile-padded{padding-bottom:0!important}}`}</style>
    </div>
  );
}

// ─── AdminDashboard ───────────────────────────────────────────────────────────
function AdminDashboard({ onLogout }) {
  return (
    <div style={{fontFamily:"'Inter',system-ui,sans-serif",minHeight:"100vh",background:"#f0f2f8"}}>
      <header style={{background:"#0f172a",color:"#fff",height:52,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 20px"}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}><span>💊</span><span style={{fontWeight:800}}>OrdoMail Admin</span></div>
        <button onClick={onLogout} style={{border:"1px solid rgba(255,255,255,0.3)",borderRadius:7,background:"transparent",color:"#fff",padding:"5px 12px",fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>Déconnexion</button>
      </header>
      <div style={{padding:24}}>
        <div style={{fontWeight:800,fontSize:18,color:"#1a3a6e",marginBottom:16}}>Pharmacies</div>
        {DB.pharmacies.map(ph=>(
          <div key={ph.id} style={{background:"#fff",borderRadius:12,padding:"14px 18px",marginBottom:10,boxShadow:"0 1px 4px rgba(0,0,0,0.06)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontWeight:700,fontSize:15}}>{ph.nom}</div>
              <div style={{fontSize:12,color:"#94a3b8"}}>{ph.email} · Plan {ph.plan}</div>
            </div>
            <div style={{fontSize:12,color:"#64748b"}}>{(ph.ordonnances||[]).length} ordonnances</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTÈME DE CONNEXION
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Bouton Pro Santé Connect ─────────────────────────────────────────────────
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

// ─── Onglet connexion : PSC (admin) ou PIN (vendeur) ─────────────────────────
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

// ─── LoginPage complète ───────────────────────────────────────────────────────
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


// ─── AppLogin ─────────────────────────────────────────────────────────────────
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

// ─── BillingModule ────────────────────────────────────────────────────────────
function BillingModule({ initialView, planId, billing, onBack }) {
  const [view, setView] = useState(initialView||"pricing");
  const [step, setStep] = useState("details");
  const [checkoutPlan, setCheckoutPlan] = useState(planId||"standard");
  const [checkoutBilling, setCheckoutBilling] = useState(billing||"monthly");
  const [billingTab, setBillingTab] = useState("monthly");
  const [form, setForm] = useState({nom:"",email:"",password:"",pharmacie:"",adresse:""});
  const [cardData, setCardData] = useState({number:"",expiry:"",cvc:"",name:""});
  const [errors, setErrors] = useState({});
  const [createError, setCreateError] = useState("");
  const [createdEmail, setCreatedEmail] = useState("");
  const [createdEmailReception, setCreatedEmailReception] = useState("");
  const [createdPlan, setCreatedPlan] = useState("");

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

  if (view==="success") return (
    <div style={{minHeight:"100vh",background:"linear-gradient(160deg,#1a3a6e,#15623a)",display:"flex",alignItems:"center",justifyContent:"center",padding:24,fontFamily:"'Inter',system-ui,sans-serif"}}>
      <div style={{background:"#fff",borderRadius:20,padding:"40px 36px",maxWidth:440,width:"100%",textAlign:"center",boxShadow:"0 24px 60px rgba(0,0,0,0.25)"}}>
        <div style={{fontSize:64,marginBottom:16}}>🎉</div>
        <h2 style={{fontWeight:900,fontSize:24,color:"#0f172a",marginBottom:8}}>Compte créé !</h2>
        <p style={{color:"#64748b",fontSize:14,marginBottom:16,lineHeight:1.7}}>
          Essai gratuit 30 jours démarré.<br/>
          Un email de confirmation a été envoyé à<br/>
          <strong style={{color:"#1a3a6e"}}>{createdEmail}</strong>
        </p>
        {createdEmailReception && (
          <div style={{background:"#f0f7ff",border:"1px solid #dbeafe",borderRadius:10,padding:"12px 16px",marginBottom:16,textAlign:"left",fontSize:13}}>
            <div style={{fontWeight:700,color:"#1a3a6e",marginBottom:6}}>📋 Vos informations</div>
            <div style={{color:"#475569",marginBottom:4}}>✉️ Adresse ordonnances :<br/><strong style={{fontFamily:"monospace",fontSize:12}}>{createdEmailReception}</strong></div>
            <div style={{color:"#475569"}}>💳 Plan : <strong>{createdPlan}</strong> — 30 jours gratuits</div>
          </div>
        )}
        <div style={{background:"#fef9c3",border:"1px solid #fde68a",borderRadius:8,padding:"8px 12px",fontSize:12,color:"#92400e",marginBottom:16,textAlign:"left"}}>
          ⚠️ Cliquez le lien dans l'email pour activer votre compte avant de vous connecter.
        </div>
        <button onClick={onBack} style={{width:"100%",padding:14,border:"none",borderRadius:11,background:"#1a3a6e",color:"#fff",fontWeight:800,fontSize:16,cursor:"pointer",fontFamily:"inherit"}}>Aller à la connexion →</button>
      </div>
    </div>
  );

  if (view==="checkout") return (
    <div style={{minHeight:"100vh",background:"#f8fafc",fontFamily:"'Inter',system-ui,sans-serif"}}>
      <PersistentNav onBack={onBack} currentPage="checkout" secure/>
      <div style={{maxWidth:840,margin:"0 auto",padding:"24px 16px",display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,340px),1fr))",gap:18}}>
        <div style={{background:"#fff",borderRadius:16,padding:28,boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
          {step==="details"&&(
            <>
              <h3 style={{fontWeight:800,fontSize:18,color:"#0f172a",marginBottom:22,marginTop:0}}>Informations</h3>
              {[["nom","Votre nom *","text","Dr MARTIN Pierre"],["email","Email *","email","contact@pharmacie.fr"],["password","Mot de passe *","password","8 caractères minimum"],["pharmacie","Pharmacie *","text","Pharmacie de la Paix"],["adresse","Adresse","text","12 rue..."]].map(([k,l,t,ph])=>(
                <div key={k} style={{marginBottom:14}}>
                  <label style={{fontSize:12,fontWeight:700,color:"#374151",display:"block",marginBottom:5}}>{l}</label>
                  <input type={t} placeholder={ph} value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))}
                    style={{width:"100%",padding:"10px 12px",border:`1.5px solid ${errors[k]?"#ef4444":"#e2e8f0"}`,borderRadius:9,fontSize:14,outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}/>
                  {errors[k]&&<div style={{fontSize:12,color:"#ef4444",marginTop:3}}>{errors[k]}</div>}
                </div>
              ))}
              <button onClick={()=>{const e={};if(!form.nom)e.nom="Requis";if(!form.email.includes("@"))e.email="Email invalide";if(!form.pharmacie)e.pharmacie="Requis";setErrors(e);if(!Object.keys(e).length)setStep("card");}}
                style={{width:"100%",padding:12,border:"none",borderRadius:11,background:"#1a3a6e",color:"#fff",fontWeight:800,fontSize:15,cursor:"pointer",fontFamily:"inherit"}}>Continuer →</button>
            </>
          )}
          {step==="card"&&(
            <>
              <h3 style={{fontWeight:800,fontSize:18,color:"#0f172a",marginBottom:6,marginTop:0}}>Paiement</h3>
              <p style={{fontSize:13,color:"#94a3b8",marginBottom:18}}>Débitée uniquement après les 30 jours.</p>
              <div style={{marginBottom:12}}>
                <label style={{fontSize:12,fontWeight:700,color:"#374151",display:"block",marginBottom:5}}>Numéro de carte</label>
                <input placeholder="1234 5678 9012 3456" value={cardData.number} onChange={e=>setCardData(c=>({...c,number:e.target.value.replace(/\s/g,"").replace(/(.{4})/g,"$1 ").trim().slice(0,19)}))}
                  style={{width:"100%",padding:"10px 12px",border:"1.5px solid #e2e8f0",borderRadius:9,fontSize:14,outline:"none",fontFamily:"monospace",boxSizing:"border-box"}}/>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                {[["expiry","MM/AA"],["cvc","CVC"]].map(([k,ph])=>(
                  <div key={k}><input placeholder={ph} value={cardData[k]} onChange={e=>setCardData(c=>({...c,[k]:e.target.value}))}
                    style={{width:"100%",padding:"10px 12px",border:"1.5px solid #e2e8f0",borderRadius:9,fontSize:14,outline:"none",fontFamily:"monospace",boxSizing:"border-box"}}/></div>
                ))}
              </div>
              <div style={{background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:9,padding:"9px 12px",marginBottom:16,fontSize:12,color:"#166534"}}>🔒 Données chiffrées par Stripe</div>
              {createError && (
                <div style={{background:"#fee2e2",border:"1px solid #fecaca",borderRadius:8,padding:"9px 12px",marginBottom:12,fontSize:13,color:"#dc2626"}}>⚠️ {createError}</div>
              )}
              <button onClick={async ()=>{
                const e={};
                if(!form.nom) e.nom="Requis";
                if(!form.email||!form.email.includes("@")) e.email="Email invalide";
                if(!form.password||form.password.length<8) e.password="8 caractères minimum";
                if(!form.pharmacie) e.pharmacie="Requis";
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
                  // Code vendeur 6 chiffres unique
                  const codeVendeur = String(Math.floor(100000 + Math.random() * 900000));

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
                      email: form.email,
                      plan: checkoutPlan,
                      emailReception,
                    }),
                  });

                  const regData = await regRes.json();
                  if (!regRes.ok && regRes.status !== 409) {
                    // 409 = pharmacie déjà créée (email confirmation pending) = OK
                    throw new Error(regData.error || "Erreur création pharmacie");
                  }

                  setCreatedEmail(form.email);
                  setCreatedEmailReception(emailReception);
                  setCreatedPlan(checkoutPlan);
                  setView("success");
                } catch(err) {
                  setCreateError(err.message || "Erreur lors de la création");
                  setView("checkout");
                }
              }} style={{width:"100%",padding:12,border:"none",borderRadius:11,background:"#1a3a6e",color:"#fff",fontWeight:800,fontSize:15,cursor:"pointer",fontFamily:"inherit"}}>
                Créer mon compte — essai gratuit 30j →
              </button>
            </>
          )}
        </div>
        <div style={{background:"#fff",borderRadius:16,padding:20,boxShadow:"0 2px 8px rgba(0,0,0,0.06)",alignSelf:"start"}}>
          <div style={{fontSize:11,fontWeight:700,color:"#94a3b8",letterSpacing:1,marginBottom:12}}>RÉCAPITULATIF</div>
          <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:14,paddingBottom:14,borderBottom:"1px solid #f1f5f9"}}>
            <div style={{width:36,height:36,borderRadius:9,background:`${plan.color}18`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>{plan.icon}</div>
            <div><div style={{fontWeight:800,fontSize:14,color:"#0f172a"}}>OrdoMail {plan.label}</div><div style={{fontSize:12,color:"#94a3b8"}}>{checkoutBilling==="annual"?"Annuel (−20%)":"Mensuel"}</div></div>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><span style={{fontSize:12,color:"#94a3b8"}}>Aujourd'hui</span><span style={{fontSize:12,fontWeight:700,color:"#16a34a"}}>0 € — Gratuit</span></div>
          <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:12,color:"#94a3b8"}}>Après 30 jours</span><span style={{fontSize:12,fontWeight:700,color:"#0f172a"}}>{price} €/mois</span></div>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",background:"#f8fafc",fontFamily:"'Inter',system-ui,sans-serif"}}>
      <PersistentNav onBack={onBack} currentPage="pricing"/>
      <div style={{maxWidth:980,margin:"0 auto",padding:"40px 16px"}}>
        <div style={{textAlign:"center",marginBottom:36}}>
          <h1 style={{fontSize:"clamp(24px,6vw,38px)",fontWeight:900,color:"#0f172a",marginBottom:12}}>Choisissez votre plan</h1>
          <p style={{color:"#64748b",fontSize:16,marginBottom:20}}>30 jours gratuits · Sans carte bancaire</p>
          <div style={{display:"inline-flex",background:"#fff",borderRadius:10,padding:4,gap:4,border:"1px solid #e2e8f0"}}>
            {[["monthly","Mensuel"],["annual","Annuel −20%"]].map(([k,l])=>(
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
                <div style={{marginBottom:14}}><span style={{fontSize:34,fontWeight:900,color:p.color}}>{pr}</span><span style={{fontSize:13,color:"#94a3b8"}}> €/mois</span></div>
                <button onClick={()=>{setCheckoutPlan(pid);setCheckoutBilling(billingTab);setStep("details");setView("checkout");}}
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

// ─── Backoffice Admin ─────────────────────────────────────────────────────────
function BackofficeAdmin({ onBack }) {
  const [authed,    setAuthed]    = useState(false);
  const [email,     setEmail]     = useState("");
  const [pwd,       setPwd]       = useState("");
  const [err,       setErr]       = useState("");
  const [loading,   setLoading]   = useState(false);

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
      if (data.success) setAuthed(true);
      else setErr(data.error || "Identifiants incorrects");
    } catch(e) {
      // Fallback mode démo
      if (email === DB.admin.email && pwd === DB.admin.password) setAuthed(true);
      else setErr("Erreur de connexion");
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
          <button onClick={()=>setAuthed(false)} style={{background:"rgba(255,255,255,0.05)",border:"1px solid #1e293b",color:"#475569",padding:"5px 12px",borderRadius:7,cursor:"pointer",fontSize:12,fontFamily:"inherit"}}>Déconnexion</button>
        </div>
      </header>
      <AdminDashboardLive/>
    </div>
  );
}

// ─── Dashboard admin live (données Supabase) ──────────────────────────────────

// ─── Admin : Gestion du contenu stories santé ────────────────────────────────
function StoriesContentAdmin() {
  const [items, setItems]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing]   = useState(null);
  const [form, setForm]         = useState({
    type: "info", titre: "", contenu: "", emoji: "💡",
    question: "", reponses: "", explication: "", actif: true,
  });
  const [saving, setSaving]     = useState(false);
  const [search, setSearch]     = useState("");
  const sb = getSupabaseClient();

  const TYPES = [
    { id:"info",    label:"Information",  emoji:"💡", color:"#1a3a6e" },
    { id:"conseil", label:"Conseil santé",emoji:"💊", color:"#15803d" },
    { id:"quiz",    label:"Quiz",         emoji:"🧠", color:"#6d28d9" },
  ];

  useEffect(() => { loadItems(); }, []);

  async function loadItems() {
    setLoading(true);
    if (!sb) { setLoading(false); return; }
    const { data } = await sb.from("stories_content").select("*").order("created_at", { ascending: false });
    if (data) setItems(data);
    setLoading(false);
  }

  function openNew() {
    setEditing(null);
    setForm({ type:"info", titre:"", contenu:"", emoji:"💡", question:"", reponses:"", explication:"", actif:true });
    setShowForm(true);
  }

  function openEdit(item) {
    setEditing(item.id);
    setForm({
      type: item.type, titre: item.titre, contenu: item.contenu || "",
      emoji: item.emoji || "💡", question: item.question || "",
      reponses: item.reponses || "", explication: item.explication || "",
      actif: item.actif,
    });
    setShowForm(true);
  }

  async function saveItem() {
    if (!form.titre.trim()) return;
    setSaving(true);
    const payload = {
      type: form.type, titre: form.titre, contenu: form.contenu,
      emoji: form.emoji, question: form.question,
      reponses: form.reponses, explication: form.explication, actif: form.actif,
    };
    if (editing) {
      await sb.from("stories_content").update(payload).eq("id", editing);
      setItems(prev => prev.map(x => x.id === editing ? { ...x, ...payload } : x));
    } else {
      const { data } = await sb.from("stories_content").insert(payload).select().single();
      if (data) setItems(prev => [data, ...prev]);
    }
    setShowForm(false); setSaving(false); setEditing(null);
  }

  async function deleteItem(id) {
    if (!window.confirm("Supprimer ce contenu ?")) return;
    await sb.from("stories_content").delete().eq("id", id);
    setItems(prev => prev.filter(x => x.id !== id));
  }

  async function toggleActif(id, actif) {
    await sb.from("stories_content").update({ actif: !actif }).eq("id", id);
    setItems(prev => prev.map(x => x.id === id ? { ...x, actif: !actif } : x));
  }

  const filtered = items.filter(x =>
    x.titre.toLowerCase().includes(search.toLowerCase()) ||
    (x.contenu||"").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
        <div>
          <div style={{ fontWeight:900, fontSize:18 }}>📱 Contenu Stories Santé</div>
          <div style={{ fontSize:12, color:"#64748b", marginTop:2 }}>{items.length} contenus · Affichés aléatoirement aux patients</div>
        </div>
        <button onClick={openNew}
          style={{ padding:"10px 18px", border:"none", borderRadius:10, background:"#1a3a6e", color:"#fff", fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>
          + Ajouter
        </button>
      </div>

      {/* Barre recherche */}
      <input value={search} onChange={e=>setSearch(e.target.value)}
        placeholder="🔍 Rechercher…"
        style={{ width:"100%", border:"1.5px solid #e0e7ff", borderRadius:10, padding:"10px 14px", fontSize:14, fontFamily:"inherit", marginBottom:16, outline:"none" }}/>

      {/* Formulaire */}
      {showForm && (
        <div style={{ background:"#f8faff", border:"1.5px solid #e0e7ff", borderRadius:14, padding:20, marginBottom:20 }}>
          <div style={{ fontWeight:700, fontSize:15, marginBottom:16 }}>{editing ? "✏️ Modifier" : "➕ Nouveau contenu"}</div>

          {/* Type */}
          <div style={{ display:"flex", gap:8, marginBottom:14 }}>
            {TYPES.map(t => (
              <button key={t.id} onClick={()=>setForm(f=>({...f, type:t.id, emoji:t.emoji}))}
                style={{ flex:1, padding:"8px 4px", border:`2px solid ${form.type===t.id?t.color:"#e0e7ff"}`,
                  borderRadius:10, background:form.type===t.id?t.color:"#fff",
                  color:form.type===t.id?"#fff":"#374151", fontWeight:700, fontSize:12,
                  cursor:"pointer", fontFamily:"inherit", textAlign:"center" }}>
                <div style={{ fontSize:18 }}>{t.emoji}</div>
                <div>{t.label}</div>
              </button>
            ))}
          </div>

          {/* Emoji + Titre */}
          <div style={{ display:"flex", gap:8, marginBottom:10 }}>
            <input value={form.emoji} onChange={e=>setForm(f=>({...f,emoji:e.target.value}))}
              style={{ width:52, border:"1.5px solid #e0e7ff", borderRadius:8, padding:8, fontSize:20, textAlign:"center", fontFamily:"inherit" }}/>
            <input value={form.titre} onChange={e=>setForm(f=>({...f,titre:e.target.value}))}
              placeholder="Titre" style={{ flex:1, border:"1.5px solid #e0e7ff", borderRadius:8, padding:"8px 12px", fontSize:14, fontFamily:"inherit" }}/>
          </div>

          {/* Contenu texte (info + conseil) */}
          {form.type !== "quiz" && (
            <textarea value={form.contenu} onChange={e=>setForm(f=>({...f,contenu:e.target.value}))}
              placeholder="Contenu de la story (2-3 lignes max)" rows={3}
              style={{ width:"100%", border:"1.5px solid #e0e7ff", borderRadius:8, padding:"8px 12px", fontSize:13, fontFamily:"inherit", resize:"none", marginBottom:10 }}/>
          )}

          {/* Champs quiz */}
          {form.type === "quiz" && (
            <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:10 }}>
              <input value={form.question} onChange={e=>setForm(f=>({...f,question:e.target.value}))}
                placeholder="Question du quiz"
                style={{ border:"1.5px solid #e0e7ff", borderRadius:8, padding:"8px 12px", fontSize:13, fontFamily:"inherit" }}/>
              <textarea value={form.reponses} onChange={e=>setForm(f=>({...f,reponses:e.target.value}))}
                rows={5} placeholder={`Réponses au format JSON:
[{"text":"Réponse A","correct":false,"emoji":"❌"},
 {"text":"Réponse B","correct":true,"emoji":"✅"}]`}
                style={{ border:"1.5px solid #e0e7ff", borderRadius:8, padding:"8px 12px", fontSize:12, fontFamily:"monospace", resize:"vertical" }}/>
              <input value={form.explication} onChange={e=>setForm(f=>({...f,explication:e.target.value}))}
                placeholder="Explication après réponse"
                style={{ border:"1.5px solid #e0e7ff", borderRadius:8, padding:"8px 12px", fontSize:13, fontFamily:"inherit" }}/>
            </div>
          )}

          {/* Actif */}
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
            <input type="checkbox" checked={form.actif} onChange={e=>setForm(f=>({...f,actif:e.target.checked}))} id="actif-check"/>
            <label htmlFor="actif-check" style={{ fontSize:13, fontWeight:600, color:"#374151", cursor:"pointer" }}>Actif (affiché aux patients)</label>
          </div>

          <div style={{ display:"flex", gap:8 }}>
            <button onClick={()=>{setShowForm(false);setEditing(null);}}
              style={{ flex:1, padding:"10px", border:"1.5px solid #e0e7ff", borderRadius:10, background:"#fff", fontWeight:600, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>
              Annuler
            </button>
            <button onClick={saveItem} disabled={!form.titre.trim()||saving}
              style={{ flex:2, padding:"10px", border:"none", borderRadius:10, background:"#1a3a6e", color:"#fff", fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>
              {saving ? "Enregistrement…" : editing ? "✅ Enregistrer" : "✅ Publier"}
            </button>
          </div>
        </div>
      )}

      {/* Stats rapides */}
      <div style={{ display:"flex", gap:8, marginBottom:16 }}>
        {TYPES.map(t => (
          <div key={t.id} style={{ flex:1, background:"#f8faff", border:"1.5px solid #e0e7ff", borderRadius:10, padding:"10px 12px", textAlign:"center" }}>
            <div style={{ fontSize:20 }}>{t.emoji}</div>
            <div style={{ fontSize:20, fontWeight:900, color:t.color }}>{items.filter(x=>x.type===t.id).length}</div>
            <div style={{ fontSize:10, color:"#64748b" }}>{t.label}</div>
          </div>
        ))}
        <div style={{ flex:1, background:"#f0fdf4", border:"1.5px solid #bbf7d0", borderRadius:10, padding:"10px 12px", textAlign:"center" }}>
          <div style={{ fontSize:20 }}>✅</div>
          <div style={{ fontSize:20, fontWeight:900, color:"#15803d" }}>{items.filter(x=>x.actif).length}</div>
          <div style={{ fontSize:10, color:"#64748b" }}>Actifs</div>
        </div>
      </div>

      {/* Liste */}
      {loading && <div style={{ textAlign:"center", padding:32, color:"#94a3b8" }}>Chargement…</div>}
      {!loading && filtered.length === 0 && (
        <div style={{ textAlign:"center", padding:32, color:"#94a3b8" }}>
          <div style={{ fontSize:36, marginBottom:8 }}>📭</div>
          <div>{search ? "Aucun résultat" : "Aucun contenu créé"}</div>
        </div>
      )}
      {filtered.map(item => {
        const typeInfo = TYPES.find(t=>t.id===item.type) || TYPES[0];
        return (
          <div key={item.id} style={{ display:"flex", alignItems:"flex-start", gap:12, padding:"14px 16px",
            border:`1.5px solid ${item.actif?"#e0e7ff":"#f1f5f9"}`, borderRadius:12, marginBottom:8,
            background:item.actif?"#fff":"#f8f9fa", opacity:item.actif?1:0.6 }}>
            <div style={{ width:42, height:42, borderRadius:10, background:typeInfo.color, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0 }}>
              {item.emoji||typeInfo.emoji}
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:3 }}>
                <span style={{ fontWeight:700, fontSize:14, color:"#1a1a1a" }}>{item.titre}</span>
                <span style={{ fontSize:10, background:typeInfo.color+"22", color:typeInfo.color, borderRadius:20, padding:"1px 8px", fontWeight:700 }}>{typeInfo.label}</span>
                {!item.actif && <span style={{ fontSize:10, background:"#f1f5f9", color:"#94a3b8", borderRadius:20, padding:"1px 8px", fontWeight:700 }}>Inactif</span>}
              </div>
              {item.contenu && <div style={{ fontSize:12, color:"#64748b", lineHeight:1.5, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{item.contenu}</div>}
              {item.question && <div style={{ fontSize:12, color:"#6d28d9", marginTop:2 }}>❓ {item.question}</div>}
            </div>
            <div style={{ display:"flex", gap:6, flexShrink:0 }}>
              <button onClick={()=>toggleActif(item.id, item.actif)}
                style={{ padding:"5px 10px", border:`1.5px solid ${item.actif?"#fecdd3":"#bbf7d0"}`, borderRadius:8,
                  background:item.actif?"#fff5f5":"#f0fdf4", color:item.actif?"#dc2626":"#15803d",
                  fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
                {item.actif?"Désactiver":"Activer"}
              </button>
              <button onClick={()=>openEdit(item)}
                style={{ padding:"5px 9px", border:"1.5px solid #e0e7ff", borderRadius:8, background:"#f8faff", color:"#1a3a6e", fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>
                ✏️
              </button>
              <button onClick={()=>deleteItem(item.id)}
                style={{ padding:"5px 9px", border:"1.5px solid #fee2e2", borderRadius:8, background:"#fff5f5", color:"#dc2626", fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>
                🗑️
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}


function AdminDashboardLive() {
  const [tab,      setTab]      = useState("clients");
  const [clients,  setClients]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState("");
  const [selected, setSelected] = useState(null);
  const [saving,   setSaving]   = useState(false);
  const [msg,      setMsg]      = useState("");
  const [metrics,  setMetrics]  = useState(null); // métriques globales

  const PLANS = {
    starter:  { label:"Starter",  prix:19,  maxPostes:2,   color:"#0369a1" },
    standard: { label:"Standard", prix:39,  maxPostes:5,   color:"#1a3a6e" },
    pro:      { label:"Pro",      prix:79,  maxPostes:15,  color:"#4c1d95" },
    premium:  { label:"Premium",  prix:119, maxPostes:999, color:"#b45309" },
  };

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
      const sb = getSupabaseClient();
      const { data: pharmacies } = await sb
        .from("pharmacies")
        .select("*, postes(*)")
        .order("created_at", { ascending: false });
      if (!pharmacies) { setLoading(false); return; }

      const now30 = new Date(Date.now() - 30*86400000).toISOString();
      const now7  = new Date(Date.now() - 7*86400000).toISOString();
      const now24 = new Date(Date.now() - 86400000).toISOString();

      const enriched = await Promise.all(pharmacies.map(async ph => {
        const [
          { count: total },
          { count: mois },
          { count: semaine },
          { count: attente },
          { data: canaux },
          { data: offres },
        ] = await Promise.all([
          sb.from("ordonnances").select("*",{count:"exact",head:true}).eq("pharmacie_id",ph.id),
          sb.from("ordonnances").select("*",{count:"exact",head:true}).eq("pharmacie_id",ph.id).gte("received_at",now30),
          sb.from("ordonnances").select("*",{count:"exact",head:true}).eq("pharmacie_id",ph.id).gte("received_at",now7),
          sb.from("ordonnances").select("*",{count:"exact",head:true}).eq("pharmacie_id",ph.id).eq("status","nouveau").lte("received_at",now24),
          sb.from("ordonnances").select("source").eq("pharmacie_id",ph.id).gte("received_at",now30),
          sb.from("offres_stories").select("id",{count:"exact",head:true}).eq("pharmacie_id",ph.id).eq("actif",true),
        ]);

        // Calcul canaux
        const total_canaux = canaux?.length || 0;
        const qr_count = canaux?.filter(o=>o.source==="qrcode").length || 0;
        const email_count = canaux?.filter(o=>o.source==="email").length || 0;
        const canal_qr_pct    = total_canaux ? Math.round(qr_count/total_canaux*100) : 0;
        const canal_email_pct = total_canaux ? Math.round(email_count/total_canaux*100) : 0;

        // Score activité 0-100
        const score = Math.min(100, Math.round(
          (mois||0)*0.4 +
          (semaine||0)*2 +
          (canal_qr_pct)*0.2 +
          ((ph.postes||[]).filter(p=>p.actif&&p.pin_hash).length)*5
        ));

        // Pins configurés
        const pins_configures = (ph.postes||[]).filter(p=>p.pin_hash).length;

        return {
          ...ph,
          postesActifs:    (ph.postes||[]).filter(p=>p.actif).length,
          postesTotal:     (ph.postes||[]).length,
          ordos_total:     total || 0,
          ordos_mois:      mois  || 0,
          ordos_semaine:   semaine || 0,
          ordos_attente:   attente || 0,
          canal_qr_pct,
          canal_email_pct,
          offres_actives:  offres?.length || 0,
          pins_configures,
          score_activite:  score,
          taux_traitement: total ? Math.round(((total-(attente||0))/total)*100) : 0,
        };
      }));

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
  function scoreBg(s)    { return s>=70?"#f0fdf4":s>=40?"#fef9f0":"#fff5f5"; }

  const filtered = clients.filter(c =>
    c.nom?.toLowerCase().includes(search.toLowerCase()) ||
    c.email?.toLowerCase().includes(search.toLowerCase())
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
        <div style={{fontSize:11,color:"#64748b"}}>{new Date().toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long"})}</div>
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
          {[["clients","👥 Clients"],["contrats","📋 Contrats"],["stories","📱 Stories"]].map(([k,l]) => (
            <button key={k} onClick={()=>{setTab(k);setSelected(null);}}
              style={{padding:"7px 16px",border:"none",borderRadius:8,cursor:"pointer",fontFamily:"inherit",fontSize:13,
                fontWeight:tab===k?700:500,
                background:tab===k?"#3b82f6":"#1e293b",
                color:tab===k?"#fff":"#94a3b8",
                border:`1px solid ${tab===k?"#3b82f6":"#334155"}`}}>
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
            <ClientDetail client={selected} plans={PLANS} onClose={()=>setSelected(null)} onRefresh={loadClients}/>
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
                        <div style={{fontSize:11,color:"#64748b"}}>{ph.email}</div>
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
        ) : tab === "stories" ? (
          <StoriesContentAdmin/>
        ) : (
          selected ? (
            <ContratEditor
              pharmacie={selected}
              plans={PLANS}
              onSave={async (id,plan,postes)=>{
                setSaving(true);
                const sb = getSupabaseClient();
                await sb.from("pharmacies").update({plan}).eq("id",id);
                setMsg("✅ Contrat mis à jour");
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

// ─── Détail client avec toutes les métriques ──────────────────────────────────
function ClientDetail({ client: ph, plans, onClose, onRefresh }) {
  const planInfo = plans[ph.plan] || {};
  const trialLeft = ph.trial_ends_at ? Math.ceil((new Date(ph.trial_ends_at)-new Date())/86400000) : null;
  const scoreColor = (s) => s>=70?"#4ade80":s>=40?"#fbbf24":"#f87171";
  const scoreBg    = (s) => s>=70?"rgba(74,222,128,0.1)":s>=40?"rgba(251,191,36,0.1)":"rgba(248,113,113,0.1)";

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
      </div>

      <div style={{padding:24,display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>

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
        </div>

        {/* ── Colonne droite ── */}
        <div style={{display:"flex",flexDirection:"column",gap:16}}>

          {/* Performance */}
          <div style={{background:"#0f172a",borderRadius:12,padding:16}}>
            <div style={{fontSize:11,fontWeight:700,color:"#64748b",letterSpacing:1,textTransform:"uppercase",marginBottom:12}}>⚡ Performance</div>
            {[
              ["Taux de traitement", `${ph.taux_traitement||0}%`,  (ph.taux_traitement||0)>=80?"#4ade80":"#f87171"],
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


function ContratEditor({ pharmacie, plans, onSave, onClose, saving, msg, onClearMsg }) {
  const [plan,        setPlan]        = useState(pharmacie.plan || "starter");
  const [postesActifs, setPostesActifs] = useState(pharmacie.postesActifs || 1);

  const currentPlan = plans[plan];
  const maxPostes   = currentPlan?.maxPostes || 1;
  const prix        = currentPlan?.prix || 0;
  const oldPlan     = plans[pharmacie.plan];
  const delta       = prix - (oldPlan?.prix || 0);

  return (
    <div style={{background:"#1e293b",borderRadius:16,padding:24,border:"1px solid #334155"}}>
      {/* Header client */}
      <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:24,paddingBottom:16,borderBottom:"1px solid #334155"}}>
        <div style={{width:48,height:48,borderRadius:12,background:pharmacie.couleur||"#1a3a6e",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>💊</div>
        <div style={{flex:1}}>
          <div style={{fontWeight:900,fontSize:18,color:"#fff"}}>{pharmacie.nom}</div>
          <div style={{fontSize:13,color:"#64748b"}}>{pharmacie.email}</div>
        </div>
        <button onClick={onClose} style={{background:"transparent",border:"1px solid #334155",color:"#64748b",padding:"5px 12px",borderRadius:7,cursor:"pointer",fontFamily:"inherit",fontSize:12}}>← Retour</button>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>

        {/* ── Choix du plan ── */}
        <div>
          <div style={{fontSize:12,fontWeight:700,color:"#94a3b8",marginBottom:12,textTransform:"uppercase",letterSpacing:1}}>Plan tarifaire</div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {Object.entries(plans).map(([key, p]) => (
              <button key={key} onClick={()=>{ setPlan(key); setPostesActifs(Math.min(postesActifs, p.maxPostes)); }}
                style={{padding:"12px 16px",border:`2px solid ${plan===key?"#3b82f6":"#334155"}`,borderRadius:10,background:plan===key?"#1e3a5f":"transparent",cursor:"pointer",fontFamily:"inherit",textAlign:"left",transition:"all 0.15s"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontWeight:700,fontSize:14,color:plan===key?"#93c5fd":"#fff"}}>{p.label}</span>
                  <span style={{fontWeight:900,fontSize:15,color:plan===key?"#3b82f6":"#64748b"}}>{p.prix} €/mois</span>
                </div>
                <div style={{fontSize:11,color:"#64748b",marginTop:3}}>Jusqu'à {p.maxPostes} poste{p.maxPostes>1?"s":""}</div>
              </button>
            ))}
          </div>
        </div>

        {/* ── Postes actifs ── */}
        <div>
          <div style={{fontSize:12,fontWeight:700,color:"#94a3b8",marginBottom:12,textTransform:"uppercase",letterSpacing:1}}>Postes actifs</div>
          <div style={{background:"#0f172a",borderRadius:10,padding:16,marginBottom:12}}>
            <div style={{fontSize:13,color:"#64748b",marginBottom:8}}>Postes actuellement actifs</div>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <button onClick={()=>setPostesActifs(Math.max(1,postesActifs-1))}
                style={{width:32,height:32,border:"1px solid #334155",borderRadius:8,background:"#1e293b",color:"#fff",fontSize:18,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
              <div style={{fontWeight:900,fontSize:28,color:"#fff",minWidth:40,textAlign:"center"}}>{postesActifs}</div>
              <button onClick={()=>setPostesActifs(Math.min(maxPostes,postesActifs+1))}
                style={{width:32,height:32,border:"1px solid #334155",borderRadius:8,background:"#1e293b",color:"#fff",fontSize:18,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
              <span style={{fontSize:12,color:"#64748b"}}>/ {maxPostes} max</span>
            </div>
          </div>

          {/* Postes existants */}
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {(pharmacie.postes || []).map((p, i) => (
              <div key={p.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",background:"#0f172a",borderRadius:8,opacity:i<postesActifs?1:0.4}}>
                <div style={{width:8,height:8,borderRadius:4,background:i<postesActifs?"#10b981":"#334155",flexShrink:0}}/>
                <span style={{fontSize:13,color:i<postesActifs?"#fff":"#64748b",flex:1}}>{p.nom}</span>
                <span style={{fontSize:10,fontWeight:700,color:i<postesActifs?"#10b981":"#475569"}}>{i<postesActifs?"ACTIF":"INACTIF"}</span>
              </div>
            ))}
            {(pharmacie.postes||[]).length === 0 && (
              <div style={{fontSize:12,color:"#475569",textAlign:"center",padding:12}}>Aucun poste configuré</div>
            )}
          </div>
        </div>
      </div>

      {/* Récapitulatif + delta */}
      <div style={{marginTop:20,padding:"14px 18px",background:"#0f172a",borderRadius:10,border:"1px solid #334155"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:12,color:"#64748b",marginBottom:2}}>Nouveau contrat</div>
            <div style={{fontWeight:900,fontSize:18,color:"#fff"}}>{currentPlan?.label} — {prix} €/mois · {postesActifs} poste{postesActifs>1?"s":""}</div>
          </div>
          {delta !== 0 && (
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:11,color:"#64748b",marginBottom:2}}>Variation</div>
              <div style={{fontWeight:800,fontSize:16,color:delta>0?"#10b981":"#ef4444"}}>
                {delta>0?"+":""}{delta} €/mois
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Message + bouton */}
      {msg && (
        <div style={{marginTop:12,padding:"10px 14px",background:msg.startsWith("✅")?"#052e16":"#450a0a",border:`1px solid ${msg.startsWith("✅")?"#166534":"#7f1d1d"}`,borderRadius:8,fontSize:13,color:msg.startsWith("✅")?"#86efac":"#fca5a5"}} onClick={onClearMsg}>
          {msg}
        </div>
      )}
      <button onClick={()=>onSave(pharmacie.id, plan, postesActifs)} disabled={saving}
        style={{width:"100%",marginTop:16,padding:"13px",border:"none",borderRadius:10,background:saving?"#1e3a5f":"#3b82f6",color:"#fff",fontWeight:800,fontSize:15,cursor:saving?"not-allowed":"pointer",fontFamily:"inherit"}}>
        {saving ? "Enregistrement…" : "✅ Valider le contrat"}
      </button>
    </div>
  );
}


// ─── Root App ─────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
// PAGE RÉINITIALISATION MOT DE PASSE
// Supabase redirige ici avec #access_token=...&type=recovery dans l'URL
// ═══════════════════════════════════════════════════════════════════════════════
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


export default function App() {
  const hashParams  = new URLSearchParams(window.location.hash.replace("#",""));
  const urlParams   = new URLSearchParams(window.location.search);
  const hashType    = hashParams.get("type");
  const hashToken   = hashParams.get("access_token");
  const isRecovery  = hashType === "recovery" && !!hashToken;
  const patientParam = urlParams.get("patient");
  // En mode démo, chercher dans le mock ; en prod, charger depuis Supabase async
  const demoInitialPharmacie = patientParam ? DB.pharmacies.find(p => p.id === patientParam) : null;
  const initialRoute = isRecovery ? "reset-password" : (patientParam ? "patient" : "landing");
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
    // Mode prod : charger depuis Supabase
    fetchPharmacie(patientParam).then(ph => {
      if (!ph) { setRoute("landing"); return; }
      setPatientPharmacieQR(ph);
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
      {(route==="dashboard"||route==="admin")&&<AppLogin onBack={()=>setRoute("landing")} onLogout={()=>setRoute("landing")} onGoToPricing={()=>setRoute("pricing")}/>}
    </>
  );
}
