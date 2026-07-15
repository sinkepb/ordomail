// @ordomail-deploy 15/07/2026 02:22
import { useState, useEffect, useRef } from "react";
import { getSupabaseClient, isDemoMode, fetchPharmacie, ecouterAppels, addOrdonnance } from "../supabase.js";
import { extractFromFile } from "../lib/ocr.js";
import { Input } from "../components/ui.jsx";

console.log("✅ MODULE CHARGÉ: pages/PatientPage.jsx");

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
  {
    id: 6, emoji: "🔔",
    bg: ["#1a3a6e", "#0f2347"],
    title: "Restez ici !",
    text: "Gardez cette page ouverte. Votre pharmacien vous appellera et votre téléphone vibrera quand ce sera votre tour.",
    type: "info",
  },
];

function PatientStories({ pharmacie, nom, onRestart, codePatient }) {
  const [current, setCurrent] = useState(0);
  const [progress, setProgress] = useState(0);
  const [quizAnswer, setQuizAnswer] = useState(null);
  const [appele, setAppele]         = useState(false);

  useEffect(() => {
    console.log("[SONNETTE] écoute code:", codePatient, "pharmacie:", pharmacie?.id);
    if (!pharmacie?.id || !codePatient) return;
    const unsub = ecouterAppels(pharmacie.id, codePatient, (data) => {
      if ('vibrate' in navigator) navigator.vibrate([400, 200, 400, 200, 400]);
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        [0, 0.4, 0.8].forEach(delay => {
          const osc = ctx.createOscillator(); const gain = ctx.createGain();
          osc.connect(gain); gain.connect(ctx.destination);
          osc.frequency.value = 880;
          gain.gain.setValueAtTime(0.3, ctx.currentTime + delay);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.3);
          osc.start(ctx.currentTime + delay); osc.stop(ctx.currentTime + delay + 0.3);
        });
      } catch(e) {}
      setAppele(true);
      setTimeout(() => setAppele(false), 8000);
    });
    return unsub;
  }, [pharmacie?.id, codePatient]);

  // Toggle intérêt patient pour une offre
  async function toggleInteret(story) {
    const offreId = story.id?.toString().replace('offre-', '');
    const isOn    = !interets[offreId];

    // Mise à jour locale immédiate
    setInterets(prev => ({ ...prev, [offreId]: isOn }));

    const interet = {
      id:           `int-${Date.now()}`,
      pharmacie_id: pharmacie?.id,
      code_patient: codePatient,
      offre_id:     offreId,
      offre_titre:  story.title,
      offre_emoji:  story.emoji || '🎁',
      offre_type:   story.offreType || 'promo',
      date_jour:    new Date().toISOString().split('T')[0],
      created_at:   new Date().toISOString(),
    };

    if (isDemoMode) {
      // Mode démo : stocker dans window.__ordomailDB
      if (window.__ordomailDB) {
        if (!window.__ordomailDB.offre_interets) window.__ordomailDB.offre_interets = [];
        if (isOn) {
          window.__ordomailDB.offre_interets = window.__ordomailDB.offre_interets.filter(
            i => !(i.code_patient === codePatient && i.offre_id === offreId)
          );
          window.__ordomailDB.offre_interets.push(interet);
        } else {
          window.__ordomailDB.offre_interets = window.__ordomailDB.offre_interets.filter(
            i => !(i.code_patient === codePatient && i.offre_id === offreId)
          );
        }
      }
      return;
    }

    // Mode prod : Supabase
    if (!codePatient) return;
    const sb = getSupabaseClient();
    if (!sb) return;
    if (isOn) {
      await sb.from('offre_interets').upsert({
        pharmacie_id: pharmacie?.id,
        code_patient: codePatient,
        offre_id:     offreId,
        offre_titre:  story.title,
        offre_emoji:  story.emoji || '🎁',
        offre_type:   story.offreType || 'promo',
      }, { onConflict: 'code_patient,offre_id,date_jour' });
    } else {
      await sb.from('offre_interets')
        .delete()
        .eq('code_patient', codePatient)
        .eq('offre_id', offreId)
        .eq('date_jour', new Date().toISOString().split('T')[0]);
    }
  } // index réponse choisie
  const [touchStart, setTouchStart] = useState(null);
  const timerRef = useRef(null);
  const DURATION = 6000;
  const [allStories, setAllStories] = useState(HEALTH_STORIES);
  const [interets, setInterets]     = useState({});
  const [appel, setAppel]           = useState(null); // { offre_id: true/false }

  useEffect(() => {
    const sb = getSupabaseClient();
    let base = [...HEALTH_STORIES];

    const capturedPharmaId = pharmacie?.id; // Capturer AVANT l'async
    async function loadDynamic() {
      // Mode démo : utiliser des offres fictives pour tester
      if (isDemoMode) {
        const demoOffres = [
          {
            id: "offre-demo-1", offreId: "demo-1", offreType: "promo",
            emoji: "🏷️", bg: ["#dc2626", "#b91c1c"],
            title: "-20% sur Doliprane", text: "Valable jusqu'à la fin du mois.",
            type: "offre", badge: "-20%",
          },
          {
            id: "offre-demo-2", offreId: "demo-2", offreType: "service",
            emoji: "💉", bg: ["#1a6e3a", "#15803d"],
            title: "Vaccination grippe", text: "Sans rendez-vous, tous les jours de 9h à 18h.",
            type: "offre", badge: null,
          },
        ];
        base = [base[0], ...demoOffres, ...base.slice(1)];
        setAllStories(base);
        return;
      }
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
      } catch(e) {
        console.warn("[stories_content] Erreur:", e.message, "→ utilisation stories statiques");
        // base reste HEALTH_STORIES par défaut
      }

      // Charger offres pharmacie — uniquement si pharmacie connue
      console.log("[PatientStories] chargement offres, pharmacie.id:", capturedPharmaId);
      if (capturedPharmaId) {
        try {
          // Fetch direct REST pour compatibilité maximale mobile
          const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL;
          const supabaseKey  = import.meta.env.VITE_SUPABASE_ANON_KEY;
          const url = `${supabaseUrl}/rest/v1/offres_stories?pharmacie_id=eq.${capturedPharmaId}&select=*`;
          const resp = await fetch(url, {
            headers: {
              "apikey": supabaseKey,
              "Authorization": `Bearer ${supabaseKey}`,
              "Content-Type": "application/json",
              "Accept": "application/json",
            },
          });
          const allOffres = resp.ok ? await resp.json() : [];
          console.log("[PatientStories] TOUTES offres:", allOffres?.length ?? 0, "status:", resp.status);
          if (allOffres?.length > 0) {
            console.log("[PatientStories] exemple:", JSON.stringify(allOffres[0]).slice(0, 200));
          }
          const offres = Array.isArray(allOffres)
            ? allOffres.filter(o => o.actif === true || o.actif === "true" || o.actif === 1)
            : [];
          console.log("[PatientStories] offres actives:", offres.length);

          if (offres && offres.length > 0) {
            const offreStories = offres
              .filter(o => !o.date_fin || new Date(o.date_fin) >= new Date())
              .map(o => ({
                id: `offre-${o.id}`,
                offreId: o.id,
                offreType: o.type || "promo",
                emoji: o.emoji || "🎁",
                bg: [o.couleur || "#1a3a6e", (o.couleur || "#1a3a6e") + "99"],
                title: o.titre,
                text: o.description || "",
                type: "offre",
                badge: o.badge || null,
              }));
            base.splice(1, 0, ...offreStories);
            console.log("[PatientStories] offres injectées:", offreStories.length);
          } else {
            console.log("[PatientStories] aucune offre active pour cette pharmacie");
          }
        } catch(e) {
          console.warn("[offres_stories] Erreur fetch:", e.message);
        }
      } else {
        console.log("[PatientStories] pharmacie.id inconnu — pas d'offres");
      }

      console.log("[PatientStories] ✅ stories:", base.length, "types:", base.map(s=>s.type).join(", "), "pharmacie:", pharmacie?.id, "demo:", isDemoMode);
      setAllStories(base);
    }

    loadDynamic();
  }, [pharmacie?.id, isDemoMode]);

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

      {/* ── Bandeau appel sonnette ── */}
      {appel && (
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, zIndex: 200,
          background: "linear-gradient(135deg,#1a3a6e,#0f2347)",
          padding: "18px 20px", display: "flex", alignItems: "center", gap: 14,
          boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
          animation: "slideDown 0.3s ease-out",
        }}>
          <div style={{ fontSize: 40, animation: "ring 0.4s ease-in-out 4" }}>🔔</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 19, fontWeight: 900, color: "#fff", marginBottom: 2 }}>
              {"C'est votre tour !"}
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.75)" }}>
              {appel.poste_nom || "Le pharmacien"} {"vous attend au comptoir"}
            </div>
          </div>
          <button onClick={() => setAppel(null)} style={{
            background: "rgba(255,255,255,0.2)", border: "1.5px solid rgba(255,255,255,0.4)",
            borderRadius: 10, color: "#fff", padding: "8px 16px",
            fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
          }}>
            {"J'arrive ✓"}
          </button>
        </div>
      )}
      <style>{`
        @keyframes ring { 0%,100%{transform:rotate(0)} 25%{transform:rotate(-18deg)} 75%{transform:rotate(18deg)} }
        @keyframes slideDown { from{transform:translateY(-100%);opacity:0} to{transform:translateY(0);opacity:1} }
      `}</style>

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
        {story.type === "offre" && (() => {
          const offreId = story.id?.toString().replace("offre-", "");
          const isOn    = !!interets[offreId];
          return (
            <div style={{ width:"100%", maxWidth:300 }}>
              {story.badge && (
                <div style={{ display:"inline-block", background:"rgba(255,255,255,0.25)", borderRadius:24, padding:"4px 16px", fontSize:18, fontWeight:900, color:"#fff", marginBottom:14, border:"2px solid rgba(255,255,255,0.4)" }}>
                  {story.badge}
                </div>
              )}
              <div style={{ fontSize:15, color:"rgba(255,255,255,0.9)", lineHeight:1.7, maxWidth:280, marginBottom:20 }}>{story.text}</div>

              {/* Bouton toggle intérêt */}
              {codePatient && (
                <button
                  onClick={(e) => { e.stopPropagation(); toggleInteret(story); }}
                  style={{
                    width:"100%", padding:"14px 20px",
                    border: isOn ? "2px solid #4ade80" : "2px solid rgba(255,255,255,0.5)",
                    borderRadius:16, cursor:"pointer", fontFamily:"inherit",
                    background: isOn ? "rgba(34,197,94,0.25)" : "rgba(255,255,255,0.15)",
                    color:"#fff", fontWeight:800, fontSize:16,
                    display:"flex", alignItems:"center", justifyContent:"center", gap:10,
                    transition:"all 0.2s",
                  }}>
                  {isOn ? "✅ Je suis intéressé(e)" : "✋ Je suis intéressé(e)"}
                </button>
              )}
            </div>
          );
        })()}
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
      {/* Sonnette — overlay plein ecran */}
      {appele && (
        <div style={{
          position:"absolute",top:0,left:0,right:0,bottom:0,zIndex:50,
          background:"rgba(0,0,0,0.8)",display:"flex",flexDirection:"column",
          alignItems:"center",justifyContent:"center",backdropFilter:"blur(8px)",
        }}>
          <div style={{fontSize:72,marginBottom:16}}>🔔</div>
          <div style={{fontSize:26,fontWeight:900,color:"#fff",textAlign:"center",marginBottom:8}}>
            C&apos;est votre tour !
          </div>
          <div style={{fontSize:15,color:"rgba(255,255,255,0.8)",textAlign:"center",marginBottom:28}}>
            Votre pharmacien vous appelle au comptoir
          </div>
          <button onClick={()=>setAppele(false)}
            style={{padding:"14px 32px",borderRadius:14,border:"none",
              background:"#fff",color:"#1a3a6e",fontWeight:800,fontSize:16,
              cursor:"pointer",fontFamily:"inherit"}}>
            J&apos;arrive ! 👋
          </button>
        </div>
      )}

      {/* Bandeau code patient — EN HAUT sur toutes les stories */}
      {codePatient && (
        <div style={{
          position: "absolute", top: 72, left: 0, right: 0, zIndex: 20,
          display: "flex", justifyContent: "center",
          pointerEvents: "none",
        }}>
          <div style={{
            background: "rgba(0,0,0,0.6)",
            backdropFilter: "blur(10px)",
            borderRadius: 14,
            padding: "8px 20px",
            display: "flex", alignItems: "center", gap: 12,
            border: "1.5px solid rgba(255,255,255,0.25)",
          }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase" }}>
              Votre code
            </div>
            <div style={{ fontSize: 28, fontWeight: 900, color: "#fff", fontFamily: "monospace", letterSpacing: 5, lineHeight: 1 }}>
              {codePatient}
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", maxWidth: 90, lineHeight: 1.3 }}>
              À donner au pharmacien
            </div>
          </div>
        </div>
      )}

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
  const [step, setStep]           = useState("form");
  const [nom, setNom]             = useState("");
  const [files, setFiles]         = useState([]); // plusieurs ordonnances
  const [copied, setCopied]       = useState(false);
  const [sending, setSending]     = useState(false);
  const [codePatient, setCodePatient] = useState(null);
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

    // Générer UN SEUL code pour toute la session d'envoi
    // (même code pour toutes les ordonnances envoyées en même temps)
    const sessionCode = String(100 + (new Date().getMinutes() * 9 + new Date().getSeconds()) % 900).padStart(3, "0");

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
          code_patient: sessionCode,
          attachments: [{ name: item.name, type: ext === "pdf" ? "pdf" : "image",
            size: `${(item.file.size/1024).toFixed(0)} Ko`, dataUrl: item.dataUrl }],
          extracted: extracted || { nom: nom.toUpperCase() },
        });
        return { ok: true, code_patient: sessionCode };
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
      formData.append("session_code",  sessionCode); // même code pour tous les fichiers

      const res = await fetch(`${supabaseUrl}/functions/v1/submit-ordonnance`, {
        method: "POST", body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Erreur ${res.status}`);
      }
      const data = await res.json();
      return { ...data, code_patient: data.code_patient };
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
      // Récupérer le code patient du premier résultat réussi
      const firstSuccess = results.find(r => r.status === "fulfilled")?.value;
      const code = firstSuccess?.code_patient || null;
      setCodePatient(code);
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
      codePatient={codePatient}
      onRestart={() => { setStep("form"); setFiles([]); setNom(""); setCodePatient(null); }}
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

export { PatientStories, PatientPage };
export default PatientPage;
