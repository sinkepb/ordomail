// ─── Pharmacies (lecture/écriture profil, postes) ─────────────────────────────
// Extrait de src/supabase.js (27/07/2026) — voir src/supabase.js.
import { IS_DEMO, getSupabase, getDB, getVendeurToken, callSecureData } from './client.js';

export async function fetchPharmacie(pharmacieId) {
  if (IS_DEMO) {
    const db = getDB();
    return db.pharmacies.find(p => p.id === pharmacieId) || null;
  }
  // Un poste vendeur (jeton, pas de session Supabase Auth) n'a plus le droit de lire
  // pharmacies/pharmacie_postes en direct avec la clé anon (RLS phase 1) — et n'a de
  // toute façon pas besoin des postes/PIN, réservés aux écrans titulaire.
  if (getVendeurToken()) {
    const data = await callSecureData('pharmacie_info', {});
    return data ? { ...data, emailReception: data.email_reception, postes: [] } : null;
  }
  const sb = getSupabase();
  const { data, error } = await sb.from('pharmacies').select('*, pharmacie_postes(*)').eq('id', pharmacieId).single();
  if (error) throw error;
  // Normaliser pharmacie_postes → postes pour compatibilité dashboard
  if (data && data.pharmacie_postes) {
    data.postes = data.pharmacie_postes;
  }
  // email_reception (snake_case, colonne DB) → emailReception (camelCase, attendu par
  // ParametresTab) : sans ce mapping l'écran "Configuration email" retombe sur l'UUID
  // brut de la pharmacie au lieu de l'adresse lisible générée par register-pharmacie.
  if (data) data.emailReception = data.email_reception;
  return data;
}

// ─── Lecture publique (page patient via QR code, non authentifiée) ───────────
// ⚠️ Ne JAMAIS remplacer par fetchPharmacie() ici : celle-ci fait un select('*, pharmacie_postes(*)')
// et renvoyait donc — avant le 23/07/2026 — les PIN des postes vendeur en clair à
// n'importe quel patient ouvrant le lien QR de la pharmacie. On ne sélectionne ici
// que les colonnes strictement nécessaires au formulaire patient.
export async function fetchPharmaciePublic(pharmacieId) {
  if (IS_DEMO) {
    const db = getDB();
    const ph = db.pharmacies.find(p => p.id === pharmacieId);
    if (!ph) return null;
    return { id: ph.id, nom: ph.nom, couleur: ph.couleur, emailReception: ph.emailReception, sonnette_active: ph.sonnette_active };
  }
  const sb = getSupabase();
  const { data, error } = await sb
    .from('pharmacies')
    .select('id, nom, couleur, email_reception, sonnette_active')
    .eq('id', pharmacieId)
    .maybeSingle();
  if (error || !data) return null;
  return { ...data, emailReception: data.email_reception };
}

export async function savePharmacie(pharmacieId, patch) {
  if (IS_DEMO) {
    const db = getDB();
    const i = db.pharmacies.findIndex(p => p.id === pharmacieId);
    if (i >= 0) db.pharmacies[i] = { ...db.pharmacies[i], ...patch };
    return db.pharmacies[i];
  }
  const sb = getSupabase();
  const { data, error } = await sb.from('pharmacies').update(patch).eq('id', pharmacieId).select().single();
  if (error) throw error;
  return data;
}

export async function savePostes(pharmacieId, postes, pinChanges = {}) {
  if (IS_DEMO) {
    const db = getDB();
    const ph = db.pharmacies.find(p => p.id === pharmacieId);
    if (ph) {
      // Appliquer les changements de PIN
      ph.postes = postes.map(p => ({
        ...p,
        pin: pinChanges[p.id] !== undefined ? pinChanges[p.id] : p.pin
      }));
    }
    return ph?.postes || postes;
  }
  const sb = getSupabase();
  // Upsert postes
  const rows = postes.map(p => ({ ...p, pharmacie_id: pharmacieId }));
  const { data, error } = await sb.from('pharmacie_postes').upsert(rows).select();
  if (error) throw error;
  // Mettre à jour les PINs via Edge Function (bcrypt)
  for (const [posteId, newPin] of Object.entries(pinChanges)) {
    if (newPin && /^\d{4}$/.test(newPin)) {
      await sb.functions.invoke('update-pin', { body: { posteId, pin: newPin } });
    }
  }
  return data;
}
