import { useState, useEffect, useRef } from "react";

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

export function toDateKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  return d.toISOString().split("T")[0];
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
const PLANS = [
  { id: "starter",  name: "Starter",  price: 19, icon: "🌱", color: "#0369a1", features: ["2 postes", "200 ordonnances/mois", "QR Code + Email", "Logs & export CSV"] },
  { id: "standard", name: "Standard", price: 39, icon: "⭐", color: C.navy,    features: ["5 postes", "1 000 ordonnances/mois", "SMTP personnalisé", "Support prioritaire"], popular: true },
  { id: "pro",      name: "Pro",      price: 79, icon: "🏥", color: "#4c1d95", features: ["Postes illimités", "Volume illimité", "Intégration LGO", "SLA 99,9 %"] },
];

export { PLANS };
