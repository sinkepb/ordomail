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

export async function createRappel(pharmacieId, { nom, prenom, telephone, dateRappel, commentaire, consentement }) {
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
      date_prochaine_relance: dateRappel ? new Date(dateRappel).toISOString() : new Date(Date.now() + 21 * 86400000).toISOString(),
      created_at: new Date().toISOString(),
    };
    ph.rappels.unshift(rappel);
    return rappel;
  }
  return await callSecureData('rappels_create', { nom, prenom, telephone, dateRappel, commentaire, consentement });
}

export async function traiterRappel(rappelId, dateRappel = null) {
  if (IS_DEMO) return { success: true };
  return await callSecureData('rappels_traiter', { rappelId, dateRappel });
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

export async function updateRappel(rappelId, { nom, prenom, telephone, dateRappel, commentaire }) {
  if (IS_DEMO) return { success: true };
  return await callSecureData('rappels_update', { rappelId, nom, prenom, telephone, dateRappel, commentaire });
}

// Déclenchement manuel du SMS (06/09/2026, sender OVH "SISEO" validé le
// 11/09/2026). `email` reste géré côté serveur pour du débogage ponctuel
// mais n'est plus exposé dans l'interface — voir secure-data:rappels_envoyer_test.
export async function envoyerTestRappel(rappelId, email) {
  if (IS_DEMO) return { success: true };
  return await callSecureData('rappels_envoyer_test', { rappelId, email });
}

// Quota SMS mensuel (11/09/2026) — voir _shared/smsQuota.ts pour le détail
// du calcul (200 SMS/mois inclus dans Performance + packs de 100 achetés).
export async function fetchSmsConsommation() {
  if (IS_DEMO) return null;
  try {
    return await callSecureData('sms_consommation', {});
  } catch (e) {
    console.error('[fetchSmsConsommation]', e.message);
    return null;
  }
}

// Achat d'un pack de 100 SMS supplémentaires — retourne l'URL Stripe
// Checkout (paiement ponctuel), voir secure-data:sms_acheter_pack.
export async function acheterPackSms(appUrl) {
  if (IS_DEMO) throw new Error('Achat de pack SMS indisponible en démo');
  return await callSecureData('sms_acheter_pack', { appUrl });
}
