// ─── Rappels de renouvellement d'ordonnance ────────────────────────────────
// 04/09/2026 — voir supabase/migrations/20260904_rappels_ordonnance.sql pour
// le cycle de statut (en_attente → sms_envoye → a_traiter → en_attente
// [cycle suivant] → … → termine).
import { IS_DEMO, getDB, callSecureData } from './client.js';

export async function fetchRappels(pharmacieId, statut = null) {
  if (IS_DEMO) {
    const db = getDB();
    const ph = db.pharmacies.find(p => p.id === pharmacieId);
    const all = ph?.rappels || [];
    return statut ? all.filter(r => r.statut === statut) : all;
  }
  try {
    return await callSecureData('rappels_list', statut ? { statut } : {});
  } catch (e) {
    console.error('[fetchRappels]', e.message);
    return [];
  }
}

export async function createRappel(pharmacieId, { nom, prenom, telephone, commentaire, consentement }) {
  if (IS_DEMO) {
    const db = getDB();
    const ph = db.pharmacies.find(p => p.id === pharmacieId);
    if (!ph) return null;
    if (!ph.rappels) ph.rappels = [];
    const rappel = {
      id: `r${Date.now()}`, pharmacie_id: pharmacieId,
      patient_nom: nom, patient_prenom: prenom, patient_telephone: telephone,
      commentaire: commentaire || null, consentement_sms: !!consentement,
      statut: 'en_attente', choix_patient: null, cycle_numero: 1,
      date_prochaine_relance: new Date(Date.now() + 21 * 86400000).toISOString(),
      created_at: new Date().toISOString(),
    };
    ph.rappels.unshift(rappel);
    return rappel;
  }
  return await callSecureData('rappels_create', { nom, prenom, telephone, commentaire, consentement });
}

export async function traiterRappel(rappelId) {
  if (IS_DEMO) return { success: true };
  return await callSecureData('rappels_traiter', { rappelId });
}

export async function terminerRappel(rappelId) {
  if (IS_DEMO) return { success: true };
  return await callSecureData('rappels_terminer', { rappelId });
}
