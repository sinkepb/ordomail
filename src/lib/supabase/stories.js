// ─── Stories/offres : intérêts patients, métriques d'engagement, catalogue ────
// Extrait de src/supabase.js (27/07/2026) — voir src/supabase.js.
import { IS_DEMO, getDB, callSecureData } from './client.js';

// ─── Intérêts patients pour les offres ───────────────────────────────────────
export async function fetchInteretsParCode(pharmacieId, codePatient) {
  if (IS_DEMO) return [];
  const today = new Date().toISOString().split("T")[0];
  try {
    return await callSecureData('offre_interets', { codePatient, dateJour: today }) || [];
  } catch(e) {
    console.error('[fetchInteretsParCode]', e.message);
    return [];
  }
}

// Charger tous les intérêts du jour pour une pharmacie (pour le dashboard)
export async function fetchInteretsDuJour(pharmacieId) {
  if (IS_DEMO) {
    // Mode démo : lire depuis window.__ordomailDB
    const db = getDB ? getDB() : window.__ordomailDB;
    const today = new Date().toISOString().split("T")[0];
    return (db?.offre_interets || []).filter(
      i => i.pharmacie_id === pharmacieId && i.date_jour === today
    );
  }
  const today = new Date().toISOString().split("T")[0];
  try {
    return await callSecureData('offre_interets', { dateJour: today }) || [];
  } catch(e) {
    console.error('[fetchInteretsDuJour]', e.message);
    return [];
  }
}

// Charger les métriques de consultation des stories (vue, temps passé, actions)
// pour une pharmacie — pas encore branché sur un écran dédié, disponible pour
// analyse ponctuelle ou un futur tableau de bord d'engagement patient.
export async function fetchStoryMetrics(pharmacieId, params = {}) {
  if (IS_DEMO) return [];
  try {
    return await callSecureData('story_metrics', params) || [];
  } catch(e) {
    console.error('[fetchStoryMetrics]', e.message);
    return [];
  }
}

// Catalogue de stories (global, stories_content) fusionné avec l'état
// actif/inactif propre à cette pharmacie — pour l'écran titulaire de
// sélection des stories publiées à ses patients.
// pharmacieId non utilisé ici : callSecureData scope déjà la requête via le
// jeton du titulaire authentifié (voir secure-data), pas via un ID fourni par
// le client — conservé dans la signature pour la cohérence des appels.
export async function fetchPharmacieStories(_pharmacieId) {
  if (IS_DEMO) return [];
  try {
    return await callSecureData('pharmacie_stories', {}) || [];
  } catch(e) {
    console.error('[fetchPharmacieStories]', e.message);
    return [];
  }
}

// Active/désactive une story du catalogue pour cette pharmacie uniquement.
export async function updatePharmacieStorySelection(pharmacieId, storyId, actif) {
  if (IS_DEMO) return { ok: true };
  try {
    await callSecureData('pharmacie_stories_write', { storyId, actif });
    return { ok: true };
  } catch(e) {
    console.error('[updatePharmacieStorySelection]', e.message);
    return { ok: false, error: e.message };
  }
}
