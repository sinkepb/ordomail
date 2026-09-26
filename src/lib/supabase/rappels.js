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

// Historique détaillé d'un rappel (07/09/2026) — voir secure-data:rappels_journal.
export async function fetchRappelJournal(rappelId) {
  if (IS_DEMO) return [];
  try {
    return await callSecureData('rappels_journal', { rappelId });
  } catch (e) {
    console.error('[fetchRappelJournal]', e.message);
    return [];
  }
}

// Statistiques d'efficacité côté pharmacien (08/09/2026) — voir secure-data:rappels_stats.
export async function fetchRappelsStats() {
  if (IS_DEMO) return null;
  try {
    return await callSecureData('rappels_stats', {});
  } catch (e) {
    console.error('[fetchRappelsStats]', e.message);
    return null;
  }
}

export async function createRappel(pharmacieId, { nom, prenom, telephone, dateRappel, commentaire, consentement, medecinPrescripteur, specialite, ordonnanceId }) {
  if (IS_DEMO) {
    const db = getDB();
    const ph = db.pharmacies.find(p => p.id === pharmacieId);
    if (!ph) return null;
    if (!ph.rappels) ph.rappels = [];
    const rappel = {
      id: `r${Date.now()}`, pharmacie_id: pharmacieId,
      patient_nom: nom, patient_prenom: prenom, patient_telephone: telephone,
      commentaire: commentaire || null, medecin_prescripteur: medecinPrescripteur || null, specialite: specialite || null, consentement_sms: !!consentement,
      statut: 'en_attente', choix_patient: null, cycle_numero: 1,
      ordonnance_id: ordonnanceId || null,
      date_prochaine_relance: dateRappel ? new Date(dateRappel).toISOString() : new Date(Date.now() + 21 * 86400000).toISOString(),
      created_at: new Date().toISOString(),
    };
    ph.rappels.unshift(rappel);
    return rappel;
  }
  return await callSecureData('rappels_create', { nom, prenom, telephone, dateRappel, commentaire, consentement, medecinPrescripteur, specialite, ordonnanceId });
}

// Fichier de l'ordonnance liée à un rappel (26/09/2026) — voir
// secure-data:rappels_ordonnance_fichier. Renvoie null si le rappel n'a pas
// d'ordonnance liée (créé avant cette fonctionnalité, ou ordonnance depuis
// supprimée).
export async function fetchRappelOrdonnance(rappelId) {
  if (IS_DEMO) return null;
  try {
    return await callSecureData('rappels_ordonnance_fichier', { rappelId });
  } catch (e) {
    console.error('[fetchRappelOrdonnance]', e.message);
    return null;
  }
}

export async function traiterRappel(rappelId, dateRappel = null) {
  if (IS_DEMO) return { success: true };
  return await callSecureData('rappels_traiter', { rappelId, dateRappel });
}

// Marque un rappel "préparé" (26/09/2026) — médicament préparé et rangé
// dans un casier physique, en attente de retrait patient. Voir
// secure-data:rappels_preparer pour l'attribution du numéro de casier
// (compteur circulaire 00-99, jamais un tirage aléatoire).
export async function preparerRappel(rappelId) {
  if (IS_DEMO) return { success: true, caseCode: "DM00" };
  return await callSecureData('rappels_preparer', { rappelId });
}

export async function terminerRappel(rappelId) {
  if (IS_DEMO) return { success: true };
  return await callSecureData('rappels_terminer', { rappelId });
}

// Réactive un rappel terminé (07/09/2026) — repart sur le même patient sans
// recréer un rappel depuis zéro. Voir secure-data:rappels_reactiver.
export async function reactiverRappel(rappelId, dateRappel = null) {
  if (IS_DEMO) return { success: true };
  return await callSecureData('rappels_reactiver', { rappelId, dateRappel });
}

export async function updateRappel(rappelId, { nom, prenom, telephone, dateRappel, commentaire, medecinPrescripteur, specialite }) {
  if (IS_DEMO) return { success: true };
  return await callSecureData('rappels_update', { rappelId, nom, prenom, telephone, dateRappel, commentaire, medecinPrescripteur, specialite });
}

// Déclenchement manuel du SMS (06/09/2026, sender OVH "SISEO" validé le
// 11/09/2026). `email` reste géré côté serveur pour du débogage ponctuel
// mais n'est plus exposé dans l'interface — voir secure-data:rappels_envoyer_test.
export async function envoyerTestRappel(rappelId, email) {
  if (IS_DEMO) return { success: true };
  return await callSecureData('rappels_envoyer_test', { rappelId, email });
}

// Quota SMS mensuel (15/09/2026) — voir _shared/smsQuota.ts pour le détail du
// calcul (100 SMS/mois inclus dans Performance). Le dépassement n'est plus
// acheté manuellement (pack) : il est facturé automatiquement en fin de mois
// par l'edge function facturer-depassement-sms, à 0,10 €/SMS — cette fonction
// reste purement informative.
export async function fetchSmsConsommation() {
  if (IS_DEMO) return null;
  try {
    return await callSecureData('sms_consommation', {});
  } catch (e) {
    console.error('[fetchSmsConsommation]', e.message);
    return null;
  }
}
