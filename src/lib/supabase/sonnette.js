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
  const { error } = await sb.from('appels_patient').insert({
    pharmacie_id: pharmacieId,
    code_patient: codePatient,
  });
  return { ok: !error };
}

// Patient → écouter les appels (Realtime)
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
  // Mode prod : Supabase Realtime
  const sb = getSupabase();
  const channel = sb.channel(`appels:${pharmacieId}:${codePatient}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'appels_patient',
      filter: `pharmacie_id=eq.${pharmacieId}`,
    }, (payload) => {
      if (payload.new?.code_patient === codePatient) {
        callback(payload.new);
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
