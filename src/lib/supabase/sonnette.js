// ─── Sonnette patient (appel vendeur → patient) ───────────────────────────────
// Extrait de src/supabase.js (27/07/2026) — voir src/supabase.js.
import { IS_DEMO, getSupabase } from './client.js';
import { maskId, maskCode } from '../utils.js';

// Activer/désactiver sonnette (admin backoffice)
export async function setSonnetteActive(pharmacieId, active) {
  const sb = getSupabase();
  await sb.from('pharmacies').update({ sonnette_active: active }).eq('id', pharmacieId);
}

// Vendeur → appeler un patient
//
// Audit du 17/08/2026 : appels_patient était lisible anonymement en clair
// (aucune RLS depuis la création de la table — testé par curl direct contre
// l'API REST, sans authentification, retournant les appels de TOUTES les
// pharmacies). La notification patient ne peut plus passer par une lecture
// de table (voir 20260817_secure_appels_patient.sql : SELECT désormais
// réservé au titulaire authentifié de sa pharmacie) — elle passe par un
// canal Realtime Broadcast, qui ne dépend d'aucun droit de lecture SQL et
// n'est donc pas exposable via l'API REST publique. L'INSERT (historique,
// lecture titulaire) est conservé à l'identique.
export async function appellerPatient(pharmacieId, codePatient) {
  console.log("[SONNETTE] appel pharmacie:", maskId(pharmacieId), "code:", maskCode(codePatient), "demo:", IS_DEMO);
  if (IS_DEMO) {
    // Mode démo : event custom sur window
    window.dispatchEvent(new CustomEvent('ordomail:appel', {
      detail: { pharmacie_id: pharmacieId, code_patient: codePatient }
    }));
    console.log("[SONNETTE] event dispatché");
    return { ok: true };
  }
  const sb = getSupabase();

  const insertPromise = sb.from('appels_patient').insert({
    pharmacie_id: pharmacieId,
    code_patient: codePatient,
  });

  const channel = sb.channel(`appels:${pharmacieId}`);
  const broadcastPromise = new Promise((resolve) => {
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        channel
          .send({ type: 'broadcast', event: 'appel', payload: { pharmacie_id: pharmacieId, code_patient: codePatient } })
          .then(() => resolve(true))
          .catch(() => resolve(false));
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        resolve(false);
      }
    });
  });

  const [{ error }] = await Promise.all([insertPromise, broadcastPromise]);
  sb.removeChannel(channel);
  return { ok: !error };
}

// Patient → écouter les appels (Realtime Broadcast — voir commentaire ci-dessus)
export function ecouterAppels(pharmacieId, codePatient, callback) {
  console.log("[SONNETTE] écoute pharmacie:", maskId(pharmacieId), "code:", maskCode(codePatient), "demo:", IS_DEMO);
  if (IS_DEMO) {
    const handler = (e) => {
      console.log("[SONNETTE] event reçu, code event:", maskCode(e.detail?.code_patient), "code attendu:", maskCode(codePatient));
      if (e.detail?.code_patient === codePatient) callback(e.detail);
    };
    window.addEventListener('ordomail:appel', handler);
    return () => window.removeEventListener('ordomail:appel', handler);
  }
  // Mode prod : Supabase Realtime Broadcast
  const sb = getSupabase();
  const channel = sb.channel(`appels:${pharmacieId}`)
    .on('broadcast', { event: 'appel' }, ({ payload }) => {
      if (payload?.code_patient === codePatient) {
        callback(payload);
      }
    })
    .subscribe();
  return () => sb.removeChannel(channel);
}

export async function updateSonnetteActive(pharmacieId, active) {
  if (IS_DEMO) return { ok: true };
  const sb = getSupabase();
  const { error } = await sb.from('pharmacies')
    .update({ sonnette_active: active })
    .eq('id', pharmacieId);
  return { ok: !error };
}
