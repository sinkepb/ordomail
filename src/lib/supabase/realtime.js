// ─── Pub/sub temps réel (mode démo en mémoire / Supabase Realtime en prod) ────
// Extrait de src/supabase.js (27/07/2026) — voir src/supabase.js.
import { IS_DEMO, getSupabase, getDB } from './client.js';

// Pub/sub interne (mode démo) — exporté pour que ordonnances.js (addOrdonnance)
// puisse notifier les mêmes abonnés avec le payload d'origine (l'ordonnance
// ajoutée), un usage distinct de notifyPharmacy() qui notifie avec la pharmacie.
export const _listeners = {};

export function subscribeToPharmacy(pharmacieId, callback) {
  if (IS_DEMO) {
    // Mode démo : pub/sub en mémoire (comportement inchangé)
    if (!_listeners[pharmacieId]) _listeners[pharmacieId] = [];
    _listeners[pharmacieId].push(callback);
    return () => { _listeners[pharmacieId] = (_listeners[pharmacieId] || []).filter(f => f !== callback); };
  }
  // Mode prod : WebSocket Supabase Realtime
  const sb = getSupabase();
  const channel = sb.channel(`ordonnances:${pharmacieId}`)
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'ordonnances',
      filter: `pharmacie_id=eq.${pharmacieId}`
    }, () => callback({ ...getDB()?.pharmacies?.find(p => p.id === pharmacieId) }))
    .subscribe();
  return () => sb.removeChannel(channel);
}

export function notifyPharmacy(pharmacieId) {
  const db = getDB();
  const ph = db.pharmacies.find(p => p.id === pharmacieId);
  if (ph) (_listeners[pharmacieId] || []).forEach(fn => fn(ph));
}
