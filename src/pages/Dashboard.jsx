// @version 17/07/2026 13:36 — audit-logs
// @ordomail-deploy 15/07/2026 02:22
import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { hasFeature } from "../lib/plans.js";
import { timeAgo, getOrdoAccent, isSameDay, toDateKey, formatDateLabel, truncateFilename } from "../lib/utils.js";
import { extractFromFile, prewarmTesseract } from "../lib/ocr.js";
import { OrdoCard, OrdoRow, OrdoGroup } from "../components/OrdoCard.jsx";
import { OrdonnanceViewerModal } from "../components/OrdonnanceViewerModal.jsx";
import { PrintConfirmModal, TraiterConfirmModal, TraiterGroupeConfirmModal, DeleteConfirmModal } from "../components/PrintModal.jsx";
import { OffresSection } from "../components/OffresSection.jsx";
import { CompteSection } from "../components/CompteSection.jsx";
import { ParametresTab } from "../components/dashboard/ParametresTab.jsx";
import { BottomNav } from "../components/dashboard/BottomNav.jsx";
import { RappelsSection, RappelForm, RappelOrdonnanceUpload } from "../components/RappelsSection.jsx";
import { ErrorBoundary } from "../components/ErrorBoundary.jsx";
import { AideModal } from "../components/AideModal.jsx";
import {
  fetchPharmacie,
  savePharmacie,
  fetchOrdonnances,
  updateOrdoStatus,
  updateOrdoExtracted,
  uploadOrdoFile,
  createOrdonnanceManuelle,
  fetchOrdonnanceFichier,
  deleteOrdonnance,
  subscribeToPharmacy,
  addAuditLog,
  isDemoMode,
  getSupabaseClient,
  getSignedUrl,
  fetchInteretsDuJour,
  appellerPatient,
  createRappel,
  fetchRappels,
  subscribeToRappels,
  callSecureData,
} from "../supabase.js";

// PIN unique (06/09/2026) — un poste vendeur signale sa présence toutes les
// 60s tant que le dashboard reste ouvert (voir vendeur_heartbeat côté
// secure-data). Sans lien avec le mode PIN de la pharmacie côté client :
// no-op silencieux côté serveur en mode multi-PIN, pas besoin de le savoir ici.
const VENDEUR_HEARTBEAT_MS = 60_000;

// Découpe au mieux "NOM Prénom" (format des données extraites/démo, voir
// App.jsx:makeOrdos) en {nom, prenom} pour pré-remplir la popup de création
// de rappel depuis une carte d'ordonnance (04/09/2026) — le token tout en
// MAJUSCULES est pris comme nom de famille (convention française courante
// sur les ordonnances), le reste comme prénom. Meilleur effort volontaire :
// en cas de doute, tout part dans "nom" et le pharmacien corrige à la main
// plutôt que de deviner un prénom faux.
function splitNomPrenom(fullName) {
  const parts = (fullName || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { nom: "", prenom: "" };
  if (parts.length === 1) return { nom: parts[0], prenom: "" };
  const nomParts = parts.filter(p => p === p.toUpperCase() && p !== p.toLowerCase());
  if (nomParts.length > 0 && nomParts.length < parts.length) {
    return { nom: nomParts.join(" "), prenom: parts.filter(p => !nomParts.includes(p)).join(" ") };
  }
  return { nom: parts[0], prenom: parts.slice(1).join(" ") };
}

function PharmacieDashboard({ pharmacieId, onBadges, userRole = "admin", userId = "demo" }) {
  const [pharmacie, setPharmacie] = useState(null);
  const [ordonnances, setOrdonnances] = useState([]);
  const [interetsDuJour, setInteretsDuJour] = useState([]); // intérêts offres du jour
  const [dashLoading, setDashLoading] = useState(true);
  const [tab, setTab] = useState("ordonnances");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()));
  const [viewMode, setViewModeState] = useState(() => {
    try { return localStorage.getItem("ordomail_view_mode") === "list" ? "list" : "grid"; } catch { return "grid"; }
  });
  function setViewMode(mode) {
    setViewModeState(mode);
    try { localStorage.setItem("ordomail_view_mode", mode); } catch { /* stockage indisponible, tant pis */ }
  }
  const [loadingId, setLoadingId] = useState(null);
  const [printModal, setPrintModal] = useState(null);
  const [downloadConfirm, setDownloadConfirm] = useState(null);
  const [traiterConfirm, setTraiterConfirm] = useState(null);
  const [traiterGroupeConfirm, setTraiterGroupeConfirm] = useState(null);
  // Popup "voir l'ordonnance" (28/09/2026) — même OrdonnanceViewerModal que
  // les rappels, jamais de nouvel onglet. L'URL signée est résolue côté
  // serveur (fetchOrdonnanceFichier) plutôt que via getSignedUrl() ici : ce
  // dernier tourne avec la session du navigateur, sans droits Storage pour un
  // poste vendeur (pas de session Supabase Auth, voir son commentaire).
  const [viewerAtt, setViewerAtt] = useState(null);
  const [loadingViewerId, setLoadingViewerId] = useState(null);
  async function handleViewOrdo(ordo) {
    if (loadingViewerId) return;
    setLoadingViewerId(ordo.id);
    try {
      const att = await fetchOrdonnanceFichier(ordo.id);
      if (att?.signedUrl) setViewerAtt({ ...att, dataUrl: att.signedUrl });
    } finally {
      setLoadingViewerId(null);
    }
  }
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [deleteSuccess, setDeleteSuccess] = useState(false);
  const [showAide, setShowAide] = useState(false);
  const [rappelDraft, setRappelDraft] = useState(null); // {nom, prenom} | null — popup création rappel depuis une carte
  // Ajout d'une ordonnance depuis l'ordinateur avant de créer un rappel
  // "hors ordonnance" (26/09/2026, révisé le 26/09/2026 — voir RappelOrdonnanceUpload).
  const [showOrdonnanceUpload, setShowOrdonnanceUpload] = useState(false);
  const [ordonnanceUploading, setOrdonnanceUploading] = useState(false);
  const [ordonnanceUploadError, setOrdonnanceUploadError] = useState("");
  const [rappelCreating, setRappelCreating] = useState(false);
  const [rappelsATraiter, setRappelsATraiter] = useState(0); // badge sur l'onglet Rappels — somme "à traiter" + "à appeler"

  // Chargé indépendamment de l'onglet Rappels (04/09/2026, retour direct) —
  // RappelsSection ne fetch/n'appelle onCountATraiter qu'une fois montée,
  // donc jamais tant que le titulaire n'a pas déjà ouvert cet onglet une
  // première fois. Le badge de la barre du haut doit être visible dès
  // l'arrivée sur le dashboard, sans dépendre de ça — même logique que
  // "nouveaux" (ordonnances), déjà calculé indépendamment de l'onglet actif.
  // Compte "à traiter" + "à appeler" (01/10/2026, retour titulaire) — un
  // patient sans mobile en attente d'appel est tout aussi urgent qu'une
  // réponse déjà reçue à traiter, le badge global doit refléter les deux.
  async function chargerCompteRappelsATraiter(pharmacieId) {
    const [aTraiter, aAppeler] = await Promise.all([
      fetchRappels(pharmacieId, "a_traiter"),
      fetchRappels(pharmacieId, "a_appeler"),
    ]);
    return (aTraiter || []).length + (aAppeler || []).length;
  }

  useEffect(() => {
    if (!pharmacieId) return;
    chargerCompteRappelsATraiter(pharmacieId).then(setRappelsATraiter);
  }, [pharmacieId]);

  // PIN unique (06/09/2026) — signale la présence de ce poste tant que le
  // dashboard reste ouvert, pour que verify-pin sache la place libérée si
  // l'onglet est fermé sans clic sur "Déconnexion" (voir SESSION_STALE_MINUTES).
  // isDemoMode : callSecureData échouerait silencieusement de toute façon
  // (pas de backend), autant l'éviter explicitement.
  useEffect(() => {
    if (userRole !== "vendeur" || isDemoMode) return;
    const iv = setInterval(() => { callSecureData("vendeur_heartbeat", {}).catch(() => {}); }, VENDEUR_HEARTBEAT_MS);
    return () => clearInterval(iv);
  }, [userRole]);

  // Temps réel (04/09/2026, retour direct) — le patient répond depuis sa
  // propre session (resolve-rappel), jamais celle du pharmacien : sans ça, le
  // badge de la barre du haut n'était à jour qu'après un rechargement complet
  // du dashboard. Un simple re-fetch du compte à chaque événement plutôt
  // qu'un calcul incrémental — peu fréquent, et toujours exact.
  useEffect(() => {
    if (!pharmacieId) return;
    return subscribeToRappels(pharmacieId, () => {
      chargerCompteRappelsATraiter(pharmacieId).then(setRappelsATraiter);
    });
  }, [pharmacieId]);

  // Remonte les compteurs à AppLogin (05/09/2026) — les pastilles "rappels"/
  // "ordonnances" ont été déplacées dans la barre du haut (LoginPage.jsx),
  // au même niveau que le badge "Admin", donc rendues par un composant qui
  // n'a pas accès à cet état local. onBadges est le setState d'AppLogin :
  // référence stable, aucune boucle malgré sa présence en dépendance.
  // @fix 18/09/2026 — comptait toutes les ordonnances "nouveau" des 7 derniers
  // jours (fetchOrdonnances(pharmacieId, 7)), pas seulement celles du jour :
  // la pastille pouvait afficher un total qui n'avait rien à voir avec ce
  // qu'il restait réellement à traiter aujourd'hui. Filtrée sur la date du
  // jour, indépendamment de selectedDate (qui sert à parcourir le calendrier
  // dans l'onglet Ordonnances) — cette pastille doit toujours représenter
  // "aujourd'hui", même quand le titulaire consulte un autre jour.
  useEffect(() => {
    const aujourdhui = new Date();
    const nouveauxDuJour = ordonnances.filter(o => o.status === "nouveau" && isSameDay(o.receivedAt, aujourdhui)).length;
    onBadges?.({ rappels: rappelsATraiter, ordonnances: nouveauxDuJour });
  }, [rappelsATraiter, ordonnances, onBadges]);
  const [filterStatus, setFilterStatus] = useState("nouveau");
  const [showCalendar, setShowCalendar] = useState(false);
  const [calMonth, setCalMonth]         = useState(() => {
    const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() };
  });

  const searchRef = useRef(null);
  const userId2 = userId;
  // Dériver le nom du poste depuis pharmacie.postes (disponible après chargement)
  const posteNom = pharmacie?.postes?.find(p => p.id === userId)?.nom
                || pharmacie?.pharmacie_postes?.find(p => p.id === userId)?.nom
                || "";

  const canAdmin = userRole !== "vendeur";
  // Rappels de renouvellement reserves au plan Performance (05/09/2026,
  // chantier tarification) — meme convention que offresStories (ParametresTab) :
  // onglet masque plutot qu'affiche avec un message d'erreur a la creation.
  const canRappels = hasFeature(pharmacie?.plan, "rappels");
  const canOffres = hasFeature(pharmacie?.plan, "offresStories");

  // Chargement initial + Realtime
  // ─── OCR automatique dès réception ──────────────────────────────────────────
  async function triggerOcrOnNew(ordos) {
    const sb = getSupabaseClient();
    for (const ordo of ordos) {
      if (ordo.extracted?._ocrSuccess) continue;
      const att = ordo.attachments?.[0];
      if (!att?.path && !att?.dataUrl) continue;
      // HEIC (photo iPhone) : aucun décodeur navigateur, l'OCR échouerait de toute
      // façon (Tesseract/canvas ne peuvent pas lire ces octets) — inutile de
      // tenter le téléchargement + décodage pour un échec garanti.
      if (att.type === "heic") continue;
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
            // @fix 18/09/2026 — medecin n'était pas persisté ici (seuls
            // patient_nom/ocr_confidence l'étaient), contrairement au chemin
            // d'upload manuel (handleFile → updateOrdo → updateOrdoExtracted,
            // qui envoie bien medecin). Le préremplissage "Médecin
            // prescripteur" du rappel ne survivait donc pas à un rechargement
            // pour une ordonnance reçue automatiquement (email/QR), seulement
            // pour celles uploadées manuellement.
            await sb.from("ordonnances").update({
              patient_nom:    extracted.nom        || null,
              medecin:        extracted.medecin    || null,
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
          // Charger les intérêts du jour
          fetchInteretsDuJour(pharmacieId).then(interets => setInteretsDuJour(interets));
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
    // Polling intérêts toutes les 5s pour affichage temps réel
    const interetsInterval = setInterval(() => {
      fetchInteretsDuJour(pharmacieId).then(i => setInteretsDuJour(i));
    }, 5000);
    // Poste vendeur (16/09/2026) — subscribeToPharmacy utilise le client
    // Supabase brut, qui pour un poste vendeur (jeton interne signé, PAS de
    // session Supabase Auth réelle — voir client.js:_resolveAuthToken) tourne
    // en rôle anon. Les policies RLS de `ordonnances` n'accordent SELECT
    // qu'à `authenticated` (aucune ligne pour anon, par choix de sécurité) :
    // le canal temps réel ne recevait donc jamais rien pour un vendeur,
    // depuis toujours — seule la liste initiale (chargée via secure-data, clé
    // de service) s'affichait. Repéré en testant en direct : le titulaire
    // (vraie session Auth) reçoit bien les événements, un vendeur non. Même
    // remède que MonitoringPanel.jsx pour la même raison (table sans accès
    // anon) : un sondage périodique via secure-data en repli.
    const vendeurPoll = userRole === "vendeur" ? setInterval(() => {
      fetchOrdonnances(pharmacieId, 7).then(updatedOrdos => {
        if (updatedOrdos) { setOrdonnances(updatedOrdos); triggerOcrOnNew(updatedOrdos, pharmacieId); }
      });
    }, 10000) : null;
    return () => { unsub(); clearInterval(interetsInterval); if (vendeurPoll) clearInterval(vendeurPoll); };
  }, [pharmacieId, userRole]);

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
        // Recherche par code patient (match exact ou partiel) — code = 3 chiffres +
        // 1 lettre depuis le 25/07/2026, comparaison insensible à la casse.
        if (searchQuery.match(/^[0-9A-Za-z]{1,4}$/) && o.code_patient) {
          return o.code_patient.toUpperCase().startsWith(searchQuery.toUpperCase());
        }
        const words = normalize(searchQuery).split(/\s+/).filter(Boolean);
        return words.every(w => normalize(nom).includes(w));
      })
    : filteredByDate;

  const filteredOrdos = filterStatus === "tous" ? filteredBySearch
    : filteredBySearch.filter(o => o.status === filterStatus);

  // ── Groupement par code_patient ──────────────────────────────────────────
  // Les ordonnances sans code ou avec code unique restent telles quelles
  // Les ordonnances avec le même code sont fusionnées en un groupe
  const groupedOrdos = (() => {
    const groups = {};
    const result = [];
    for (const o of filteredOrdos) {
      if (o.code_patient) {
        const key = `${o.code_patient}-${toDateKey(o.receivedAt || new Date())}`;
        if (groups[key]) {
          groups[key].ordonnances.push(o);
          if (o.status === "nouveau") groups[key].status = "nouveau";
        } else {
          // Attacher les intérêts à ce groupe
          const groupInterets = interetsDuJour.filter(i => i.code_patient === o.code_patient);
          const group = { ...o, _isGroup: true, ordonnances: [o], interets: groupInterets };
          groups[key] = group;
          result.push(group);
        }
      } else {
        result.push({ ...o, _isGroup: false, ordonnances: [o], interets: [] });
      }
    }
    return result;
  })();

  const couleur = pharmacie?.couleur || "#1a3a6e";
  // Calendrier : jours avec ordonnances (recomputed)
  const joursAvecOrdos = new Set((ordonnances||[]).map(o => toDateKey(o.receivedAt)));

  // Générer tous les jours du mois affiché
  const getDaysInMonth = (year, month) => {
    const days = [];
    const firstDay = new Date(year, month, 1).getDay(); // 0=dim
    const daysInMonth = new Date(year, month+1, 0).getDate();
    // Décalage lundi en premier (0=lun, 6=dim)
    const offset = (firstDay + 6) % 7;
    for (let i = 0; i < offset; i++) days.push(null); // cases vides
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      days.push(toDateKey(date));
    }
    return days;
  };

  const calDays = getDaysInMonth(calMonth.year, calMonth.month);
  const today = toDateKey(new Date());

  // Navigation mois
  const prevMonth = () => setCalMonth(prev => {
    const d = new Date(prev.year, prev.month - 1, 1);
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const nextMonth = () => setCalMonth(prev => {
    const d = new Date(prev.year, prev.month + 1, 1);
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const monthLabel = new Date(calMonth.year, calMonth.month, 1)
    .toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

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
  function handlePrintOrdo(id) { addAuditLog({userId:userId2,userRole,pharmacieId,action:"print",ordonnanceId:id,posteNom}).catch(()=>{}); }
  // Téléchargement direct = traitement de l'ordonnance au même titre que
  // l'impression (retour titulaire, 16/09/2026) : le fichier téléchargé est
  // sensé être imprimé/traité depuis un autre poste. Appelé uniquement depuis
  // DownloadConfirmModal.onConfirm (17/09/2026) — marquer automatiquement dès
  // le téléchargement, sans confirmation, risquait de faire disparaître une
  // ordonnance de "À traiter" par erreur (double-clic, téléchargement pour
  // simple vérification) — même logique de confirmation que pour Imprimer.
  function handleDownloadOrdo(id) { updateOrdo(id,{status:"imprime"}); addAuditLog({userId:userId2,userRole,pharmacieId,action:"download",ordonnanceId:id,posteNom}).catch(()=>{}); }
  // Bouton "Traité" explicite (28/09/2026, retour titulaire) — jusqu'ici,
  // marquer une ordonnance comme traitée n'était qu'une conséquence
  // d'imprimer ou télécharger (action loguée en conséquence) ; ici aucun
  // fichier n'est manipulé, donc une action d'audit dédiée plutôt que de
  // logger faussement "download".
  function handleTraiterOrdo(id) { updateOrdo(id,{status:"imprime"}); addAuditLog({userId:userId2,userRole,pharmacieId,action:"traiter",ordonnanceId:id,posteNom}).catch(()=>{}); }
  // Tout marquer traité pour un patient à plusieurs ordonnances (29/09/2026,
  // retour titulaire) — voir OrdoGroup pour le contexte (bouton au pied de
  // carte, à côté de la sonnette, plutôt qu'ordonnance par ordonnance).
  function handleTraiterGroupe(group) {
    for (const o of group.ordonnances) {
      if (o.status !== "imprime") handleTraiterOrdo(o.id);
    }
  }
  // Suppression définitive (18/09/2026, demande titulaire) — toujours
  // appelée depuis DeleteConfirmModal.onConfirm, jamais directement au clic
  // sur 🗑️ (voir onDelete={()=>setDeleteConfirm(ordo)} plus bas). Retrait
  // optimiste de la liste locale une fois le serveur confirmé (pas avant :
  // contrairement à updateOrdo, une suppression ratée ne doit pas faire
  // disparaître la carte alors que la ligne existe toujours en base).
  async function handleDeleteOrdo(ordo) {
    setDeleting(true);
    setDeleteError("");
    try {
      await deleteOrdonnance(ordo.id, pharmacieId);
      setOrdonnances(prev => prev.filter(o => o.id !== ordo.id));
      addAuditLog({userId:userId2,userRole,pharmacieId,action:"delete",ordonnanceId:ordo.id,posteNom}).catch(()=>{});
      setDeleteConfirm(null);
      setDeleteSuccess(true);
      setTimeout(()=>setDeleteSuccess(false), 2500);
    } catch (e) {
      setDeleteError(e.message || "Échec de la suppression.");
    }
    setDeleting(false);
  }
  async function handleFile(ordoId, file, dataUrl) {
    setLoadingId(ordoId);
    addAuditLog({userId:userId2,userRole,pharmacieId,action:"upload",ordonnanceId:ordoId,posteNom}).catch(()=>{});
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
  // Ajout d'une ordonnance depuis l'ordinateur pour créer un rappel "hors
  // ordonnance" (26/09/2026, révisé le 26/09/2026 sur retour titulaire :
  // le pharmacien doit ajouter une nouvelle pièce, pas choisir une
  // ordonnance déjà présente dans OrdoMail). Crée une vraie ligne
  // ordonnances (pas un simple brouillon), fait tourner l'OCR comme pour
  // tout dépôt, puis enchaîne sur le formulaire de rappel pré-rempli —
  // même pipeline que handleFile, en partant d'une ordonnance qui n'existe
  // pas encore plutôt que d'une déjà en base.
  async function handleRappelOrdonnanceUpload(file, dataUrl) {
    setOrdonnanceUploading(true);
    setOrdonnanceUploadError("");
    try {
      const created = await createOrdonnanceManuelle(pharmacieId, file);
      if (!created?.id) throw new Error("Échec de la création de l'ordonnance.");
      const extracted = await extractFromFile(dataUrl.split(",")[1], file.type, {});
      await updateOrdoExtracted(created.id, pharmacieId, extracted);
      // Rafraîchit la liste pour que la nouvelle ordonnance apparaisse aussi
      // dans l'onglet Ordonnances, pas seulement dans le brouillon de rappel.
      const updated = await fetchOrdonnances(pharmacieId, 7);
      if (updated) setOrdonnances(updated);
      setShowOrdonnanceUpload(false);
      setRappelDraft({ ...splitNomPrenom(extracted?.nom), medecin: extracted?.medecin || null, ordonnanceId: created.id });
    } catch (e) {
      setOrdonnanceUploadError(e.message || "Échec de l'envoi du fichier.");
    }
    setOrdonnanceUploading(false);
  }
  async function handleSaveParams(patch) {
    await savePharmacie(pharmacieId, patch);
    setPharmacie(p=>({...p,...patch}));
  }

  // Repéré par le linter (phase 2) : ParametresTab appelait un setPharmacie qui
  // n'existe que dans ce composant-ci (PharmacieDashboard), pas dans le sien —
  // ReferenceError garantie après un changement de plan. Passé en prop à la place.
  async function refreshPharmacie() {
    const ph = await fetchPharmacie(pharmacieId);
    if (ph) setPharmacie(ph);
    return ph;
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
          <button onClick={()=>setTab("ordonnances")} style={{padding:"5px 12px",border:"none",borderRadius:7,cursor:"pointer",background:tab==="ordonnances"?"rgba(255,255,255,0.25)":"transparent",color:"#fff",fontWeight:tab==="ordonnances"?700:400,fontSize:12,fontFamily:"inherit"}}>📋 Ordonnances</button>
          {canRappels&&<button onClick={()=>setTab("rappels")} style={{padding:"5px 12px",border:"none",borderRadius:7,cursor:"pointer",background:tab==="rappels"?"rgba(255,255,255,0.25)":"transparent",color:"#fff",fontWeight:tab==="rappels"?700:400,fontSize:12,fontFamily:"inherit",display:"flex",alignItems:"center",gap:5}}>
            🔔 Rappels
            {rappelsATraiter>0&&<span style={{background:"#dc2626",color:"#fff",borderRadius:999,padding:"1px 6px",fontSize:10,fontWeight:800,lineHeight:1.4}}>{rappelsATraiter}</span>}
          </button>}
          {canOffres&&<button onClick={()=>setTab("offres")} style={{padding:"5px 12px",border:"none",borderRadius:7,cursor:"pointer",background:tab==="offres"?"rgba(255,255,255,0.25)":"transparent",color:"#fff",fontWeight:tab==="offres"?700:400,fontSize:12,fontFamily:"inherit"}}>🎯 Offres</button>}
          {canAdmin&&<button onClick={()=>setTab("parametres")} style={{padding:"5px 12px",border:"none",borderRadius:7,cursor:"pointer",background:tab==="parametres"?"rgba(255,255,255,0.25)":"transparent",color:"#fff",fontWeight:tab==="parametres"?700:400,fontSize:12,fontFamily:"inherit"}}>⚙️ Paramètres</button>}
        </div>
      </header>
      <BottomNav tab={tab} canAdmin={canAdmin} canRappels={canRappels} canOffres={canOffres} setTab={setTab} rappelsATraiter={rappelsATraiter} />

      {tab==="rappels"&&canRappels&&(
        <ErrorBoundary compact label="Rappels">
        <div style={{flex:1,overflow:"auto",padding:16,paddingBottom:76}}>
          <RappelsSection pharmacie={pharmacie} onCountATraiter={setRappelsATraiter} userRole={userRole}/>
        </div>
        </ErrorBoundary>
      )}

      {tab==="offres"&&canOffres&&(
        <ErrorBoundary compact label="Offres">
        <div style={{flex:1,overflow:"auto",padding:16,paddingBottom:76}}>
          <OffresSection pharmacie={pharmacie}/>
        </div>
        </ErrorBoundary>
      )}

      {tab==="ordonnances"&&(
        <ErrorBoundary compact label="Ordonnances">
        <div style={{flex:1,overflow:"hidden",display:"flex",flexDirection:"column",paddingBottom:60}}>
          <div style={{background:"#fff",borderBottom:"1px solid #e8eaf0",padding:"10px 16px",display:"flex",flexDirection:"column",gap:8,flexShrink:0}}>
            <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
              {/* Bouton déclencheur calendrier */}
              <div style={{position:"relative"}}>
                <button onClick={()=>setShowCalendar(s=>!s)}
                  style={{display:"flex",alignItems:"center",gap:6,background:"#f0f2f8",
                    borderRadius:10,padding:"7px 12px",border:`1.5px solid ${showCalendar?couleur:"#e0e0e0"}`,
                    cursor:"pointer",fontFamily:"inherit",color:"#1a3a6e",fontWeight:700,fontSize:13}}>
                  <span>📅</span>
                  <span>{formatDateLabel(selectedDate)}</span>
                  <span style={{fontSize:10,color:"#94a3b8"}}>{showCalendar?"▲":"▼"}</span>
                </button>

              {/* Calendrier mensuel — affiché/caché */}
              {showCalendar && <div style={{position:"absolute",top:"calc(100% + 6px)",left:0,zIndex:100,
                background:"#fff",borderRadius:14,border:"1px solid #e2e8f0",padding:"12px 14px",minWidth:260,
                boxShadow:"0 8px 32px rgba(0,0,0,0.12)"}}>
                {/* Header mois */}
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                  <button onClick={prevMonth} style={{border:"none",background:"transparent",cursor:"pointer",fontSize:16,color:"#1a3a6e",padding:"0 6px"}}>‹</button>
                  <span style={{fontWeight:800,fontSize:13,color:"#1a3a6e",textTransform:"capitalize"}}>{monthLabel}</span>
                  <button onClick={nextMonth} style={{border:"none",background:"transparent",cursor:"pointer",fontSize:16,color:"#1a3a6e",padding:"0 6px"}}>›</button>
                </div>
                {/* Jours de la semaine */}
                <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:4}}>
                  {["L","M","M","J","V","S","D"].map((d,i)=>(
                    <div key={i} style={{textAlign:"center",fontSize:10,fontWeight:700,color:"#94a3b8"}}>{d}</div>
                  ))}
                </div>
                {/* Cases du calendrier */}
                <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2}}>
                  {calDays.map((day, i) => {
                    if (!day) return <div key={i}/>;
                    const isToday   = day === today;
                    const isSelected = day === selectedDate;
                    const hasOrdos  = joursAvecOrdos.has(day);
                    const isFuture  = day > today;
                    return (
                      <button key={day} onClick={()=>{if(!isFuture){setSelectedDate(day);setSearchQuery("");setShowCalendar(false);}}}
                        title={hasOrdos ? formatDateLabel(day) : ""}
                        style={{
                          width:"100%",aspectRatio:"1",border:"none",borderRadius:6,cursor:isFuture?"default":"pointer",
                          fontFamily:"inherit",fontSize:12,fontWeight:isSelected||isToday?800:hasOrdos?600:400,
                          background: isSelected ? couleur : isToday ? "#dbeafe" : "transparent",
                          color: isSelected ? "#fff" : isToday ? "#1a3a6e" : isFuture ? "#d1d5db" : hasOrdos ? "#1a3a6e" : "#64748b",
                          position:"relative",
                        }}>
                        {day.split("-")[2].replace(/^0/,"")}
                        {/* Point indicateur si ordonnances */}
                        {hasOrdos && !isSelected && (
                          <span style={{position:"absolute",bottom:2,left:"50%",transform:"translateX(-50%)",
                            width:4,height:4,borderRadius:"50%",background:isToday?"#1a3a6e":couleur,display:"block"}}/>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>}
              </div>
              <div style={{flex:1,position:"relative",minWidth:120}}>
                <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",fontSize:14,pointerEvents:"none"}}>🔍</span>
                <input ref={searchRef} value={searchQuery} onChange={e=>setSearchQuery(e.target.value)}
                  placeholder="Nom ou code (ex: 247)…"
                  style={{width:"100%",padding:"8px 10px 8px 32px",border:`1.5px solid ${searchQuery?couleur:"#e0e0e0"}`,borderRadius:10,fontSize:13,fontFamily:"inherit",outline:"none",background:"#fff",boxSizing:"border-box"}}/>
              </div>
              <div style={{display:"flex",gap:4}}>
                <button onClick={()=>setViewMode("grid")} style={{width:32,height:32,border:`1.5px solid ${viewMode==="grid"?couleur:"#e0e0e0"}`,borderRadius:8,background:viewMode==="grid"?couleur:"#fff",color:viewMode==="grid"?"#fff":"#888",cursor:"pointer",fontSize:14}}>⊞</button>
                <button onClick={()=>setViewMode("list")} style={{width:32,height:32,border:`1.5px solid ${viewMode==="list"?couleur:"#e0e0e0"}`,borderRadius:8,background:viewMode==="list"?couleur:"#fff",color:viewMode==="list"?"#fff":"#888",cursor:"pointer",fontSize:14}}>☰</button>
              </div>
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
              {[["nouveau","🔔 À traiter",ordonnancesJour.filter(o=>o.status==="nouveau").length],["imprime","✓ Traitées",ordonnancesJour.filter(o=>o.status==="imprime").length],["tous","Toutes",ordonnancesJour.length]].map(([k,l,count])=>(
                <button key={k} onClick={()=>setFilterStatus(k)}
                  style={{padding:"5px 12px",borderRadius:16,border:`1.5px solid ${filterStatus===k?couleur:"#e0e0e0"}`,background:filterStatus===k?couleur:"#fff",color:filterStatus===k?"#fff":"#555",fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:5}}>
                  {l}<span style={{background:filterStatus===k?"rgba(255,255,255,0.25)":"#f0f0f0",borderRadius:10,padding:"0 6px",fontSize:11}}>{count}</span>
                </button>
              ))}
              <span style={{fontSize:12,color:"#bbb",marginLeft:4}}>{filteredOrdos.length} ordonnance{filteredOrdos.length!==1?"s":""}</span>
              {/* Nouveau rappel — déplacé depuis l'onglet Rappels (16/09/2026,
                  demande titulaire) : accessible directement depuis l'onglet
                  Ordonnances, au même niveau que les filtres de statut mais
                  poussé tout à droite (marginLeft:"auto"). Réutilise le même
                  mécanisme que le bouton "Créer son rappel" des cartes
                  ordonnance (rappelDraft + RappelForm rendu plus bas,
                  indépendant de l'onglet actif) plutôt que le showForm local
                  de RappelsSection, qui est démontée quand cet onglet est actif.
                  @fix 26/09/2026, révisé le 26/09/2026 — hors du contexte
                  d'une ordonnance précise, ouvre d'abord un ajout de fichier
                  (RappelOrdonnanceUpload) : le pharmacien dépose une nouvelle
                  ordonnance depuis son ordinateur (jamais un choix parmi
                  celles déjà présentes dans OrdoMail), pour que chaque rappel
                  corresponde à une pièce réellement déposée pour lui, avec un
                  nom de patient fiable (OCR) et accessible depuis la liste
                  des rappels. */}
              {canRappels && (
                <button onClick={()=>setShowOrdonnanceUpload(true)}
                  style={{marginLeft:"auto",padding:"5px 14px",borderRadius:16,border:"none",background:"#1a3a6e",color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>
                  + Nouveau rappel
                </button>
              )}
            </div>
          </div>
          <div style={{flex:1,overflow:"auto",padding:"12px 12px 80px"}}>
            {filteredOrdos.length===0?(
              <div style={{textAlign:"center",padding:"40px 20px",color:"#bbb"}}>
                <div style={{fontSize:36,marginBottom:10}}>{joursAvecOrdos.has(selectedDate) ? "🔍" : "📅"}</div>
                <div style={{fontSize:15,fontWeight:600,color:"#64748b"}}>
                  {joursAvecOrdos.has(selectedDate)
                    ? "Aucune ordonnance trouvée"
                    : "Aucune ordonnance ce jour"}
                </div>
                {!joursAvecOrdos.has(selectedDate) && (
                  <div style={{fontSize:13,color:"#94a3b8",marginTop:6}}>
                    Les jours avec des ordonnances sont marqués d'un point dans le calendrier
                  </div>
                )}
              </div>
            ):viewMode==="grid"?(
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(min(100%,225px),1fr))",gap:9}}>
                {groupedOrdos.map(o=>{
                  if (o._isGroup && o.ordonnances.length > 1) {
                    return <OrdoGroup key={o.code_patient+'-'+toDateKey(o.receivedAt)} id={`ordo-${o.ordonnances?.[0]?.id||o.id}`}
                      group={o} accentUnique={pharmacie?.accent_unique}
                      interets={o.interets || []}
                      sonnetteActive={pharmacie?.sonnette_active !== false}
                      onSonnette={() => appellerPatient(pharmacieId, o.code_patient)}
                      onPrint={(ordo)=>{handlePrintOrdo(ordo.id);setPrintModal(ordo);}}
                      onView={handleViewOrdo}
                      onTraiterGroupe={(group)=>setTraiterGroupeConfirm(group)}
                      onReopen={(ordo)=>{updateOrdo(ordo.id,{status:"nouveau"});addAuditLog({userId:userId2,userRole,pharmacieId,action:"reopen",ordonnanceId:ordo.id,posteNom});}}
                      onDownloaded={(ordo)=>setDownloadConfirm(ordo)}
                      onDelete={(ordo)=>setDeleteConfirm(ordo)}
                      onCreateRappel={(ordo)=>setRappelDraft({...splitNomPrenom(ordo.extracted?.nom||ordo.fromName), medecin: ordo.extracted?.medecin || null, ordonnanceId: ordo.id})}/>;
                  }
                  return <OrdoCard key={o.id} id={`ordo-${o.id}`} ordo={o} accentUnique={pharmacie?.accent_unique}
                    interets={o.interets || []}
                    sonnetteActive={pharmacie?.sonnette_active !== false}
                    onSonnette={()=>appellerPatient(pharmacieId, o.code_patient || "???")}
                    onPrint={()=>{handlePrintOrdo(o.id);setPrintModal(o);}}
                    onView={handleViewOrdo}
                    onTraiter={()=>setTraiterConfirm(o)}
                    onUpload={(file,dataUrl)=>handleFile(o.id,file,dataUrl)}
                    onReopen={()=>{updateOrdo(o.id,{status:"nouveau"});addAuditLog({userId:userId2,userRole,pharmacieId,action:"reopen",ordonnanceId:o.id,posteNom});}}
                    onDownloaded={()=>setDownloadConfirm(o)}
                    onDelete={()=>setDeleteConfirm(o)}
                    onCreateRappel={(ordo)=>setRappelDraft({...splitNomPrenom(ordo.extracted?.nom||ordo.fromName), medecin: ordo.extracted?.medecin || null, ordonnanceId: ordo.id})}
                    loadingId={loadingId}/>;
                })}
              </div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {groupedOrdos.map(o=>{
                  const accent=getOrdoAccent(o.id, pharmacie?.accent_unique);
                  if (o._isGroup && o.ordonnances.length > 1) {
                    return (
                      <div key={o.code_patient+'-list-'+toDateKey(o.receivedAt)} style={{
                        background:"#fff",borderRadius:12,marginBottom:6,padding:"12px 18px",
                        border:`2px solid ${o.ordonnances.every(ord=>ord.status==="imprime")?"#bbf7d0":accent.border}`,
                        boxShadow:"0 1px 4px rgba(0,0,0,0.04)",
                      }}>
                        {/* En-tête groupe */}
                        {(()=>{
                          const allImprime = o.ordonnances.every(ord=>ord.status==="imprime");
                          return (
                        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:8}}>
                          {/* Avatar circulaire — corrigé (17/09/2026) : ce badge
                              rectangulaire à lettres espacées (fontSize:22,
                              letterSpacing:4) était le seul endroit de l'app à
                              afficher le code patient hors d'un avatar rond,
                              et ignorait la couleur d'accent du patient
                              (couleurs #1a3a6e/#475569 codées en dur) —
                              incohérent avec OrdoRow (vue liste, ordonnance
                              seule) qui affiche le même code dans un avatar
                              rond de 44px aux couleurs accent.*, signalé par
                              le titulaire comme un affichage cassé. */}
                          <div style={{ width: 44, height: 44, borderRadius: "50%", flexShrink: 0,
                            background: allImprime ? accent.bg : accent.bandeau,
                            border: `2px solid ${accent.border}`,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            color: allImprime ? accent.avatar : "#fff", fontWeight: 900,
                            fontSize: 17, fontFamily: "inherit",
                          }}>
                            {o.code_patient
                              ? <span style={{fontSize:11,fontWeight:900,fontFamily:"monospace"}}>{o.code_patient}</span>
                              : (o.extracted?.nom||o.fromName)?.charAt(0)?.toUpperCase() || "?"}
                          </div>
                          <div style={{flex:1}}>
                            <div style={{fontWeight:800,fontSize:15,color: allImprime?"#64748b":"#1a1a1a"}}>
                              {o.extracted?.nom||o.fromName||"Patient"}
                            </div>
                            <div style={{fontSize:11,color:"#64748b"}}>
                              {o.ordonnances.length} ordonnances · {timeAgo(o.receivedAt)}
                              {allImprime && <span style={{marginLeft:6,color:"#15803d",fontWeight:700}}>✓ Tout imprimé</span>}
                            </div>
                          </div>
                          {pharmacie?.sonnette_active !== false && (
                            <button onClick={()=>appellerPatient(pharmacieId, o.code_patient)}
                              title="Appeler le patient"
                              style={{padding:"8px 12px",border:"1.5px solid rgba(26,58,110,0.3)",
                                borderRadius:9,background:"#f0f4ff",cursor:"pointer",fontSize:16,flexShrink:0}}>
                              🔔
                            </button>
                          )}
                          {/* Tout marquer traité (29/09/2026, retour titulaire) — même
                              raisonnement que OrdoGroup : pas lié à une ordonnance
                              précise, se raisonne au niveau du patient comme la
                              sonnette, donc juste à côté plutôt que ligne par ligne. */}
                          {!allImprime && (
                            <button onClick={()=>setTraiterGroupeConfirm(o)}
                              style={{padding:"8px 12px",border:"1.5px solid #86efac",borderRadius:9,
                                background:"#f0fdf4",color:"#15803d",fontWeight:700,fontSize:12,
                                cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>
                              ✅ Tout traiter
                            </button>
                          )}
                          {/* @fix 26/09/2026 — bouton unique par patient retiré : chaque
                              ordonnance du groupe a désormais son propre bouton ⏰
                              plus bas (lignes individuelles), pour lier le rappel à
                              l'ordonnance réellement concernée. */}
                        </div>
                          );
                        })()}
                        {/* Intérêts offres du patient */}
                        {(o.interets||[]).length > 0 && (
                          <div style={{marginBottom:8}}>
                            {(o.interets||[]).map(int=>(
                              <div key={int.id} style={{
                                display:"flex",alignItems:"center",gap:8,
                                padding:"5px 10px",marginBottom:4,
                                background:"#fff8e1",borderRadius:8,
                                border:"1.5px solid #fde68a",
                              }}>
                                <span style={{fontSize:16}}>{int.offre_emoji||"🎁"}</span>
                                <span style={{fontSize:12,fontWeight:700,color:"#92400e"}}>
                                  Intéressé(e) : {int.offre_titre}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Lignes individuelles */}
                        {o.ordonnances.map((ord,idx)=>{
                          const ordImprime = ord.status === "imprime";
                          return (
                          <div key={ord.id} style={{display:"flex",alignItems:"center",gap:8,
                            padding:"6px 10px",borderRadius:8,marginBottom:4,
                            background: ordImprime?"#f0fdf4":"#f8fafc",
                            border:`1px solid ${ordImprime?"#bbf7d0":"#e2e8f0"}`}}>
                            <span style={{fontSize:12,fontWeight:600,flex:1,
                              color: ordImprime?"#15803d":"#475569"}}>
                              {ordImprime ? "✓" : "📎"} Ordonnance {idx+1}
                              {ord.attachments?.[0]?.name && (
                                <span style={{color:"#94a3b8",fontWeight:400}}> — {truncateFilename(ord.attachments[0].name)}</span>
                              )}
                            </span>
                            {/* Voir le fichier en popup (28/09/2026, retour titulaire). */}
                            {(ord.attachments?.[0]?.dataUrl || ord.attachments?.[0]?.path) && (
                              <button onClick={()=>handleViewOrdo(ord)} title="Voir l'ordonnance"
                                style={{padding:"4px 8px",border:"1px solid rgba(26,58,110,0.3)",borderRadius:6,
                                  background:"#f0f4ff",color:"#1a3a6e",fontSize:11,
                                  cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>
                                👁
                              </button>
                            )}
                            {/* Téléchargement direct — manquait en vue liste groupée
                                (04/09/2026), déjà présent en vue grille (OrdoCard). */}
                            {(ord.attachments?.[0]?.dataUrl || ord.attachments?.[0]?.path) && (
                              <button onClick={async ()=>{
                                  const a = ord.attachments[0];
                                  const url = a.dataUrl || (a.path ? await getSignedUrl(a.path, 3600) : null);
                                  if (!url) return;
                                  const res = await fetch(url);
                                  const blob = await res.blob();
                                  const blobUrl = URL.createObjectURL(blob);
                                  const link = document.createElement("a");
                                  link.href = blobUrl; link.download = a.name || "ordonnance";
                                  document.body.appendChild(link); link.click(); link.remove();
                                  URL.revokeObjectURL(blobUrl);
                                  setDownloadConfirm(ord);
                                }}
                                title="Télécharger le fichier"
                                style={{padding:"4px 8px",border:"1px solid rgba(26,58,110,0.3)",borderRadius:6,
                                  background:"#f0f4ff",color:"#1a3a6e",fontSize:11,
                                  cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>
                                ⬇️
                              </button>
                            )}
                            {!ordImprime && (
                              <button onClick={()=>{handlePrintOrdo(ord.id);setPrintModal(ord);}}
                                style={{padding:"4px 10px",border:"none",borderRadius:6,
                                  background:accent.bandeau,color:"#fff",fontSize:11,
                                  cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>
                                🖨️ Imprimer
                              </button>
                            )}
                            {/* @fix 29/09/2026 (demande titulaire) — bouton "Traité" par
                                ordonnance retiré ici : pour un patient à plusieurs
                                ordonnances, seul "✅ Tout traiter" dans l'en-tête (à
                                côté de la sonnette) reste disponible. */}
                            {ordImprime && (
                              <button onClick={()=>{updateOrdo(ord.id,{status:"nouveau"});addAuditLog({userId:userId2,userRole,pharmacieId,action:"reopen",ordonnanceId:ord.id,posteNom});}}
                                title="Remettre à traiter"
                                style={{padding:"4px 8px",border:"1px solid #e6a817",borderRadius:6,
                                  background:"#fffbf0",color:"#92400e",fontSize:11,fontWeight:700,
                                  cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>
                                ✓ ↩ Remettre à traiter
                              </button>
                            )}
                            {/* @fix 26/09/2026 — un rappel par ordonnance individuelle du
                                groupe (avant : un seul bouton pour tout le patient). */}
                            <button onClick={()=>setRappelDraft({...splitNomPrenom(ord.extracted?.nom||ord.fromName), medecin: ord.extracted?.medecin || null, ordonnanceId: ord.id})}
                              title="Créer un rappel pour cette ordonnance"
                              style={{padding:"4px 8px",border:"1px solid rgba(26,58,110,0.3)",borderRadius:6,
                                background:"#f0f4ff",color:"#1a3a6e",fontSize:11,
                                cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>
                              ⏰
                            </button>
                            <button onClick={()=>setDeleteConfirm(ord)} title="Supprimer l'ordonnance"
                              style={{padding:"4px 8px",border:"1px solid #fecaca",borderRadius:6,
                                background:"#fef2f2",color:"#b91c1c",fontSize:11,
                                cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>
                              🗑️
                            </button>
                          </div>
                          );
                        })}
                      </div>
                    );
                  }
                  return <OrdoRow key={o.id} id={`ordo-${o.id}`} ordo={o} accentUnique={pharmacie?.accent_unique}
                    interets={o.interets || []}
                    sonnetteActive={pharmacie?.sonnette_active !== false}
                    onSonnette={()=>appellerPatient(pharmacieId, o.code_patient)}
                    onPrint={()=>{handlePrintOrdo(o.id);setPrintModal(o);}}
                    onView={handleViewOrdo}
                    onTraiter={()=>setTraiterConfirm(o)}
                    onReopen={()=>{updateOrdo(o.id,{status:"nouveau"});addAuditLog({userId:userId2,userRole,pharmacieId,action:"reopen",ordonnanceId:o.id,posteNom});}}
                    onDownloaded={()=>setDownloadConfirm(o)}
                    onDelete={()=>setDeleteConfirm(o)}
                    onCreateRappel={(ordo)=>setRappelDraft({...splitNomPrenom(ordo.extracted?.nom||ordo.fromName), medecin: ordo.extracted?.medecin || null, ordonnanceId: ordo.id})}/>;
                })}
              </div>
            )}
          </div>
        </div>
        </ErrorBoundary>
      )}

      {tab==="parametres"&&canAdmin&&(
        <ErrorBoundary compact label="Paramètres">
        <ParametresTab pharmacie={pharmacie} onSave={handleSaveParams} onPlanChanged={refreshPharmacie}
          pharmacieId={pharmacieId}
          onOpenOrdo={(ordoId) => {
            setTab("ordonnances");
            setFilterStatus("all");
            setTimeout(() => {
              const el = document.getElementById(`ordo-${ordoId}`);
              if (el) {
                el.scrollIntoView({ behavior:"smooth", block:"center" });
                el.style.outline = "3px solid #1e40af";
                setTimeout(() => el.style.outline = "", 2500);
              }
            }, 300);
          }}
        />
        </ErrorBoundary>
      )}

      {/* Bouton d'aide flottant (14/09/2026) — visible titulaire ET vendeur sur
          tous les onglets, indépendant de desktop-nav/BottomNav pour ne pas
          avoir à faire transiter canAdmin/canRappels dans ces deux composants
          juste pour ce bouton. */}
      <button onClick={()=>setShowAide(true)} title="Aide"
        style={{position:"fixed",right:16,bottom:84,width:48,height:48,borderRadius:"50%",border:"none",background:"#0f172a",color:"#fff",fontSize:20,cursor:"pointer",boxShadow:"0 6px 20px rgba(0,0,0,0.25)",zIndex:150,display:"flex",alignItems:"center",justifyContent:"center"}}>
        ❓
      </button>
      {showAide&&<AideModal posteNom={posteNom} isAdmin={canAdmin} onClose={()=>setShowAide(false)}/>}

      {viewerAtt && <OrdonnanceViewerModal att={viewerAtt} onClose={() => setViewerAtt(null)} />}
      {printModal&&<PrintConfirmModal ordo={printModal}
        onConfirm={()=>{updateOrdo(printModal.id,{status:"imprime"});setPrintModal(null);}}
        onCancel={()=>setPrintModal(null)}/>}
      {downloadConfirm&&<TraiterConfirmModal ordo={downloadConfirm} couleur={couleur}
        onConfirm={()=>{handleDownloadOrdo(downloadConfirm.id);setDownloadConfirm(null);}}
        onCancel={()=>setDownloadConfirm(null)}/>}
      {traiterConfirm&&<TraiterConfirmModal ordo={traiterConfirm} couleur={couleur}
        onConfirm={()=>{handleTraiterOrdo(traiterConfirm.id);setTraiterConfirm(null);}}
        onCancel={()=>setTraiterConfirm(null)}/>}
      {traiterGroupeConfirm&&<TraiterGroupeConfirmModal
        count={traiterGroupeConfirm.ordonnances.filter(o=>o.status!=="imprime").length}
        nom={traiterGroupeConfirm.extracted?.nom || traiterGroupeConfirm.fromName || "ce patient"}
        onConfirm={()=>{handleTraiterGroupe(traiterGroupeConfirm);setTraiterGroupeConfirm(null);}}
        onCancel={()=>setTraiterGroupeConfirm(null)}/>}
      {deleteConfirm&&<DeleteConfirmModal ordo={deleteConfirm} couleur={couleur} deleting={deleting} error={deleteError}
        onConfirm={()=>handleDeleteOrdo(deleteConfirm)}
        onCancel={()=>{setDeleteConfirm(null);setDeleteError("");}}/>}
      {deleteSuccess&&(
        <div style={{position:"fixed",top:24,left:"50%",transform:"translateX(-50%)",background:"#15803d",color:"#fff",padding:"12px 22px",borderRadius:12,fontWeight:700,fontSize:13.5,boxShadow:"0 8px 24px rgba(21,128,61,0.35)",zIndex:9999,display:"flex",alignItems:"center",gap:8}}>
          ✅ Ordonnance supprimée
        </div>
      )}
      {showOrdonnanceUpload&&<RappelOrdonnanceUpload
        onCancel={()=>{setShowOrdonnanceUpload(false);setOrdonnanceUploadError("");}}
        onUpload={handleRappelOrdonnanceUpload}
        uploading={ordonnanceUploading}
        error={ordonnanceUploadError}/>}
      {rappelDraft&&<RappelForm initialNom={rappelDraft.nom} initialPrenom={rappelDraft.prenom} initialMedecin={rappelDraft.medecin}
        creating={rappelCreating} setCreating={setRappelCreating}
        onCancel={()=>setRappelDraft(null)}
        onCreated={async(payload)=>{await createRappel(pharmacieId,{...payload,ordonnanceId:rappelDraft.ordonnanceId});setRappelDraft(null);}}/>}

      {/* Portail direct vers document.body (25/08/2026) — le CSS d'impression ci-dessous
          masque body>* (les enfants DIRECTS de <body>) puis force l'affichage de
          #ordomail-print-area. Tant que ce div restait un simple enfant JSX de
          PharmacieDashboard, il était niché plusieurs niveaux sous #root (le vrai
          enfant direct de body) — masquer #root masque tout son sous-arbre, et
          `display:block!important` sur un descendant ne peut pas ressusciter un
          arbre dont un ancêtre est display:none. Résultat : page blanche à
          l'impression d'une image (le cas PDF passait par une fenêtre séparée,
          jamais touché par ce bug — d'où un signalement spécifique aux images).
          Le portail rend ce div réellement enfant direct de body, comme le CSS
          l'attend. */}
      {typeof document !== "undefined" && createPortal(
        <div id="ordomail-print-area" style={{display:"none"}}/>,
        document.body
      )}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}@keyframes popIn{0%{opacity:0;transform:scale(0.92)}100%{opacity:1;transform:scale(1)}}*{box-sizing:border-box}::-webkit-scrollbar{width:6px}::-webkit-scrollbar-thumb{background:#ddd;border-radius:3px}@media print{body>*{display:none!important}#ordomail-print-area{display:block!important;position:static;width:100%;background:#fff}}@media(max-width:640px){.hide-mobile{display:none!important}.desktop-nav{display:none!important}.bottom-nav{display:flex!important}}@media(min-width:641px){.desktop-nav{display:flex!important}.bottom-nav{display:none!important}.mobile-padded{padding-bottom:0!important}}`}</style>
    </div>
  );
}

export { BottomNav, PharmacieDashboard, OffresSection, CompteSection, ParametresTab };
export default PharmacieDashboard;