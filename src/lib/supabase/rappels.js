// ─── Rappels de renouvellement d'ordonnance ────────────────────────────────
// 04/09/2026 — voir supabase/migrations/20260904_rappels_ordonnance.sql pour
// le cycle de statut (en_attente → sms_envoye → a_traiter → en_attente
// [cycle suivant] → … → termine).
import { estNumeroFixe } from "../telephone.js";
import { IS_DEMO, getDB, callSecureData } from './client.js';
import { createOrdonnanceManuelle, deleteOrdonnance } from './ordonnances.js';

// Détection fixe/mobile par préfixe (01/10/2026) — même règle que
// supabase/functions/_shared/telephone.ts, dupliquée ici car le mode démo
// (sans appel serveur) doit déterminer lui-même le mode de contact.
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
      mode_contact: estNumeroFixe(telephone) ? 'appel' : 'sms',
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
// ordonnanceId (08/11/2026) : un rappel peut avoir plusieurs ordonnances
// jointes — sans lui, le serveur renvoie la première (ancien comportement).
export async function fetchRappelOrdonnance(rappelId, ordonnanceId = null) {
  if (IS_DEMO) return null;
  try {
    return await callSecureData('rappels_ordonnance_fichier', { rappelId, ordonnanceId });
  } catch (e) {
    console.error('[fetchRappelOrdonnance]', e.message);
    return null;
  }
}

// Ordonnances jointes d'un rappel, normalisées en [{ id, name, type }]
// (08/11/2026). `fichiers` vient de secure-data:rappels_list ; s'il est absent
// (liste servie par une ancienne version, ou événement temps réel qui n'a que
// la ligne brute), on retombe sur l'ancien champ ordonnance_id — sans nom de
// fichier connu, d'où le libellé générique.
export function ordonnancesDuRappel(rappel) {
  if (Array.isArray(rappel?.fichiers)) return rappel.fichiers;
  return rappel?.ordonnance_id ? [{ id: rappel.ordonnance_id, name: 'ordonnance', type: 'image' }] : [];
}

// Ajoute une ordonnance (photo/PDF/TIFF depuis l'ordinateur) à un rappel
// existant (08/11/2026). Deux temps côté serveur, volontairement : création de
// l'ordonnance + upload (ordonnances_create : validation du fichier, TIFF→PNG,
// même garde-fous que partout ailleurs), puis rattachement au rappel
// (rappels_ordonnance_lier). Si le rattachement échoue, l'ordonnance fraîchement
// créée n'a plus aucune raison d'exister : on la supprime plutôt que de la
// laisser orpheline dans la file Ordonnances.
export async function ajouterOrdonnanceRappel(pharmacieId, rappelId, file) {
  if (IS_DEMO) {
    const db = getDB();
    const ph = db.pharmacies.find(p => p.id === pharmacieId);
    const r = ph?.rappels?.find(x => x.id === rappelId);
    if (!r) throw new Error('Rappel introuvable');
    const fichier = { id: `ordo-manuel-${Date.now()}`, name: file.name, type: file.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'image' };
    r.fichiers = [...(r.fichiers || []), fichier];
    return fichier;
  }
  const created = await createOrdonnanceManuelle(pharmacieId, file);
  if (!created?.id) throw new Error("Échec de l'ajout de l'ordonnance.");
  try {
    const res = await callSecureData('rappels_ordonnance_lier', { rappelId, ordonnanceId: created.id });
    return res.fichier;
  } catch (e) {
    await deleteOrdonnance(created.id, pharmacieId).catch(() => {});
    throw e;
  }
}

// Retire une ordonnance d'un rappel (08/11/2026). Renvoie { ordonnanceSupprimee }
// — vrai si l'ordonnance ajoutée manuellement pour ce rappel a aussi été
// supprimée (jamais pour une ordonnance venue d'un patient, voir
// secure-data:rappels_ordonnance_retirer).
export async function retirerOrdonnanceRappel(pharmacieId, rappelId, ordonnanceId) {
  if (IS_DEMO) {
    const db = getDB();
    const ph = db.pharmacies.find(p => p.id === pharmacieId);
    const r = ph?.rappels?.find(x => x.id === rappelId);
    if (r) r.fichiers = (r.fichiers || ordonnancesDuRappel(r)).filter(f => f.id !== ordonnanceId);
    return { success: true, ordonnanceSupprimee: false };
  }
  return await callSecureData('rappels_ordonnance_retirer', { rappelId, ordonnanceId });
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

// Suppression définitive d'un rappel (02/10/2026) — pour corriger une erreur
// de saisie (mauvais patient, doublon), pas une fin de suivi normale (voir
// terminerRappel). Irréversible : la ligne et son historique d'événements
// (rappels_evenements, ON DELETE CASCADE) disparaissent, contrairement à
// "terminer" qui garde une trace. Voir secure-data:rappels_supprimer.
export async function supprimerRappel(rappelId) {
  if (IS_DEMO) return { success: true };
  return await callSecureData('rappels_supprimer', { rappelId });
}

// Réactive un rappel terminé (07/09/2026) — repart sur le même patient sans
// recréer un rappel depuis zéro. Voir secure-data:rappels_reactiver.
export async function reactiverRappel(rappelId, dateRappel = null, consentement = false) {
  if (IS_DEMO) return { success: true };
  return await callSecureData('rappels_reactiver', { rappelId, dateRappel, consentement });
}

export async function updateRappel(rappelId, { nom, prenom, telephone, dateRappel, commentaire, medecinPrescripteur, specialite }) {
  if (IS_DEMO) return { success: true };
  return await callSecureData('rappels_update', { rappelId, nom, prenom, telephone, dateRappel, commentaire, medecinPrescripteur, specialite });
}

// Déclenchement manuel anticipé du passage en "à appeler" (30/09/2026) —
// pendant de envoyerTestRappel pour un rappel en mode "appel" (numéro fixe,
// patient sans mobile). Voir secure-data:rappels_marquer_a_appeler.
export async function marquerRappelAAppeler(rappelId) {
  if (IS_DEMO) return { success: true };
  return await callSecureData('rappels_marquer_a_appeler', { rappelId });
}

// Enregistre le choix du patient après un appel téléphonique (30/09/2026) —
// pendant du POST anonyme de resolve-rappel (lien SMS), ici déclenché par le
// pharmacien lui-même. Voir secure-data:rappels_enregistrer_appel.
export async function enregistrerAppelRappel(rappelId, choix, detailPartiel) {
  if (IS_DEMO) return { success: true };
  return await callSecureData('rappels_enregistrer_appel', { rappelId, choix, detailPartiel });
}

// Confirme l'appel de clarification d'un renouvellement partiel (01/10/2026)
// — le choix ("partiel") est déjà connu (répondu par le patient via SMS),
// seul l'appel reste à confirmer pour passer à "à traiter". Voir
// secure-data:rappels_confirmer_appel_partiel.
export async function confirmerAppelPartiel(rappelId, detailPartiel) {
  if (IS_DEMO) return { success: true };
  return await callSecureData('rappels_confirmer_appel_partiel', { rappelId, detailPartiel });
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
