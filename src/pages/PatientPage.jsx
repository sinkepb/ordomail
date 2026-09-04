// @version 16/07/2026 14:23 — swipe-natural
// @ordomail-deploy 15/07/2026 02:22
import { useState, useEffect, useRef } from "react";
import { getSupabaseAnon, isDemoMode, ecouterAppels, addOrdonnance, subscribeToOffres } from "../supabase.js";
import { extractFromFile } from "../lib/ocr.js";
import { Input } from "../components/ui.jsx";
import { maskId, maskCode } from "../lib/utils.js";

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

// Génère le code email (même algo que sessionCode)
// Code à 3 chiffres + 1 lettre (insérée à une position aléatoire) utilisé dans
// l'adresse email dynamique (pharmacie-24K7@in.ordomail.fr) — doit être généré
// côté client car il est intégré à l'adresse AVANT tout appel serveur.
// ⚠️ Avant le 24/07/2026, ce code était dérivé de l'heure système (minutes/secondes),
// donc prévisible par quiconque lisait le code source — remplacé par un tirage
// cryptographique. La lettre insérée (25/07/2026) élargit l'espace de valeurs
// (900 → 23 400 combinaisons) sans changer le principe : le format reste une
// contrainte partagée avec le parsing regex côté send-email/receive-email
// (voir ces fichiers si ce format doit encore évoluer).
// Hissée au niveau module (28/07/2026) : PatientStories en a aussi besoin pour
// afficher les instructions email dans la feuille "Ajouter une ordonnance" sans
// jamais régénérer le code du patient déjà en cours.
function generateCode() {
  const arr = new Uint32Array(3);
  crypto.getRandomValues(arr);
  const digits = String(100 + (arr[0] % 900)).padStart(3, "0");
  const letter = String.fromCharCode(65 + (arr[1] % 26)); // A-Z
  const pos = arr[2] % 4; // position d'insertion parmi les 4 caractères finaux
  return digits.slice(0, pos) + letter + digits.slice(pos);
}

// Construit l'adresse email avec le code patient intégré
// Format : base@domain → base-247@domain
// Ex : ph1@in.ordomail.fr → ph1-247@in.ordomail.fr
function buildEmailAvecCode(baseEmail, code) {
  const [local, domain] = baseEmail.split("@");
  return `${local}-${code}@${domain}`;
}

function PatientStories({ pharmacie, nom, onRestart, codePatient, emailMode = false }) {
  const [current, setCurrent] = useState(0);
  const [progress, setProgress] = useState(0);
  const [quizAnswer, setQuizAnswer] = useState(null);
  const [appele, setAppele]         = useState(false);

  useEffect(() => {
    console.log("[SONNETTE] écoute code:", maskCode(codePatient), "pharmacie:", maskId(pharmacie?.id));
    if (!pharmacie?.id || !codePatient) return;
    const unsub = ecouterAppels(pharmacie.id, codePatient, () => {
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
      } catch { /* AudioContext indisponible/bloqué — le bip est un bonus, pas bloquant */ }
      setAppele(true);
      setTimeout(() => setAppele(false), 8000);
    });
    return unsub;
  }, [pharmacie?.id, codePatient]);

  // Suivi métrique des stories — consultation (temps passé) et actions (réponse
  // quiz, intérêt offre). Écriture anonyme, même modèle d'accès que offre_interets
  // (voir migrations/20260725_story_metrics.sql) : pas d'attente de résultat côté
  // patient, un échec ne doit jamais bloquer la navigation dans les stories.
  async function logStoryEvent(story, event, extra = {}) {
    if (!story || isDemoMode) return; // pas de bruit en démo
    const sb = getSupabaseAnon();
    if (!sb) return;
    try {
      await sb.from('story_metrics').insert({
        pharmacie_id: pharmacie?.id,
        code_patient: codePatient,
        story_id:     String(story.id),
        story_type:   story.type,
        event,
        ...extra,
      });
    } catch(e) {
      console.warn('[story_metrics]', e.message);
    }
  }

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

    // Mode prod : edge function toggle-interet (clé de service, bypass RLS).
    // ⚠️ Ne PAS écrire directement en clé anon ici (upsert/update/delete) : Postgres
    // exige une visibilité SELECT pour un INSERT ... ON CONFLICT DO UPDATE, et un
    // simple UPDATE filtré échoue aussi SILENCIEUSEMENT pour anon sur cette table
    // (200/204 renvoyé, 0 ligne réellement modifiée — confirmé en direct le
    // 27/07/2026, cause exacte non élucidée malgré policies/grants corrects).
    // offre_interets n'a volontairement aucune policy SELECT pour anon (le patient
    // n'est jamais authentifié et ne doit pas pouvoir lire les intérêts des autres
    // patients) — la clé de service contourne le problème sans avoir à l'exposer.
    if (!codePatient) return;
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const res = await fetch(`${supabaseUrl}/functions/v1/toggle-interet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` },
        body: JSON.stringify({
          pharmacieId: pharmacie?.id,
          codePatient,
          offreId,
          offreTitre: story.title,
          offreEmoji: story.emoji || '🎁',
          offreType:  story.offreType || 'promo',
          actif:      isOn,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `toggle-interet : erreur ${res.status}`);
      }
      logStoryEvent(story, 'offer_interest', { meta: { isOn } });
    } catch(e) {
      // L'écriture a échoué côté serveur — annuler la mise à jour optimiste
      // pour ne pas laisser croire au patient que son intérêt a été pris en
      // compte alors que rien n'a été enregistré.
      console.error('[toggleInteret]', e.message);
      setInterets(prev => ({ ...prev, [offreId]: !isOn }));
    }
  } // index réponse choisie

  // ─── Ajouter une ordonnance au fil déjà ouvert (28/07/2026) ────────────────
  // Avant ce correctif, la seule façon d'envoyer une ordonnance supplémentaire
  // était le bouton "Envoyer une autre ordonnance" en fin de stories, qui
  // appelait onRestart() → régénérait un NOUVEAU code_patient. Côté vendeur, ça
  // créait un second groupe au lieu d'alimenter le fil déjà ouvert. Ici on
  // réutilise toujours le même `codePatient` (jamais de régénération) : le
  // backend (submit-ordonnance) accepte déjà n'importe quel session_code fourni
  // par le client sans vérifier qu'il vient d'une réponse serveur précédente —
  // c'est une étiquette, pas un jeton d'auth — donc le réutiliser ne change pas
  // le modèle de confiance existant.
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [addStep, setAddStep]           = useState('choice'); // choice | email | sending | success | error
  const [addError, setAddError]         = useState('');
  const [emailCopied, setEmailCopied]   = useState(false);
  const addFileInputRef = useRef();

  function openAddSheet() {
    setAddStep('choice');
    setAddError('');
    setAddSheetOpen(true);
    logStoryEvent({ id: 'add-ordonnance', type: 'action' }, 'add_ordonnance_open');
  }
  function closeAddSheet() {
    setAddSheetOpen(false);
  }

  async function handleAddFiles(selectedFiles) {
    const arr = Array.from(selectedFiles || []);
    if (arr.length === 0) return;
    setAddStep('sending');
    logStoryEvent({ id: 'add-ordonnance', type: 'action' }, 'add_ordonnance_photo_start', { meta: { count: arr.length } });

    async function readAsDataUrl(file) {
      return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = e => resolve(e.target.result);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
    }

    async function sendOne(file) {
      const dataUrl   = await readAsDataUrl(file);
      const base64    = dataUrl.split(",")[1] || "";
      const extracted = await extractFromFile(base64, file.type, { fallbackName: nom || null });
      const ext       = file.name.split(".").pop().toLowerCase();

      if (isDemoMode) {
        addOrdonnance(pharmacie.id, {
          id: `qr-${Date.now()}-${Math.random()}`, fromName: (nom || "Patient").toUpperCase(),
          subject: "Ordonnance ajoutée depuis les stories", receivedAt: new Date(),
          status: "nouveau", source: "qrcode",
          code_patient: codePatient,
          attachments: [{ name: file.name, type: ext === "pdf" ? "pdf" : "image",
            size: `${(file.size/1024).toFixed(0)} Ko`, dataUrl }],
          extracted: extracted || { nom: (nom || "Patient").toUpperCase() },
        });
        return;
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const formData = new FormData();
      formData.append("pharmacie_id", pharmacie.id);
      formData.append("qr_token", pharmacie.qr_token || "");
      formData.append("from_name",    (nom || "Patient").toUpperCase());
      formData.append("patient_nom",  extracted?.nom || (nom || "Patient").toUpperCase());
      formData.append("patient_cv",   "");
      formData.append("medecin",      "");
      formData.append("medicaments",  JSON.stringify([]));
      formData.append("file",         file, file.name);
      // Toujours le code déjà ouvert — jamais un nouveau, voir commentaire ci-dessus
      formData.append("session_code", codePatient);

      const res = await fetch(`${supabaseUrl}/functions/v1/submit-ordonnance`, {
        method: "POST", body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Erreur ${res.status}`);
      }
    }

    try {
      const results = await Promise.allSettled(arr.map(sendOne));
      const failed  = results.filter(r => r.status === 'rejected');
      if (failed.length === arr.length) {
        throw new Error(failed[0].reason?.message || 'Erreur envoi');
      }
      setAddStep('success');
      logStoryEvent({ id: 'add-ordonnance', type: 'action' }, 'add_ordonnance_photo_success', { meta: { count: arr.length - failed.length } });
      setTimeout(() => setAddSheetOpen(false), 1800);
    } catch(e) {
      console.error('[addOrdonnance]', e.message);
      setAddError(e.message || 'Erreur lors de l\'envoi');
      setAddStep('error');
    }
  }

  function openAddEmail() {
    setAddStep('email');
    logStoryEvent({ id: 'add-ordonnance', type: 'action' }, 'add_ordonnance_email_view');
  }

  function handleCopyAddEmail() {
    const baseEmail = pharmacie?.email_reception || pharmacie?.emailReception || `${pharmacie?.id}@in.ordomail.fr`;
    const emailAvecCode = buildEmailAvecCode(baseEmail, codePatient);
    const doCopy = () => { setEmailCopied(true); setTimeout(() => setEmailCopied(false), 2500); };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(emailAvecCode).then(doCopy).catch(() => {
        const el = document.createElement("textarea");
        el.value = emailAvecCode; document.body.appendChild(el);
        el.select(); document.execCommand("copy"); document.body.removeChild(el); doCopy();
      });
    } else {
      const el = document.createElement("textarea");
      el.value = emailAvecCode; document.body.appendChild(el);
      el.select(); document.execCommand("copy"); document.body.removeChild(el); doCopy();
    }
  }

  const [touchStart, setTouchStart] = useState(null);
  const timerRef = useRef(null);
  const DURATION = 6000;
  // Story email spéciale — injectée en premier si le patient a envoyé par email
  // En emailMode : remplace la story "Ordonnance reçue" (id:1) par les instructions
  const emailStory = emailMode ? [{
    id: "email-instructions",
    type: "email-instructions",
    bg: ["#1a3a6e", "#1e40af"],
    emoji: "✉️",
    title: "Envoyez votre ordonnance",
    codePatient,
  }] : [];
  const baseStories = emailMode
    ? HEALTH_STORIES.filter(s => s.id !== 1)  // supprimer "Ordonnance reçue" en mode email
    : HEALTH_STORIES;
  // Stories (contenu santé, offres, quiz) réservées au plan Pro (voir
  // pricing sur la landing page : "Offres & promotions patient — Plan Pro").
  // Starter/Standard ne voient que la toute première page (confirmation de
  // dépôt ou instructions email) — jamais le reste du diaporama.
  const isProPlan = pharmacie?.plan === "pro";
  const [allStories, setAllStories] = useState(
    isProPlan ? [...emailStory, ...baseStories] : [...emailStory, ...baseStories].slice(0, 1)
  );
  const [interets, setInterets]     = useState({});
  const [appel, setAppel]           = useState(null); // { offre_id: true/false }
  const [commande, setCommande]     = useState({}); // { offreId: quantite } — "Ajouter à la commande" (Click & Collect, PAS un paiement)
  const [commandeBusy, setCommandeBusy] = useState(null); // offreId en cours d'envoi

  // Offres mobile (03/09/2026) — une offre publiée depuis le téléphone d'un
  // vendeur (ou marquée en rupture) doit apparaître/se mettre à jour ici sans
  // que le patient recharge sa page. Pas de refetch complet : on modifie
  // seulement l'entrée concernée dans allStories.
  useEffect(() => {
    if (!isProPlan || isDemoMode || !pharmacie?.id) return;
    return subscribeToOffres(pharmacie.id, ({ eventType, new: row, old }) => {
      if (eventType === "INSERT") {
        if (!row.actif || row.epuise) return;
        const storyId = `offre-${row.id}`;
        setAllStories(prev => {
          if (prev.some(s => s.id === storyId)) return prev;
          const next = [...prev];
          const insertAt = Math.min(1, next.length);
          next.splice(insertAt, 0, {
            id: storyId, offreId: row.id, offreType: row.type || "promo",
            emoji: row.emoji || "🎁", bg: [row.couleur || "#1a3a6e", (row.couleur || "#1a3a6e") + "99"],
            title: row.titre, text: row.description || "", image: row.image_url || null,
            type: "offre", badge: row.badge || null, lienUrl: row.lien_url || null,
            prix: row.prix != null ? Number(row.prix) : null, epuise: false,
          });
          return next;
        });
      } else if (eventType === "UPDATE") {
        const storyId = `offre-${row.id}`;
        setAllStories(prev => prev.map(s => s.id === storyId ? { ...s, epuise: !!row.epuise } : s));
      } else if (eventType === "DELETE") {
        const storyId = `offre-${old.id}`;
        setAllStories(prev => prev.filter(s => s.id !== storyId));
      }
    });
  }, [isProPlan, pharmacie?.id]);

  // "Ajouter à la commande" — réservation Click & Collect, PAS un paiement (voir
  // reserver-offre : aucun Stripe, l'encaissement se fait physiquement au TPE
  // de la pharmacie). Même schéma d'appel que toggleInteret (clé anon, edge
  // function service-role).
  async function ajouterCommande(story) {
    const offreId = story.offreId ?? story.id?.toString().replace('offre-', '');
    if (!offreId || !codePatient || commandeBusy === offreId) return;
    setCommandeBusy(offreId);
    const prevQte = commande[offreId] || 0;
    setCommande(prev => ({ ...prev, [offreId]: prevQte + 1 })); // optimiste
    try {
      if (isDemoMode) { setCommandeBusy(null); return; }
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const res = await fetch(`${supabaseUrl}/functions/v1/reserver-offre`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` },
        body: JSON.stringify({ pharmacieId: pharmacie?.id, codePatient, offreId, action: 'ajouter' }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `Erreur ${res.status}`);
      setCommande(prev => ({ ...prev, [offreId]: body.quantite }));
      logStoryEvent(story, 'offer_order_add', { meta: { quantite: body.quantite } });
    } catch(e) {
      console.error('[ajouterCommande]', e.message);
      setCommande(prev => ({ ...prev, [offreId]: prevQte }));
    }
    setCommandeBusy(null);
  }

  useEffect(() => {
    const sb = getSupabaseAnon();
    // En mode email : exclure la story "Ordonnance reçue" (id:1)
    const baseStoriesForLoad = emailMode
      ? HEALTH_STORIES.filter(s => s.id !== 1)
      : HEALTH_STORIES;
    let base = [...baseStoriesForLoad];

    const capturedPharmaId = pharmacie?.id; // Capturer AVANT l'async
    async function loadDynamic() {
      // Starter/Standard : uniquement la première page (confirmation ou
      // instructions email) — pas la peine d'aller chercher contenu santé,
      // offres ou quiz, réservés au plan Pro.
      if (!isProPlan) {
        setAllStories([...emailStory, ...baseStoriesForLoad].slice(0, 1));
        return;
      }
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
        setAllStories([...emailStory, ...base]);
        return;
      }
      if (!sb) return;

      // Charger contenu santé aléatoire depuis la table stories_content
      try {
        const { data: contents } = await sb
          .from("stories_content")
          .select("*")
          .eq("actif", true);
        let eligible = contents || [];
        // Exclure les stories que CETTE pharmacie a désactivées — absence de ligne
        // de sélection = story affichée par défaut (comportement inchangé pour les
        // pharmacies qui n'ont jamais utilisé ce réglage).
        if (eligible.length > 0 && capturedPharmaId) {
          try {
            const { data: selections } = await sb
              .from("pharmacie_stories_selection")
              .select("story_id, actif")
              .eq("pharmacie_id", capturedPharmaId)
              .eq("actif", false);
            const disabled = new Set((selections || []).map(s => s.story_id));
            if (disabled.size > 0) eligible = eligible.filter(s => !disabled.has(s.id));
          } catch(e) {
            console.warn("[pharmacie_stories_selection] Erreur:", e.message, "→ pas de filtrage");
          }
        }
        if (eligible.length > 0) {
          // Mélanger et prendre 3 max
          const shuffled = eligible.sort(() => Math.random() - 0.5).slice(0, 3);
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
            image: s.image_url || null,
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
      console.log("[PatientStories] chargement offres, pharmacie.id:", maskId(capturedPharmaId));
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
            ? allOffres.filter(o => (o.actif === true || o.actif === "true" || o.actif === 1) && !o.epuise)
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
                image: o.image_url || null,
                type: "offre",
                badge: o.badge || null,
                lienUrl: o.lien_url || null,
                prix: o.prix != null ? Number(o.prix) : null,
                epuise: false,
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

      console.log("[PatientStories] ✅ stories:", base.length, "types:", base.map(s=>s.type).join(", "), "pharmacie:", maskId(pharmacie?.id), "demo:", isDemoMode);
      setAllStories([...emailStory, ...base]);
    }

    loadDynamic();
  }, [pharmacie?.id, pharmacie?.plan, isDemoMode]);

  const story = allStories[current];
  const isQuiz = story?.type === "quiz";
  const isOffre = story?.type === "offre";

  // Avancer automatiquement sauf si quiz en cours
  useEffect(() => {
    setProgress(0);
    setQuizAnswer(null);
    if (isQuiz) return; // Pause sur le quiz
    if (!isProPlan) return; // Starter/Standard : page de confirmation statique, pas d'avance auto

    const start = Date.now();
    // Bloquer le timer sur la story email-instructions
    const isEmailStory = allStories[current]?.type === "email-instructions";

    timerRef.current = setInterval(() => {
      if (isEmailStory) return; // pause : ne pas avancer
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

  // Suivi du temps passé sur chaque story — la story vue est celle affichée au
  // moment où l'effet se déclenche ; le nettoyage (changement de story ou
  // démontage du composant en fin de visite) donne la durée réelle passée dessus.
  useEffect(() => {
    const viewedStory = allStories[current];
    const viewStart = Date.now();
    return () => {
      logStoryEvent(viewedStory, 'view', { duree_ms: Date.now() - viewStart });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  // Reprendre après réponse quiz
  useEffect(() => {
    if (!isQuiz || quizAnswer === null) return;
    const t = setTimeout(() => goNext(), 3000);
    return () => clearTimeout(t);
  }, [quizAnswer]);

  function goNext() {
    // Ne pas avancer depuis la story email-instructions
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
  // @fix 04/09/2026 — pour une offre "photo + prix" (mobile-offre), la photo
  // EST le contenu (voir la mission "zéro design") : le fond dégradé dd/multiply
  // ci-dessous (conçu pour les stories santé — image décorative derrière du
  // texte) tintait le produit à 87% d'opacité, le rendant méconnaissable. Un
  // voile uniforme bien plus léger garde la photo reconnaissable — pas de
  // dégradé position-dépendant : le contenu (badge/prix/bouton) est CENTRÉ
  // verticalement (justifyContent:"center" plus bas), pas ancré en bas, donc
  // un voile qui ne s'assombrit qu'en bas de l'écran manquerait le texte.
  const isOffrePhoto = story.type === "offre" && !!story.image;

  return (
    <div
      onTouchStart={isProPlan ? handleTouchStart : undefined}
      onTouchEnd={isProPlan ? handleTouchEnd : undefined}
      style={{
        minHeight: "100vh", width: "100%",
        background: story.image
          ? (isOffrePhoto
              ? `linear-gradient(160deg, ${r1}40 0%, ${r2}40 100%), url(${story.image}) center/cover`
              : `linear-gradient(160deg, ${r1}dd 0%, ${r2}dd 100%), url(${story.image}) center/cover`)
          : `linear-gradient(160deg, ${r1} 0%, ${r2} 100%)`,
        backgroundBlendMode: story.image ? "multiply" : "normal",
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

      {/* Barres de progression — masquées sur Starter/Standard : une seule
          page (la confirmation), rien vers quoi progresser. */}
      {isProPlan && (
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
      )}

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

        {/* Story instructions email */}
        {story.type === "email-instructions" && (
          <div style={{ width:"100%", maxWidth:300, textAlign:"center" }}>
            {/* Code en grand */}
            <div style={{ background:"rgba(255,255,255,0.15)", borderRadius:16, padding:"18px 24px", marginBottom:20, backdropFilter:"blur(8px)", border:"1.5px solid rgba(255,255,255,0.3)" }}>
              <div style={{ fontSize:11, fontWeight:700, color:"rgba(255,255,255,0.7)", textTransform:"uppercase", letterSpacing:2, marginBottom:6 }}>
                Votre code personnel
              </div>
              <div style={{ fontSize:64, fontWeight:900, color:"#fff", fontFamily:"monospace", letterSpacing:12, lineHeight:1 }}>
                {story.codePatient}
              </div>
              <div style={{ fontSize:12, color:"rgba(255,255,255,0.8)", marginTop:8 }}>
                Montrez ce code au comptoir
              </div>
            </div>
            {/* Instructions */}
            <div style={{ textAlign:"left" }}>
              {[
                ["1️⃣", "Ouvrez votre boite mail"],
                ["2️⃣", "Envoyez votre ordonnance en pièce jointe à l'adresse copiée"],
                ["3️⃣", "Revenez ici et attendez — nous vous appelons quand c'est prêt"],
              ].map(([num, txt]) => (
                <div key={num} style={{ display:"flex", gap:10, marginBottom:12, alignItems:"flex-start" }}>
                  <span style={{ fontSize:18, flexShrink:0 }}>{num}</span>
                  <span style={{ fontSize:14, color:"rgba(255,255,255,0.9)", lineHeight:1.5 }}>{txt}</span>
                </div>
              ))}
            </div>

            <div style={{ marginTop:16, fontSize:12, color:"rgba(255,255,255,0.5)", textAlign:"center" }}>
              Glissez vers la droite après envoi →
            </div>
          </div>
        )}

        {/* Story offre pharmacie */}
        {story.type === "offre" && (() => {
          const offreId = story.id?.toString().replace("offre-", "");
          const isOn    = !!interets[offreId];
          const qte = commande[offreId] || 0;
          return (
            <div style={{ width:"100%", maxWidth:300 }}>
              {story.epuise && (
                <div style={{ display:"inline-flex", alignItems:"center", gap:6, background:"rgba(220,38,38,0.9)", borderRadius:24, padding:"4px 14px", fontSize:13, fontWeight:800, color:"#fff", marginBottom:14 }}>
                  🚫 Produit en rupture
                </div>
              )}
              {story.badge && (
                <div style={{ display:"inline-block", background:"rgba(255,255,255,0.25)", borderRadius:24, padding:"4px 16px", fontSize:18, fontWeight:900, color:"#fff", marginBottom:14, border:"2px solid rgba(255,255,255,0.4)" }}>
                  {story.badge}
                </div>
              )}
              <div style={{ fontSize:15, color:"rgba(255,255,255,0.9)", lineHeight:1.7, maxWidth:280, marginBottom:20 }}>{story.text}</div>
              {story.prix != null && (
                <div style={{ fontSize:26, fontWeight:900, color:"#fff", marginBottom:16 }}>{story.prix} €</div>
              )}

              {/* "Ajouter à la commande" — réservation Click & Collect (pas un
                  paiement, voir ajouterCommande) : uniquement pour les offres
                  avec un prix, et jamais en rupture. */}
              {story.prix != null && !story.epuise && codePatient && (
                <button
                  onClick={(e) => { e.stopPropagation(); ajouterCommande(story); }}
                  disabled={commandeBusy === offreId}
                  style={{
                    width:"100%", boxSizing:"border-box", padding:"14px 20px", marginBottom:10,
                    border:"none", borderRadius:16, cursor: commandeBusy===offreId ? "default" : "pointer", fontFamily:"inherit",
                    background: qte>0 ? "#22c55e" : "#fff",
                    color: qte>0 ? "#052e16" : "#1a1a1a", fontWeight:800, fontSize:16,
                    display:"flex", alignItems:"center", justifyContent:"center", gap:10,
                    opacity: commandeBusy===offreId ? 0.7 : 1,
                  }}>
                  {qte>0 ? `🛒 Ajouté (${qte}) — encaissement au comptoir` : "🛒 Ajouter à la commande"}
                </button>
              )}

              {story.offreType === "avis_google" ? (
                // Offre "Avis Google" : ouvre directement le lien renseigné par le
                // pharmacien, pas de toggle "intéressé" (n'a pas de sens ici).
                story.lienUrl && (
                  <a
                    href={story.lienUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => { e.stopPropagation(); logStoryEvent(story, "offer_interest", { meta: { isOn: true } }); }}
                    style={{
                      width:"100%", boxSizing:"border-box", padding:"14px 20px",
                      border:"2px solid rgba(255,255,255,0.5)",
                      borderRadius:16, cursor:"pointer", fontFamily:"inherit",
                      background:"rgba(255,255,255,0.15)", textDecoration:"none",
                      color:"#fff", fontWeight:800, fontSize:16,
                      display:"flex", alignItems:"center", justifyContent:"center", gap:10,
                    }}>
                    ⭐ Laisser un avis Google
                  </a>
                )
              ) : (
                /* Bouton toggle intérêt */
                codePatient && (
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
                )
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
                    onClick={e => {
                      e.stopPropagation();
                      if (quizAnswer === null) {
                        setQuizAnswer(idx);
                        logStoryEvent(story, 'quiz_answer', { meta: { answerIndex: idx, correct: !!ans.correct } });
                      }
                    }}
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

      {/* Indicateur swipe — masqué sur Starter/Standard, rien vers quoi swiper */}
      {isProPlan && quizAnswer === null && !isQuiz && (
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

      {/* Bouton flottant persistant — ajouter une ordonnance au fil déjà ouvert
          (contrairement au bouton de fin de stories ci-dessous, qui redémarre
          tout avec un nouveau code : celui-ci alimente le fil en cours).
          En bas d'écran, mais affiché seulement à partir de la 2e story
          (current > 0) : la toute première story est soit "Ordonnance reçue !"
          soit, en mode email, "email-instructions" — celle-ci a un contenu
          plus long qui va jusqu'en bas de l'écran et chevauchait ce bouton
          quand il était affiché dès la 1ère story (constaté en test le
          28/07/2026). À partir de la 2e story, l'espace en bas est toujours
          libre. */}
      {codePatient && !addSheetOpen && current > 0 && (
        <button
          onClick={(e) => { e.stopPropagation(); openAddSheet(); }}
          style={{
            position: "absolute", right: 16, bottom: 96, zIndex: 25,
            display: "flex", alignItems: "center", gap: 8,
            padding: "12px 18px", borderRadius: 28, border: "1.5px solid rgba(255,255,255,0.35)",
            background: "rgba(0,0,0,0.55)", backdropFilter: "blur(10px)",
            color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit",
            boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
          }}>
          <span style={{ fontSize: 18 }}>＋</span> Ajouter une ordonnance
        </button>
      )}

      {/* Feuille "Ajouter une ordonnance" — overlay + carte bas d'écran */}
      {addSheetOpen && (
        <div
          onClick={(e) => { e.stopPropagation(); if (addStep !== 'sending') closeAddSheet(); }}
          style={{
            position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 60,
            background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-end",
          }}>
          <div
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
            style={{
              width: "100%", background: "#1a2340", borderRadius: "22px 22px 0 0",
              padding: "20px 22px 28px", boxShadow: "0 -8px 30px rgba(0,0,0,0.4)",
            }}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.25)", margin: "0 auto 18px" }} />

            {addStep === 'choice' && (
              <>
                <div style={{ fontSize: 17, fontWeight: 800, color: "#fff", marginBottom: 4, textAlign: "center" }}>
                  Ajouter une ordonnance
                </div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginBottom: 20, textAlign: "center" }}>
                  Elle sera rattachée à votre code {codePatient}
                </div>
                <button onClick={() => addFileInputRef.current?.click()} style={{
                  width: "100%", padding: "15px 18px", marginBottom: 10, borderRadius: 16,
                  border: "1.5px solid rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.1)",
                  color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "inherit",
                  display: "flex", alignItems: "center", gap: 10,
                }}>
                  📤 Prendre une photo / choisir un fichier
                </button>
                <input ref={addFileInputRef} type="file" accept="image/*,.pdf" multiple
                  style={{ display: "none" }}
                  onChange={(e) => { handleAddFiles(e.target.files); e.target.value = ''; }} />
                <button onClick={openAddEmail} style={{
                  width: "100%", padding: "15px 18px", marginBottom: 14, borderRadius: 16,
                  border: "1.5px solid rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.1)",
                  color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "inherit",
                  display: "flex", alignItems: "center", gap: 10,
                }}>
                  ✉️ Envoyer par email
                </button>
                <button onClick={closeAddSheet} style={{
                  width: "100%", padding: "12px", borderRadius: 14, border: "none",
                  background: "transparent", color: "rgba(255,255,255,0.5)", fontWeight: 600,
                  fontSize: 14, cursor: "pointer", fontFamily: "inherit",
                }}>
                  Annuler
                </button>
              </>
            )}

            {addStep === 'email' && (
              <>
                <div style={{ fontSize: 17, fontWeight: 800, color: "#fff", marginBottom: 16, textAlign: "center" }}>
                  Envoyer par email
                </div>
                <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: 14, padding: "14px 18px", marginBottom: 16 }}>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
                    Adresse à utiliser
                  </div>
                  <div style={{ fontSize: 14, color: "#fff", fontFamily: "monospace", wordBreak: "break-all" }}>
                    {buildEmailAvecCode(pharmacie?.email_reception || pharmacie?.emailReception || `${pharmacie?.id}@in.ordomail.fr`, codePatient)}
                  </div>
                </div>
                <button onClick={handleCopyAddEmail} style={{
                  width: "100%", padding: "15px 18px", marginBottom: 10, borderRadius: 16, border: "none",
                  background: emailCopied ? "#22c55e" : "#fff", color: emailCopied ? "#fff" : "#1a2340",
                  fontWeight: 800, fontSize: 15, cursor: "pointer", fontFamily: "inherit",
                }}>
                  {emailCopied ? "✅ Adresse copiée" : "📋 Copier l'adresse"}
                </button>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", textAlign: "center", marginBottom: 14, lineHeight: 1.5 }}>
                  Joignez votre ordonnance en pièce jointe et envoyez — elle sera automatiquement rattachée à votre dépôt en cours.
                </div>
                <button onClick={() => setAddStep('choice')} style={{
                  width: "100%", padding: "12px", borderRadius: 14, border: "none",
                  background: "transparent", color: "rgba(255,255,255,0.5)", fontWeight: 600,
                  fontSize: 14, cursor: "pointer", fontFamily: "inherit",
                }}>
                  ← Retour
                </button>
              </>
            )}

            {addStep === 'sending' && (
              <div style={{ padding: "24px 0", textAlign: "center" }}>
                <div style={{ fontSize: 40, marginBottom: 12, animation: "spin 1s linear infinite" }}>📤</div>
                <div style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>Ajout en cours…</div>
              </div>
            )}

            {addStep === 'success' && (
              <div style={{ padding: "24px 0", textAlign: "center" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
                <div style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>Ordonnance ajoutée</div>
              </div>
            )}

            {addStep === 'error' && (
              <div style={{ padding: "10px 0", textAlign: "center" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
                <div style={{ color: "#fff", fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Échec de l'envoi</div>
                <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, marginBottom: 18 }}>{addError}</div>
                <button onClick={() => setAddStep('choice')} style={{
                  width: "100%", padding: "13px", borderRadius: 14, border: "none",
                  background: "#fff", color: "#1a2340", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit",
                }}>
                  Réessayer
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Starter/Standard : pas de minuteur (progress reste à 0), le bouton
          doit donc apparaître directement plutôt qu'attendre progress>80. */}
      {current === allStories.length - 1 && (progress > 80 || !isProPlan) && (
        <div style={{ padding: "0 24px 32px", zIndex: 10 }}>
          <button onClick={onRestart}
            style={{ width: "100%", padding: "14px", border: "none", borderRadius: 14, background: "rgba(255,255,255,0.2)", color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}>
            Terminer et repartir de zéro
          </button>
        </div>
      )}
    </div>
  );
}

function PatientPage({ pharmacie, onBack }) {
  const [step, setStep]           = useState("form");
  const [emailCode, setEmailCode] = useState(null); // code généré pour envoi email

  // Générer le code email dès le montage de PatientPage — generateCode() (déclarée
  // plus bas, hissée dans la portée du composant) tire le code cryptographiquement,
  // voir son commentaire pour le contexte.
  useEffect(() => {
    setEmailCode(generateCode());
  }, []);
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
    // emailCode est déjà généré au montage — utiliser directement
    const code = emailCode || generateCode();

    // Construire l'email avec code intégré
    const emailAvecCode = buildEmailAvecCode(emailReception, code);

    const doCopy = () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      // Lancer les stories après copie (délai court pour feedback visuel)
      setTimeout(() => setStep("email-wait"), 800);
    };

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(emailAvecCode).then(doCopy).catch(() => {
        const el = document.createElement("textarea");
        el.value = emailAvecCode; document.body.appendChild(el);
        el.select(); document.execCommand("copy"); document.body.removeChild(el); doCopy();
      });
    } else {
      const el = document.createElement("textarea");
      el.value = emailAvecCode; document.body.appendChild(el);
      el.select(); document.execCommand("copy"); document.body.removeChild(el); doCopy();
    }
  }

  async function handleSubmit() {
    if (!nom.trim() || files.length === 0) return;
    setSending(true);
    setStep("uploading");

    // Générer UN SEUL code pour toute la session d'envoi
    // (même code pour toutes les ordonnances envoyées en même temps)
    const sessionCode = generateCode();

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
      // Jeton public par pharmacie (imprimé sur le QR code) — submit-ordonnance le vérifie
      // pour empêcher qu'un pharmacie_id deviné suffise à déposer de fausses ordonnances.
      formData.append("qr_token", pharmacie.qr_token || "");
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

  // Nouveau step : patient a copié l'email, il attend sur les stories
  if (step === "email-wait") return (
    <div style={{ width:"100%", maxWidth:430, margin:"0 auto" }}>
      <PatientStories
        pharmacie={pharmacie}
        nom={nom || "Patient"}
        codePatient={emailCode}
        emailMode={true}
        onRestart={() => { setStep("form"); setEmailCode(null); setNom(""); }}
      />
    </div>
  );

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

        <div style={{ fontSize:12, fontWeight:700, color:"#888", textAlign:"center", textTransform:"uppercase", letterSpacing:0.6 }}>
          Choisissez comment l&apos;envoyer
        </div>

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

            {/* Nom — sous "Ajouter votre ordonnance", juste avant l'envoi qui en a besoin */}
            <div style={{ marginTop:10 }}>
              <Input label="Votre nom complet" value={nom} onChange={setNom} placeholder="Ex : MARTIN Pierre" icon="👤" required />
            </div>

            {/* Bouton envoyer — à l'intérieur du cadre, comme le bouton copier du bloc e-mail :
                les deux options doivent se lire comme deux cartes autonomes et symétriques. */}
            <button onClick={handleSubmit} disabled={!nom.trim() || files.length===0 || sending}
              style={{ width:"100%", padding:"15px", border:"none", borderRadius:10, background:!nom.trim()||files.length===0?`${couleur}55`:couleur, color:"#fff", fontWeight:800, fontSize:16, cursor:!nom.trim()||files.length===0?"not-allowed":"pointer", fontFamily:"inherit", boxShadow:nom.trim()&&files.length>0?`0 4px 16px ${couleur}44`:"none", marginTop:4 }}>
              {sending ? "Envoi en cours…" : files.length > 1 ? `Envoyer ${files.length} ordonnances →` : "Envoyer l'ordonnance →"}
            </button>
          </div>
        </div>

        {/* Séparateur — renforce la perception "deux options" au premier coup d'œil */}
        <div style={{ display:"flex", alignItems:"center", gap:12, color:"#bbb", fontSize:11, fontWeight:800, letterSpacing:0.6 }}>
          <div style={{ flex:1, height:1, background:"#e5e9f5" }} />
          OU
          <div style={{ flex:1, height:1, background:"#e5e9f5" }} />
        </div>

        {/* ── Bloc 2 : E-mail ── */}
        <div style={{ background:"#fff", borderRadius:14, overflow:"hidden", border:`1.5px solid ${copied?"#16a34a":"#e0eeff"}`, boxShadow:copied?"0 4px 16px #16a34a18":"0 1px 4px rgba(0,0,0,0.06)", transition:"border 0.3s" }}>
          <div style={{ padding:"14px 16px", background:"#f0f7ff", borderBottom:"1px solid #e0eeff", display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ width:32, height:32, borderRadius:8, background:"#1e40af", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, flexShrink:0 }}>✉️</div>
            <div>
              <div style={{ fontWeight:700, fontSize:14, color:"#1a1a1a" }}>Transférer par e-mail</div>
            </div>
          </div>
          <div style={{ padding:14, display:"flex", flexDirection:"column", gap:10 }}>

            {/* ── Adresse email dynamique ── */}
            <div style={{ fontSize:11, fontWeight:700, color:"#999", textTransform:"uppercase", letterSpacing:0.8 }}>
              Adresse e-mail de votre pharmacie
            </div>
            <div style={{ fontSize:12, fontWeight:700, color:"#1a1a1a", fontFamily:"monospace", background:"#f0f7ff", borderRadius:8, padding:"11px 14px", wordBreak:"break-all", lineHeight:1.6, border:"1px solid #dbeafe" }}>
              {emailCode
                ? <>{emailReception.split("@")[0]}-<span style={{color:"#1e40af",fontWeight:900}}>{emailCode}</span>@{emailReception.split("@")[1]}</>
                : emailReception}
            </div>

            {/* ── Bouton copier ── */}
            <button onClick={handleCopyEmail}
              style={{ width:"100%", padding:"14px", border:"none", borderRadius:10,
                background: copied ? "#16a34a" : "#1e40af",
                color:"#fff", fontWeight:800, fontSize:15, cursor:"pointer",
                fontFamily:"inherit", display:"flex", alignItems:"center",
                justifyContent:"center", gap:8, transition:"background 0.3s",
                boxShadow: copied ? "none" : "0 4px 14px rgba(30,64,175,0.35)" }}>
              {copied
                ? "✅ Copié ! Ouverture des stories…"
                : "📋 Copier l'adresse et continuer →"}
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

