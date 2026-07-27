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

export async function changePlan(pharmacieId, newPlan) {
  if (IS_DEMO) {
    const db = getDB();
    const ph = db.pharmacies.find(p => p.id === pharmacieId);
    if (ph) ph.plan = newPlan;
    return { success: true };
  }
  const sb = getSupabase();
  // Essayer via Edge Function (avec Stripe) d'abord
  try {
    const { data, error } = await sb.functions.invoke('change-plan', { body: { pharmacieId, newPlan } });
    if (!error) return data;
  } catch(e) {
    console.warn('[changePlan] Edge Fn non disponible, fallback direct');
  }
  // Fallback : UPDATE direct en Supabase (sans Stripe)
  const { error: updateErr } = await sb
    .from('pharmacies')
    .update({ plan: newPlan })
    .eq('id', pharmacieId);
  if (updateErr) throw updateErr;
  return { success: true };
}
