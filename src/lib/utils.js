import { useState, useEffect } from "react";

// ─── Échappement HTML (anti-XSS) ──────────────────────────────────────────────
// À utiliser systématiquement avant d'interpoler une valeur utilisateur/patient
// (nom, email, médicaments…) dans une chaîne HTML brute (innerHTML, window.open).
export function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ─── Troncature des noms de fichier affichés ─────────────────────────────────
// Un nom de fichier reçu (photo de téléphone, export d'un logiciel médical…)
// peut dépasser largement la largeur prévue dans une carte/étiquette et
// décaler la mise en page — tronque au milieu en conservant l'extension
// (utile pour distinguer .pdf/.jpg au premier coup d'œil).
export function truncateFilename(name, max = 30) {
  if (!name || name.length <= max) return name || "";
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 && dot > name.length - 8 ? name.slice(dot) : "";
  const base = ext ? name.slice(0, dot) : name;
  const keep = Math.max(1, max - ext.length - 1);
  return base.slice(0, keep) + "…" + ext;
}

// ─── Masquage des logs (données sensibles) ───────────────────────────────────
// À utiliser dans tout console.log/error/warn qui référence un email, un
// identifiant de pharmacie ou un code patient — ces logs finissent dans les
// tableaux de bord d'hébergement (navigateur/Supabase) et ne doivent pas
// exposer de données personnelles en clair.
export function maskEmail(email) {
  if (!email) return email;
  const s = String(email);
  const at = s.indexOf("@");
  if (at <= 0) return "***";
  return `${s[0]}***@${s.slice(at + 1)}`;
}

export function maskId(id) {
  if (!id) return id;
  const s = String(id);
  return s.length <= 8 ? "***" : `${s.slice(0, 8)}…`;
}

export function maskCode(code) {
  if (!code) return code;
  const s = String(code);
  return s.length <= 1 ? "***" : `${s[0]}***`;
}

// ─── Utilitaires temporels ────────────────────────────────────────────────────
export function timeAgo(date) {
  if (!date) return "";
  const d = date instanceof Date ? date : new Date(date);
  const diff = (Date.now() - d) / 1000;
  if (diff < 60) return "À l'instant";
  if (diff < 3600) return `Il y a ${Math.floor(diff/60)} min`;
  if (diff < 86400) return `Il y a ${Math.floor(diff/3600)}h`;
  return `Il y a ${Math.floor(diff/86400)}j`;
}

export function isSameDay(a, b) {
  const da = a instanceof Date ? a : new Date(a);
  const db = b instanceof Date ? b : new Date(b);
  return da.toDateString() === db.toDateString();
}

// ─── Encodage fichier ──────────────────────────────────────────────────────
// Utilisé par tout upload passant en base64 par une Edge Function (stories,
// offres, ordonnances) — String.fromCharCode(...bytes) seul dépasse la
// limite d'arguments d'un appel de fonction sur les gros fichiers, d'où le
// découpage par blocs.
export async function fileToBase64(file) {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(binary);
}

export function toDateKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  // ⚠️ Ne pas utiliser toISOString() ici : elle convertit en UTC avant de
  // formater, donc dans un fuseau en avance sur UTC (ex. Europe l'été), les
  // premières heures de la journée locale sont encore la veille en UTC — le
  // calendrier affichait alors "hier" comme date du jour. On construit la clé
  // à partir des composants de date LOCAUX du navigateur à la place.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatDateLabel(key) {
  const d = new Date(key + "T00:00:00");
  return d.toLocaleDateString("fr-FR", { weekday:"short", day:"numeric", month:"short" });
}

// ─── Couleurs ordonnances ─────────────────────────────────────────────────────
export const ORDO_ACCENTS = [
  { bg:"#e8f5e9", border:"#a5d6a7", bandeau:"#2e7d32", avatar:"#1b5e20" },
  { bg:"#e3f2fd", border:"#90caf9", bandeau:"#1565c0", avatar:"#0d47a1" },
  { bg:"#fce4ec", border:"#f48fb1", bandeau:"#c62828", avatar:"#b71c1c" },
  { bg:"#fff8e1", border:"#ffe082", bandeau:"#f57f17", avatar:"#e65100" },
  { bg:"#f3e5f5", border:"#ce93d8", bandeau:"#6a1b9a", avatar:"#4a148c" },
  { bg:"#e0f7fa", border:"#80deea", bandeau:"#00695c", avatar:"#004d40" },
];

export function getOrdoAccent(id) {
  if (!id) return ORDO_ACCENTS[0];
  const hash = [...String(id)].reduce((a,c)=>a+c.charCodeAt(0),0);
  return ORDO_ACCENTS[hash % ORDO_ACCENTS.length];
}

// ─── Thème couleurs landing ───────────────────────────────────────────────────
export const C = {
  navy:    "#1a3a6e",
  navyD:   "#0f2347",
  navyL:   "#dbeafe",
  green:   "#15623a",
  greenL:  "#dcfce7",
  white:   "#ffffff",
  ink:     "#0f172a",
  slate:   "#475569",
  muted:   "#94a3b8",
  border:  "#e2e8f0",
  surface: "#f8fafc",
  amber:   "#e6a817",
};

// ─── Hook animation fade-in ───────────────────────────────────────────────────
const useFadeIn = (ref) => {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true); }, { threshold: 0.15 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return visible;
};

export { useFadeIn };

// ─── Plans landing ────────────────────────────────────────────────────────────
// 3 paliers (19/08/2026 : le palier Premium a été retiré du produit entier —
// PLAN_LIMITS, Stripe, éditeur de tarifs backoffice — aucun tarif Stripe n'a
// jamais existé pour lui et aucun client n'était dessus). Son différenciateur
// (offres & promotions patient) est porté par le palier Pro.
// @conformite-tarifs 29/08/2026 — Phase 1 chantier tarification : nouveaux
// prix officiels et libellés (Essentiel/Fluidité/Performance), resynchronisés
// à l'exécution par loadPlanLimits() (plans.js) — valeurs ci-dessous = repli
// avant ce premier chargement uniquement.
// @conformite-tarifs 04/09/2026 — la page d'accueil n'avait jamais reçu le
// détail complet des offres (positionnement + liste de fonctionnalités
// exhaustive) défini pendant le chantier tarification : seul BillingModule.jsx
// (page /tarifs) l'avait. priceAnnual/le badge "RECOMMANDÉ" étaient également
// restés sur leurs anciennes valeurs ("1 mois offert", "LE PLUS CHOISI") alors
// que le reste de l'app est passé à "2 mois offerts" en Phase 1. `includesPrev`
// référence le palier précédent pour le "Tout ce qui est inclus dans X, plus :"
// — features listées ici = uniquement ce que CE palier ajoute.
const PLANS = [
  {
    id: "starter", name: "Essentiel", price: 39, priceAnnual: 390, icon: "🌱", color: "#0369a1",
    positioning: "Pour les pharmacies souhaitant simplement recevoir et traiter efficacement les ordonnances.",
    features: [
      "Réception des ordonnances : QR Code, upload direct par le patient, ou email dédiée",
      "OCR local dans le navigateur avec extraction automatique des informations",
      "Impression optimisée : conversion PDF→image, multi-pages, photos HEIC",
      "Dashboard avec vue liste et statuts de traitement",
      "Jusqu'à 3 postes vendeurs, avec QR Code personnalisé pour la pharmacie",
      "Journal d'activité et audit des actions",
      "Purge automatique selon la politique de rétention, RLS sur les données sensibles",
      "Support standard",
    ],
  },
  {
    id: "standard", name: "Fluidité", price: 59, priceAnnual: 590, icon: "⭐", color: C.navy, popular: true,
    positioning: "Fluidifier le parcours patient, réduire les frictions au comptoir et améliorer l'expérience d'attente.",
    includesPrev: "Essentiel",
    features: [
      "Jusqu'à 10 postes vendeurs",
      "Sonnette patient : appel + vibration + affichage \"C'est votre tour !\" quand la commande est prête",
      "Vue carte des ordonnances avec filtrage avancé",
      "Stories santé et promotions de la pharmacie affichées aux patients",
      "Création d'offres depuis un catalogue PDF fournisseur : sélection des pages, publiées en stories plein écran zoomables",
      "Création d'offres depuis le téléphone : lien magique à scanner, prise de photo produit sans connexion",
      "Modèles d'offres prêts à l'emploi, et réservations de produits (encaissement au comptoir)",
      "Module Avis Google — lien direct vers la page d'avis de la pharmacie",
      "Statistiques de consultation des contenus",
      "Support prioritaire",
      "Kit QR Code offert avec engagement annuel",
    ],
  },
  {
    id: "pro", name: "Performance", price: 89, priceAnnual: 890, icon: "🏥", color: "#4c1d95",
    positioning: "Pour les pharmacies souhaitant utiliser pleinement OrdoMail comme outil de fluidification et de communication auprès des patients.",
    includesPrev: "Fluidité",
    features: [
      "Rappels de renouvellement d'ordonnance : cycle de relance automatique, réponse du patient en un clic, suivi en temps réel sans ressaisie",
      "Postes vendeurs illimités",
      "Plusieurs QR Codes par pharmacie, dédiés à différentes zones ou usages",
      "Personnalisation avancée des contenus affichés aux patients",
      "Statistiques avancées : interactions avec les stories et les promotions",
      "Accompagnement onboarding et support prioritaires, accès anticipé aux nouvelles fonctionnalités",
      "Kit matériel premium inclus avec engagement annuel",
    ],
  },
];

export { PLANS };
