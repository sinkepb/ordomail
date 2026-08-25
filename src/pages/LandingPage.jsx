import { useState, useEffect, useRef } from "react";

import { C, useFadeIn, PLANS } from "../lib/utils.js";

console.log("✅ MODULE CHARGÉ: pages/LandingPage.jsx");

const DEMO_ORDOS = [
  { nom: "MARTIN Pierre",    cv: "1 75 04 75 118 042 18", medecin: "Dr Bernard",  source: "email",  status: "nouveau",  mins: 3  },
  { nom: "DUBOIS Sophie",    cv: "2 82 11 75 063 014 22", medecin: "Dr Leclerc", source: "qrcode", status: "nouveau",  mins: 11 },
  { nom: "LEFEBVRE Jean",    cv: "1 60 03 75 042 118 08", medecin: "Dr Moreau",  source: "email",  status: "nouveau",  mins: 24 },
  { nom: "ROUX Anne",        cv: "2 91 03 69 215 088 45", medecin: "Dr Petit",   source: "qrcode", status: "imprime",  mins: 42 },
  { nom: "THOMAS Isabelle",  cv: "2 77 06 13 042 118 31", medecin: "Dr Gautier", source: "email",  status: "imprime",  mins: 68 },
];


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

function FeaturesSection() {
  const ref = useRef(); const visible = useFadeIn(ref);
  const features = [
    { icon: "🔍", title: "Identification en 2 secondes", desc: "Le patient dit son nom au comptoir. Le vendeur le repère instantanément dans la grille. Fini de fouiller dans Gmail.", accent: C.navy },
    { icon: "📱", title: "QR Code + Badge NFC", desc: "Le patient scanne ou approche son téléphone. Sa photo d'ordonnance arrive directement dans votre tableau de bord en moins de 5 secondes.", accent: "#7c3aed" },
    { icon: "✉️", title: "Transfert email simplifié", desc: "Si le médecin envoie l'ordonnance par email, le patient transfère d'un clic à l'adresse dédiée de la pharmacie. Zéro ressaisie.", accent: "#0369a1" },
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
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

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
            {[["monthly","Mensuel"],["annual","Annuel (1 mois offert)"]].map(([k,l])=>(
              <button key={k} onClick={()=>setBilling(k)} style={{ padding:"7px 18px", border:"none", borderRadius:8, cursor:"pointer", fontFamily:"inherit", fontSize:13, fontWeight:billing===k?700:500, background:billing===k?"#fff":"transparent", color:billing===k?C.ink:C.muted, boxShadow:billing===k?"0 1px 4px rgba(0,0,0,0.08)":"none", transition:"all 0.15s" }}>{l}</button>
            ))}
          </div>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap:14, marginBottom:24 }}>
          {PLANS.map(p=>{
            // 11 mois facturés = 12 mois de service (1 mois offert) — total exact
            // ci-dessous aligné sur le Price Stripe price_{plan}_annual réel
            // (price × 11), l'équivalent mensuel affiché est arrondi séparément
            // pour éviter un écart d'arrondi entre les deux lignes affichées.
            const annualTotal = p.price * 11;
            const price = billing==="annual" ? Math.round(annualTotal/12) : p.price;
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
                  {billing==="annual" && (
                    <>
                      <div style={{ fontSize:12, color:"#16a34a", fontWeight:600 }}>−{p.price-price}€/mois vs mensuel</div>
                      <div style={{ fontSize:12, color:C.muted, marginTop:2 }}>soit {annualTotal}€ facturés une fois par an (1 mois offert)</div>
                    </>
                  )}
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

function LandingPage({ onGoToPricing, onGoToApp, onGoToCheckout, onGoToAdmin, onGoToLegal }) {
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
      <Footer onNav={(l)=>{
        if(l==="Tarifs") onGoToPricing();
        else if(l==="backoffice") onGoToAdmin();
        else if(l==="CGU") onGoToLegal("cgu");
        else if(l==="Politique de confidentialité" || l==="RGPD") onGoToLegal("confidentialite");
        else if(l==="Mentions légales") onGoToLegal("mentions");
        else if(l==="Support") window.location.href = "mailto:contact@ordomail.fr";
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