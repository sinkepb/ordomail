// ═══════════════════════════════════════════════════════════════════════════════
// ordomail/src/supabase.js
// Couche de persistance — mode DÉMO ou SUPABASE selon VITE_DEMO_MODE
//
// En mode DÉMO  : toutes les fonctions opèrent sur DB (mock en mémoire)
// En mode PROD  : appels Supabase réels (PostgreSQL + Storage + Realtime)
//
// Pour activer Supabase : mettre VITE_DEMO_MODE=false dans .env.local
// ═══════════════════════════════════════════════════════════════════════════════

const IS_DEMO = import.meta.env.VITE_DEMO_MODE === 'true' ||
                !import.meta.env.VITE_SUPABASE_URL ||
                import.meta.env.VITE_SUPABASE_URL === 'https://placeholder.supabase.co';

// ─── Client Supabase (initialisé en mode prod uniquement) ────────────────────
import { createClient } from '@supabase/supabase-js';

let _supabase = null;

function getSupabase() {
  if (_supabase) return _supabase;
  if (IS_DEMO) return null;
  _supabase = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY,
    { auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true } }
  );
  return _supabase;
}

// ─── Référence à la DB mock via pont global window._ordomailDB ───────────────
// App.jsx expose la DB via window._ordomailDB = DB après son initialisation
function getDB() {
  // Essayer le pont global (App.jsx expose window._ordomailDB = DB)
  if (typeof window !== 'undefined' && window._ordomailDB) return window._ordomailDB;
  // Fallback : DB globale si accessible
  if (typeof DB !== 'undefined') return DB;
  throw new Error('DB non disponible — vérifiez que App.jsx est chargé');
}

// Appelé par App.jsx pour exposer la DB au module supabase
export function registerDB(db) {
  if (typeof window !== 'undefined') window._ordomailDB = db;
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Helper interne : récupérer la pharmacie liée à un user ──────────────────
async function _fetchPharmacieForUser(sb, userId) {
  // 1. Trouver le lien pharmacie_users
  // .maybeSingle() retourne null (pas 406) si aucune ligne trouvée
  const { data: link, error: linkErr } = await sb
    .from('pharmacie_users')
    .select('pharmacie_id, role')
    .eq('id', userId)
    .maybeSingle();

  if (linkErr) {
    console.error('[OrdoMail] pharmacie_users query error:', linkErr.message);
    return null;
  }
  if (!link) {
    // Aucune pharmacie liée à cet utilisateur
    // Peut arriver si l'inscription n'est pas finalisée
    console.warn('[OrdoMail] Aucune pharmacie liée pour userId:', userId);
    return null;
  }

  // 2. Récupérer la pharmacie + postes
  const { data: ph, error: phErr } = await sb
    .from('pharmacies')
    .select('*, postes(*)')
    .eq('id', link.pharmacie_id)
    .maybeSingle();

  if (phErr) {
    console.error('[OrdoMail] pharmacies query error:', phErr.message);
    return null;
  }

  return ph ? { ...ph, userRole: link.role } : null;
}

export async function authSignInEmail(email, password) {
  if (IS_DEMO) {
    const db = getDB();
    const ph = db.pharmacies.find(p => p.email === email && p.password === password);
    if (!ph) return { error: new Error('Identifiants incorrects') };
    return { pharmacie: ph, userRole: 'admin', userId: email };
  }
  const sb = getSupabase();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return { error };
  const pharmacie = await _fetchPharmacieForUser(sb, data.user.id);
  if (!pharmacie) {
    // Utilisateur authentifié mais pas encore lié à une pharmacie
    // Créer manuellement la ligne pharmacie_users dans Supabase Dashboard
    return { error: new Error('Compte non configuré — aucune pharmacie liée à cet email. Contactez le support OrdoMail.') };
  }
  return { pharmacie, userRole: pharmacie?.userRole || 'admin', userId: data.user.id };
}

export async function authSignInPIN(pin) {
  if (IS_DEMO) {
    const db = getDB();
    for (const ph of db.pharmacies) {
      const poste = (ph.postes || []).find(p => p.pin === pin && p.actif);
      if (poste) return { pharmacie: ph, poste, userRole: 'vendeur', userId: poste.id, posteNom: poste.nom };
    }
    return { error: new Error('PIN incorrect ou poste inactif') };
  }
  // Mode prod : Edge Function verify-pin (bcrypt côté serveur)
  const sb = getSupabase();
  const { data, error } = await sb.functions.invoke('verify-pin', { body: { pin } });
  if (error || !data?.success) return { error: error || new Error('PIN incorrect') };
  return { pharmacie: data.pharmacie, poste: data.poste, userRole: 'vendeur', userId: data.poste.id, posteNom: data.poste.nom };
}

export async function authSignInPSC() {
  if (IS_DEMO) {
    // Simulation PSC : connexion automatique en 2.2s
    const db = getDB();
    return new Promise(resolve => setTimeout(() => resolve({
      pharmacie: db.pharmacies[0],
      userRole: 'admin',
      userId: 'psc-demo',
      pscUser: { prenom: 'Marie', nom: 'DUPONT', organisation: db.pharmacies[0].nom }
    }), 2200));
  }
  const sb = getSupabase();
  return sb.auth.signInWithOAuth({
    provider: 'keycloak',
    options: { scopes: 'openid profile email', redirectTo: `${window.location.origin}/auth/callback` }
  });
}

export async function authSignOut() {
  if (!IS_DEMO) {
    const sb = getSupabase();
    await sb.auth.signOut();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHARMACIES
// ═══════════════════════════════════════════════════════════════════════════════

export async function fetchPharmacie(pharmacieId) {
  if (IS_DEMO) {
    const db = getDB();
    return db.pharmacies.find(p => p.id === pharmacieId) || null;
  }
  const sb = getSupabase();
  const { data, error } = await sb.from('pharmacies').select('*, postes(*)').eq('id', pharmacieId).single();
  if (error) throw error;
  return data;
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
  const { data, error } = await sb.from('postes').upsert(rows).select();
  if (error) throw error;
  // Mettre à jour les PINs via Edge Function (bcrypt)
  for (const [posteId, newPin] of Object.entries(pinChanges)) {
    if (newPin && /^\d{4}$/.test(newPin)) {
      await sb.functions.invoke('update-pin', { body: { posteId, pin: newPin } });
    }
  }
  return data;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ORDONNANCES
// ═══════════════════════════════════════════════════════════════════════════════

export async function fetchOrdonnances(pharmacieId, days = 7) {
  if (IS_DEMO) {
    const db = getDB();
    const ph = db.pharmacies.find(p => p.id === pharmacieId);
    return ph?.ordonnances || [];
  }
  const sb = getSupabase();
  const since = new Date(); since.setDate(since.getDate() - days);
  const { data, error } = await sb.from('ordonnances').select('*')
    .eq('pharmacie_id', pharmacieId)
    .gte('received_at', since.toISOString())
    .order('received_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(normOrdo);
}

export async function updateOrdoStatus(ordoId, pharmacieId, status) {
  if (IS_DEMO) {
    const db = getDB();
    const ph = db.pharmacies.find(p => p.id === pharmacieId);
    if (ph) ph.ordonnances = ph.ordonnances.map(o =>
      o.id === ordoId ? { ...o, status, printedAt: status === 'imprime' ? new Date().toISOString() : null } : o
    );
    return;
  }
  const sb = getSupabase();
  await sb.from('ordonnances').update({
    status,
    printed_at: status === 'imprime' ? new Date().toISOString() : null
  }).eq('id', ordoId);
}

export async function updateOrdoExtracted(ordoId, pharmacieId, extracted) {
  if (IS_DEMO) {
    const db = getDB();
    const ph = db.pharmacies.find(p => p.id === pharmacieId);
    if (ph) ph.ordonnances = ph.ordonnances.map(o => o.id === ordoId ? { ...o, extracted } : o);
    return;
  }
  const sb = getSupabase();
  await sb.from('ordonnances').update({
    patient_nom: extracted.nom, patient_cv: extracted.carteVitale,
    medecin: extracted.medecin, medicaments: extracted.medicaments || [],
  }).eq('id', ordoId);
}

export async function uploadOrdoFile(pharmacieId, ordoId, file, dataUrl) {
  if (IS_DEMO) {
    // Mode démo : stocker dataUrl en mémoire
    const db = getDB();
    const ph = db.pharmacies.find(p => p.id === pharmacieId);
    if (ph) ph.ordonnances = ph.ordonnances.map(o => o.id === ordoId ? {
      ...o, attachments: [{ name: file.name, type: file.name.endsWith('.pdf') ? 'pdf' : 'image', dataUrl, size: `${(file.size/1024).toFixed(0)} Ko` }]
    } : o);
    return { dataUrl };
  }
  // Mode prod : upload dans Supabase Storage
  const sb = getSupabase();
  const ext = file.name.split('.').pop();
  const path = `${pharmacieId}/${ordoId}/ordonnance.${ext}`;
  await sb.storage.from('ordonnances-files').upload(path, file, { upsert: true });
  const { data: signed } = await sb.storage.from('ordonnances-files').createSignedUrl(path, 3600);
  await sb.from('ordonnances').update({ fichier_url: path, fichier_nom: file.name }).eq('id', ordoId);
  return { dataUrl: signed?.signedUrl, path };
}

// ═══════════════════════════════════════════════════════════════════════════════
// REALTIME
// ═══════════════════════════════════════════════════════════════════════════════

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
    }, payload => callback({ ...getDB()?.pharmacies?.find(p => p.id === pharmacieId) }))
    .subscribe();
  return () => sb.removeChannel(channel);
}

// Pub/sub interne (mode démo)
const _listeners = {};
export function notifyPharmacy(pharmacieId) {
  const db = getDB();
  const ph = db.pharmacies.find(p => p.id === pharmacieId);
  if (ph) (_listeners[pharmacieId] || []).forEach(fn => fn(ph));
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUDIT LOGS
// ═══════════════════════════════════════════════════════════════════════════════

// Stockage en mémoire pour mode démo
const _auditLogs = [];

export async function addAuditLog({ userId, userRole, pharmacieId, action, ordonnanceId }) {
  const entry = { id: `log-${Date.now()}`, ts: new Date().toISOString(), userId, userRole, pharmacieId, action, ordonnanceId };
  if (IS_DEMO) { _auditLogs.push(entry); return; }
  const sb = getSupabase();
  await sb.from('audit_logs').insert({ pharmacie_id: pharmacieId, user_id: userId, user_role: userRole, action, ordonnance_id: ordonnanceId });
}

export async function getAuditLogs(pharmacieId) {
  if (IS_DEMO) return _auditLogs.filter(l => l.pharmacieId === pharmacieId).slice(-100).reverse();
  const sb = getSupabase();
  const { data } = await sb.from('audit_logs').select('*').eq('pharmacie_id', pharmacieId).order('created_at', { ascending: false }).limit(100);
  return data || [];
}

export async function exportLogsCSV(pharmacieId) {
  const logs = await getAuditLogs(pharmacieId);
  const csv = ['Horodatage,Utilisateur,Rôle,Action,ID Ordonnance',
    ...logs.map(l => `${l.ts||l.created_at},${l.userId||l.user_id},${l.userRole||l.user_role},${l.action},${l.ordonnanceId||l.ordonnance_id||''}`),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url;
  a.download = `ordomail_logs_${pharmacieId}_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ABONNEMENTS & FACTURATION
// ═══════════════════════════════════════════════════════════════════════════════

export async function fetchAbonnement(pharmacieId) {
  if (IS_DEMO) return null; // géré par PLAN_LIMITS + pharmacie.plan
  const sb = getSupabase();
  const { data } = await sb.from('abonnements').select('*').eq('pharmacie_id', pharmacieId).single();
  return data;
}

export async function fetchFactures(pharmacieId) {
  if (IS_DEMO) return []; // les factures mock sont générées dans CompteSection
  const sb = getSupabase();
  const { data } = await sb.from('factures').select('*').eq('pharmacie_id', pharmacieId).order('created_at', { ascending: false });
  return data || [];
}

export async function changePlan(pharmacieId, newPlan) {
  if (IS_DEMO) {
    const db = getDB();
    const ph = db.pharmacies.find(p => p.id === pharmacieId);
    if (ph) ph.plan = newPlan;
    return { success: true };
  }
  const sb = getSupabase();
  // Essayer via Edge Function (avec Stripe) d'abord
  try {
    const { data, error } = await sb.functions.invoke('change-plan', { body: { pharmacieId, newPlan } });
    if (!error) return data;
  } catch(e) {
    console.warn('[changePlan] Edge Fn non disponible, fallback direct');
  }
  // Fallback : UPDATE direct en Supabase (sans Stripe)
  const { error: updateErr } = await sb
    .from('pharmacies')
    .update({ plan: newPlan })
    .eq('id', pharmacieId);
  if (updateErr) throw updateErr;
  return { success: true };
}

// ─── Normaliser une ordonnance DB Supabase → format UI ───────────────────────
function normOrdo(row) {
  return {
    id: row.id, source: row.source, status: row.status,
    fromName: row.from_name, fromEmail: row.from_email,
    receivedAt: row.received_at, printedAt: row.printed_at,
    extracted: { nom: row.patient_nom, carteVitale: row.patient_cv, medecin: row.medecin, medicaments: row.medicaments || [] },
    // path = chemin Storage, dataUrl = null (chargé à la demande via signed URL)
    attachments: row.fichier_url ? [{
      name: row.fichier_nom || 'ordonnance',
      type: row.fichier_type || (row.fichier_url?.endsWith('.pdf') ? 'pdf' : 'image'),
      path: row.fichier_url,
      dataUrl: null,
    }] : [],
  };
}

// Export du mode pour debug
export const isDemoMode = IS_DEMO;

// Export du client Supabase pour composants App.jsx
export function getSupabaseClient() { return getSupabase(); }
export { getSupabase as supabase };

// ─── Générer une URL signée pour un fichier Storage ────────────────────────
export async function getSignedUrl(path, expiresIn = 3600) {
  if (!path) return null;
  if (IS_DEMO) return null;
  const sb = getSupabase();
  const { data, error } = await sb.storage
    .from('ordonnances-files')
    .createSignedUrl(path, expiresIn);
  if (error) { console.error('[Storage]', error.message); return null; }
  return data?.signedUrl || null;
}

// ─── Récupérer la session courante (pour persistance après refresh) ───────────
export async function getCurrentSession() {
  if (IS_DEMO) return null;
  const sb = getSupabase();
  const { data: { session } } = await sb.auth.getSession();
  return session;
}

// ─── Écouter les changements de session ──────────────────────────────────────
export function onAuthStateChange(callback) {
  if (IS_DEMO) return () => {};
  const sb = getSupabase();
  const { data: { subscription } } = sb.auth.onAuthStateChange(callback);
  return () => subscription.unsubscribe();
}
