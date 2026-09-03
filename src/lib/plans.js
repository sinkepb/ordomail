// ─── Définition des plans et logique d'upgrade ───────────────────────────────
import { PLANS } from "./utils.js";

// @conformite-tarifs 29/08/2026 — Phase 1 du chantier tarification : nouveaux
// prix officiels (39/59/89 €/mois) et libellés commerciaux (Essentiel/
// Fluidité/Performance) — id techniques starter/standard/pro conservés
// (décision explicite, aucun code métier à toucher pour un changement
// purement commercial). priceAnnual change de SIGNIFICATION : ce n'est plus
// un tarif mensuel équivalent (×12 pour obtenir le total) mais le TOTAL
// ANNUEL réel facturé une fois par an ("10 mois payés pour 12 mois d'usage",
// 2 mois offerts — 39×10=390 etc.), aligné sur les Price Stripe
// price_{plan}_annual réellement créés (interval=year, montant exact).
export const PLAN_LIMITS = {
  starter:  { id:"starter",  maxPostes: 3,   maxOrdos: 200,   label:"Essentiel",   price:39, priceAnnual:390, icon:"🌱", color:"#0369a1", offresStories: false },
  standard: { id:"standard", maxPostes: 10,  maxOrdos: 1000,  label:"Fluidité",    price:59, priceAnnual:590, icon:"⭐", color:"#1a3a6e", offresStories: true },
  pro:      { id:"pro",      maxPostes: 999, maxOrdos: 99999, label:"Performance", price:89, priceAnnual:890, icon:"🏥", color:"#4c1d95", offresStories: true },
};

// Palier Premium retiré (19/08/2026) — aucun tarif Stripe n'a jamais existé
// pour lui (price_premium_monthly/annual absents), aucun client dessus.
export const PLAN_ORDER = ["starter","standard","pro"];

// Kit matériel (3 stickers sol, 3 supports panneau acrylique, 1 présentoir
// plexiglas 1m) envoyé à l'inscription — prix et "offert si annuel"
// paramétrables en backoffice (PricingEditor.jsx), rechargés par
// loadPlanLimits() comme PLAN_LIMITS. Repli par défaut ci-dessous si le
// chargement échoue.
export const KIT_MATERIEL = { prix: 149, offertSiAnnuel: true, actif: true };

// @conformite-tarifs 25/08/2026 — les valeurs ci-dessus sont le repli par
// défaut (démo, ou si le chargement échoue). L'admin édite les tarifs réels
// dans `pricing_plans` (backoffice, onglet Tarifs) ; jusqu'ici rien d'autre
// dans l'app ne relisait cette table — la sauvegarde persistait bien en
// base, mais landing page/checkout/dashboard continuaient d'afficher ces
// valeurs codées en dur jusqu'au prochain déploiement. loadPlanLimits()
// mute PLAN_LIMITS en place (import { PLAN_LIMITS } from ce module reste
// valide partout) avec ce que le backoffice a réellement enregistré ;
// fusionne (ne remplace pas) pour ne jamais perdre un champ absent de la
// table (ex. offresStories, propre au frontend, pas stocké côté DB).
//
// Deuxième source à resynchroniser : lib/utils.js:PLANS, consommé UNIQUEMENT
// par la section tarifs de LandingPage.jsx — un tableau distinct, avec ses
// propres price/icon/color codés en dur, jamais relié ni à PLAN_LIMITS ni à
// pricing_plans. C'est celui que voit un visiteur non connecté ; l'oublier
// aurait laissé le prix affiché sur la page d'accueil désynchronisé de tout
// le reste après une modification dans l'éditeur de tarifs.
export async function loadPlanLimits() {
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    if (!supabaseUrl) return; // mode démo — pas de backend à interroger
    const res = await fetch(`${supabaseUrl}/functions/v1/get-pricing`, { method: "POST" });
    const { data, kit } = await res.json();
    if (kit) {
      KIT_MATERIEL.prix = kit.prix;
      KIT_MATERIEL.offertSiAnnuel = kit.offert_si_annuel;
      KIT_MATERIEL.actif = kit.actif;
    }
    if (!Array.isArray(data)) return;
    data.forEach(p => {
      PLAN_LIMITS[p.id] = {
        ...PLAN_LIMITS[p.id],
        id: p.id, label: p.label, icon: p.icon, color: p.color,
        price: p.price, priceAnnual: p.price_annual,
        maxPostes: p.max_postes, maxOrdos: p.max_ordos,
        // @fix 29/08/2026 (Phase 2) — jusqu'ici offresStories restait bloqué
        // sur son repli codé en dur ci-dessus (jamais synchronisé depuis
        // pricing_plans, contrairement à price/maxPostes) : le backoffice
        // pouvait "activer" la fonctionnalité pour un plan sans aucun effet
        // réel. sonnette est un nouveau champ, même mécanisme.
        offresStories: !!p.feature_offres_stories,
        sonnette: !!p.feature_sonnette,
      };
      const landing = PLANS.find(l => l.id === p.id);
      if (landing) {
        landing.name = p.label;
        landing.icon = p.icon;
        landing.color = p.color;
        landing.price = p.price;
      }
    });
  } catch {
    // Réseau indisponible / fonction pas encore déployée : on garde les
    // valeurs par défaut ci-dessus plutôt que de bloquer le démarrage.
  }
}

// Couche centrale de gestion des fonctionnalités/limites par plan (Phase 2
// tarification, §14) — à utiliser partout plutôt que de re-tester
// `plan === "standard"` en dur. Purement indicatif côté client (UI) : la
// vérification qui compte reste côté serveur (RLS + edge functions, voir
// plan_has_feature() SQL et _shared/planFeatures.ts).
export function hasFeature(plan, feature) {
  return !!(PLAN_LIMITS[plan] || PLAN_LIMITS.starter)[feature];
}

export function getLimit(plan, limit) {
  return (PLAN_LIMITS[plan] || PLAN_LIMITS.starter)[limit];
}

export function getNextPlan(currentPlan) {
  const idx = PLAN_ORDER.indexOf(currentPlan);
  return PLAN_ORDER[idx+1] || null;
}

export function getPrevPlan(currentPlan) {
  const idx = PLAN_ORDER.indexOf(currentPlan);
  return idx > 0 ? PLAN_ORDER[idx-1] : null;
}

export function computeImpact(pharmacie, postes, newPlanId) {
  const curr   = PLAN_LIMITS[pharmacie.plan] || PLAN_LIMITS.starter;
  const next   = PLAN_LIMITS[newPlanId]      || PLAN_LIMITS.starter;
  const actifs = (postes || []).filter(p => p.actif).length;
  return {
    curr,
    next,
    isUpgrade:       PLAN_ORDER.indexOf(newPlanId) > PLAN_ORDER.indexOf(pharmacie.plan),
    postesActuels:   actifs,
    postesASusprimer: Math.max(0, actifs - next.maxPostes),
    priceDiff:       next.price - curr.price,
  };
}

export function canAddPoste(plan, postes) {
  const limit = PLAN_LIMITS[plan]?.maxPostes || 2;
  return (postes || []).filter(p => p.actif).length < limit;
}
