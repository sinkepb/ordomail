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
  // @fix 03/09/2026 — même bug que subscribeToOffres ci-dessous (StrictMode :
  // double montage/démontage avant que removeChannel() de l'instance
  // précédente n'ait fini, sb.channel(nom) réutilise alors un canal déjà
  // subscribe() → "cannot add postgres_changes callbacks... after
  // subscribe()"). Repéré en testant subscribeToOffres sur cette même page
  // (Dashboard), pas introduit par elle — ordonnances:${pharmacieId} avait le
  // même nom fixe depuis toujours.
  const channel = sb.channel(`ordonnances:${pharmacieId}:${Date.now()}:${Math.random().toString(36).slice(2)}`)
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

// Offres mobile (03/09/2026) — la publication d'une offre depuis le mobile
// doit apparaître instantanément côté PC (OffresSection.jsx) ET côté écran
// patient (PatientPage.jsx) sans rafraîchissement manuel. offres_stories a
// une policy SELECT publique pour les lignes actif=true (public_read_offres_
// actives) : un abonné anon (patient) reçoit donc bien les INSERT/UPDATE/
// DELETE tant que la ligne reste actif=true — c'est notamment le cas du
// passage epuise=true (rupture), qui doit rester visible pour afficher
// "Produit en rupture" plutôt que de simplement disparaître silencieusement.
// Contrairement à subscribeToPharmacy, le callback reçoit directement
// {eventType, new, old} (pas de refetch global) : PatientPage/OffresSection
// ont besoin de mettre à jour UNE ligne dans leur liste locale, pas de tout
// recharger à chaque événement.
export function subscribeToOffres(pharmacieId, onChange) {
  if (IS_DEMO) return () => {};
  const sb = getSupabase();
  // Nom de canal rendu unique par abonnement (pas juste `offres:${pharmacieId}`) —
  // repéré en testant sous StrictMode (double montage/démontage de OffresSection.jsx/
  // PatientPage.jsx en dev) : sb.channel(nom) réutilise l'instance existante si le
  // premier canal n'a pas fini son removeChannel() (asynchrone) avant le second
  // montage, et Supabase Realtime refuse d'ajouter un .on() sur un canal déjà
  // subscribe() — "cannot add postgres_changes callbacks... after subscribe()".
  // postgres_changes n'a pas besoin d'un nom de canal partagé entre clients
  // (contrairement au broadcast de sonnette.js) : chaque abonné écoute le WAL
  // indépendamment, un nom unique par instance est donc sans risque.
  const channel = sb.channel(`offres:${pharmacieId}:${Date.now()}:${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'offres_stories',
      filter: `pharmacie_id=eq.${pharmacieId}`,
    }, (payload) => onChange(payload))
    .subscribe();
  return () => sb.removeChannel(channel);
}
