// ─── Abonnements & facturation ────────────────────────────────────────────────
// Extrait de src/supabase.js (27/07/2026) — voir src/supabase.js.
import { IS_DEMO, getSupabase, getDB } from './client.js';

export async function fetchAbonnement(pharmacieId) {
  if (IS_DEMO) return null; // géré par PLAN_LIMITS + pharmacie.plan
  const sb = getSupabase();
  const { data } = await sb.from('abonnements').select('*').eq('pharmacie_id', pharmacieId).single();
  return data;
}

export async function fetchFactures(pharmacieId) {
  if (IS_DEMO) return []; // les factures mock sont générées dans CompteSection
  const sb = getSupabase();
  const { data } = await sb.from('factures').select('*').eq('pharmacie_id', pharmacieId).order('created_at', { ascending: false });
  return data || [];
}

export async function changePlan(pharmacieId, newPlan, billing = "monthly") {
  if (IS_DEMO) {
    const db = getDB();
    const ph = db.pharmacies.find(p => p.id === pharmacieId);
    if (ph) ph.plan = newPlan;
    return { success: true };
  }
  const sb = getSupabase();
  // Toujours passer par l'edge function (change-plan met à jour l'abonnement
  // Stripe ET pharmacies.plan). Avant le 19/08/2026, un échec de cet appel
  // retombait sur un simple UPDATE de pharmacies.plan sans jamais toucher
  // Stripe — l'app affichait le nouveau plan mais Stripe continuait de
  // prélever l'ancien prix au renouvellement suivant, désynchro invisible
  // jusqu'à ce que le client remarque le mauvais montant. Laisser l'erreur
  // remonter permet à PlanSwitcher (UpgradeModal.jsx) d'afficher son écran
  // d'échec au lieu de faire croire que le changement a réussi.
  // @fix 29/08/2026 (Phase 5 tarification) — billing n'était jamais envoyé :
  // le sélecteur mensuel/annuel du PlanSwitcher (UpgradeModal.jsx) changeait
  // l'affichage des prix mais n'avait aucun effet réel, change-plan
  // retombant systématiquement sur son défaut "monthly" côté serveur.
  const { data, error } = await sb.functions.invoke('change-plan', { body: { pharmacieId, newPlan, billing } });
  if (error) {
    let message = error.message || 'Échec du changement de plan';
    try {
      const body = await error.context?.json();
      if (body?.error) message = body.error;
    } catch { /* garde le message par défaut */ }
    throw new Error(message);
  }
  return data;
}
