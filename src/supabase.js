// @ordomail-deploy 15/07/2026 02:22
// ═══════════════════════════════════════════════════════════════════════════════
// ordomail/src/supabase.js
// Couche de persistance — mode DÉMO ou SUPABASE selon VITE_DEMO_MODE
//
// En mode DÉMO  : toutes les fonctions opèrent sur DB (mock en mémoire)
// En mode PROD  : appels Supabase réels (PostgreSQL + Storage + Realtime)
//
// Pour activer Supabase : mettre VITE_DEMO_MODE=false dans .env.local
// ═══════════════════════════════════════════════════════════════════════════════

const _DEMO_EXPLICIT = import.meta.env.VITE_DEMO_MODE === 'true';
const _SUPABASE_URL_MISSING = !import.meta.env.VITE_SUPABASE_URL ||
                               import.meta.env.VITE_SUPABASE_URL === 'https://placeholder.supabase.co';

// ⚠️ Avant le 24/07/2026, une config Supabase manquante en production basculait
// SILENCIEUSEMENT en mode démo — dont les identifiants (admin2025, PIN 1234/5678…)
// sont codés en dur et lisibles dans le bundle JS. En build de production
// (import.meta.env.PROD), on refuse désormais de démarrer dans cet état plutôt que
// de tourner avec des identifiants de démo sans que personne ne s'en aperçoive.
// VITE_DEMO_MODE=true reste le seul moyen légitime de déployer une démo.
if (!_DEMO_EXPLICIT && _SUPABASE_URL_MISSING && import.meta.env.PROD) {
  throw new Error(
    'Configuration Supabase manquante (VITE_SUPABASE_URL absent ou placeholder) sur un build de ' +
    'production — démarrage refusé pour éviter un repli silencieux en mode démo. Définissez ' +
    'VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY, ou VITE_DEMO_MODE=true si ce déploiement est ' +
    'volontairement une démonstration.'
  );
}

const IS_DEMO = _DEMO_EXPLICIT || (_SUPABASE_URL_MISSING && !import.meta.env.PROD);

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
  // Pont global (App.jsx expose window._ordomailDB = DB après son initialisation)
  if (typeof window !== 'undefined' && window._ordomailDB) return window._ordomailDB;
  // Repéré par le linter (phase 2) : il n'y a jamais eu de variable globale `DB` en
  // dehors de window._ordomailDB — ce second repli référençait un identifiant non
  // déclaré et aurait levé une ReferenceError s'il avait jamais été atteint.
  throw new Error('DB non disponible — vérifiez que App.jsx est chargé');
}

// Appelé par App.jsx pour exposer la DB au module supabase
export function registerDB(db) {
  if (typeof window !== 'undefined') window._ordomailDB = db;
}

// ═══════════════════════════════════════════════════════════════════════════════
// JETON VENDEUR (phase 1 sécurité)
// ═══════════════════════════════════════════════════════════════════════════════
// Un poste vendeur (connexion par code pharmacie + PIN) n'a pas de session Supabase
// Auth réelle. Depuis le durcissement du 23/07/2026, verify-pin émet un jeton signé
// de courte durée (voir supabase/functions/_shared/jwt.ts) qu'il faut présenter à
// l'edge function secure-data pour lire les ordonnances/offres de sa pharmacie.
// Volontairement non persisté (mémoire du module) : comme avant, un rechargement
// complet de page déconnecte le poste vendeur, qui doit resaisir son PIN.
let _vendeurToken = null;

export function setVendeurToken(token) { _vendeurToken = token || null; }
export function clearVendeurToken() { _vendeurToken = null; }

// Résout le jeton à présenter à secure-data : jeton vendeur en mémoire si présent,
// sinon le jeton de session Supabase Auth du titulaire connecté.
async function _resolveAuthToken() {
  if (_vendeurToken) return _vendeurToken;
  if (IS_DEMO) return null;
  const sb = getSupabase();
  const { data: { session } } = await sb.auth.getSession();
  return session?.access_token || null;
}

// Appel générique à l'edge function secure-data — remplace les lectures directes
// en clé anon (fetchOrdonnances, offre_interets…) désormais bloquées par RLS.
async function _callSecureData(resource, params = {}) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const token = await _resolveAuthToken();
  const res = await fetch(`${supabaseUrl}/functions/v1/secure-data`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseKey,
      'Authorization': `Bearer ${token || ''}`,
    },
    body: JSON.stringify({ resource, params }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `secure-data ${resource} : erreur ${res.status}`);
  return body.data;
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

export async function authSignInPIN(pin, pharmacieId) {
  if (IS_DEMO) {
    const db = getDB();
    const pharmacies = pharmacieId
      ? db.pharmacies.filter(p => p.id === pharmacieId)
      : db.pharmacies;
    for (const ph of pharmacies) {
      const poste = (ph.postes || []).find(p => p.pin === pin && p.actif);
      if (poste) return { pharmacie: ph, poste, userRole: 'vendeur', userId: poste.id, posteNom: poste.nom };
    }
    return { error: new Error('PIN incorrect ou poste inactif') };
  }
  // Mode prod : fetch direct (pas sb.functions.invoke qui ajoute un token null → 401)
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    const res = await fetch(`${supabaseUrl}/functions/v1/verify-pin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        // PAS de Authorization header — vendeur non authentifié (voir jeton retourné par verify-pin)
      },
      body: JSON.stringify({ pin, pharmacieId }),
    });
    const data = await res.json();
    if (!res.ok || !data?.success) return { error: new Error(data?.error || 'PIN incorrect') };
    // Jeton vendeur (phase 1 sécurité) — nécessaire pour lire les ordonnances via secure-data
    setVendeurToken(data.token);
    return { pharmacie: data.pharmacie, poste: data.poste, userRole: 'vendeur', userId: data.poste.id, posteNom: data.poste.nom };
  } catch(e) {
    return { error: new Error('Erreur de connexion: ' + e.message) };
  }
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
  clearVendeurToken();
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
  // Un poste vendeur (jeton, pas de session Supabase Auth) n'a plus le droit de lire
  // pharmacies/pharmacie_postes en direct avec la clé anon (RLS phase 1) — et n'a de
  // toute façon pas besoin des postes/PIN, réservés aux écrans titulaire.
  if (_vendeurToken) {
    const data = await _callSecureData('pharmacie_info', {});
    return data ? { ...data, postes: [] } : null;
  }
  const sb = getSupabase();
  const { data, error } = await sb.from('pharmacies').select('*, pharmacie_postes(*)').eq('id', pharmacieId).single();
  if (error) throw error;
  // Normaliser pharmacie_postes → postes pour compatibilité dashboard
  if (data && data.pharmacie_postes) {
    data.postes = data.pharmacie_postes;
  }
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

// ═══════════════════════════════════════════════════════════════════════════════
// ORDONNANCES
// ═══════════════════════════════════════════════════════════════════════════════

export async function fetchOrdonnances(pharmacieId, days = 7) {
  if (IS_DEMO) {
    const db = getDB();
    const ph = db.pharmacies.find(p => p.id === pharmacieId);
    return ph?.ordonnances || [];
  }
  // Route via secure-data — vérifie le jeton vendeur/titulaire côté serveur avant
  // de renvoyer des ordonnances (avant le 23/07/2026, un simple appel REST avec la
  // clé anon suffisait à lire les ordonnances de n'importe quelle pharmacie).
  try {
    const data = await _callSecureData('ordonnances', { days });
    return (data || []).map(normOrdo);
  } catch(e) {
    console.error('[fetchOrdonnances]', e.message);
    return [];
  }
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
  // Route via secure-data — un poste vendeur (PIN) n'a pas de session Supabase Auth,
  // donc pas de droit d'écriture direct sous RLS. secure-data vérifie le jeton vendeur/
  // titulaire et que l'ordonnance appartient bien à sa pharmacie avant d'écrire.
  await _callSecureData('ordonnances_update', {
    ordoId,
    patch: { status, printed_at: status === 'imprime' ? new Date().toISOString() : null },
  });
}

export async function updateOrdoExtracted(ordoId, pharmacieId, extracted) {
  if (IS_DEMO) {
    const db = getDB();
    const ph = db.pharmacies.find(p => p.id === pharmacieId);
    if (ph) ph.ordonnances = ph.ordonnances.map(o => o.id === ordoId ? { ...o, extracted } : o);
    return;
  }
  await _callSecureData('ordonnances_update', {
    ordoId,
    patch: {
      patient_nom: extracted.nom, patient_cv: extracted.carteVitale,
      medecin: extracted.medecin, medicaments: extracted.medicaments || [],
    },
  });
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
  await _callSecureData('ordonnances_update', { ordoId, patch: { fichier_url: path, fichier_nom: file.name } });
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

export async function addAuditLog({ userId, userRole, pharmacieId, action, ordonnanceId, posteNom }) {
  const sb = getSupabase();
  await sb.from('audit_logs').insert({
    pharmacie_id:  pharmacieId,
    user_id:       userId        || null,
    user_role:     userRole      || null,
    poste_nom:     posteNom      || null,
    action,
    ordonnance_id: ordonnanceId  || null,
  });
}

export async function getAuditLogs(pharmacieId) {
  const sb = getSupabase();
  const { data } = await sb.from('audit_logs')
    .select('id, created_at, user_id, user_role, poste_nom, action, ordonnance_id')
    .eq('pharmacie_id', pharmacieId)
    .order('created_at', { ascending: false })
    .limit(200);
  // Normaliser snake_case → camelCase pour le rendu LogsPanel
  return (data || []).map(l => ({
    id:           l.id,
    ts:           l.created_at,
    userId:       l.user_id,
    userRole:     l.user_role,
    posteNom:     l.poste_nom,
    action:       l.action,
    ordonnanceId: l.ordonnance_id,
  }));
}

export async function exportLogsCSV(pharmacieId) {
  const logs = await getAuditLogs(pharmacieId);
  const csv = ['Date,Heure,Poste,Utilisateur,Rôle,Action,ID Ordonnance',
    ...logs.map(l => {
      const d    = new Date(l.ts);
      const date = isNaN(d) ? '' : d.toLocaleDateString('fr-FR');
      const time = isNaN(d) ? '' : d.toLocaleTimeString('fr-FR');
      return `${date},${time},${l.posteNom||''},${l.userId||''},${l.userRole||''},${l.action},${l.ordonnanceId||''}`;
    }),
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
    code_patient: row.code_patient || null,
    extracted: {
      nom:         row.patient_nom   || null,
      carteVitale: null,
      medecin:     null,
      date:        null,
      medicaments: [],
      _confidence: row.ocr_confidence || 0,
      _ocrSuccess: !!row.patient_nom,
    },
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

// ─── Snapshot métriques journalières ──────────────────────────────────────────
export async function snapshotMetriquesJournalieres() {
  if (IS_DEMO) return;
  const sb = getSupabase();
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

  // Charger toutes les pharmacies
  const { data: pharmacies } = await sb.from("pharmacies").select("id, plan");
  if (!pharmacies) return;

  const now30 = new Date(Date.now() - 30*86400000).toISOString();
  const now7  = new Date(Date.now() - 7*86400000).toISOString();
  const now24 = new Date(Date.now() - 86400000).toISOString();
  const today_start = new Date().toISOString().split("T")[0] + "T00:00:00.000Z";

  for (const ph of pharmacies) {
    const [
      { count: total },
      { count: mois },
      { count: semaine },
      { count: jour },
      { count: attente },
      { data: canaux },
      { data: traitees },
    ] = await Promise.all([
      sb.from("ordonnances").select("*",{count:"exact",head:true}).eq("pharmacie_id",ph.id),
      sb.from("ordonnances").select("*",{count:"exact",head:true}).eq("pharmacie_id",ph.id).gte("received_at",now30),
      sb.from("ordonnances").select("*",{count:"exact",head:true}).eq("pharmacie_id",ph.id).gte("received_at",now7),
      sb.from("ordonnances").select("*",{count:"exact",head:true}).eq("pharmacie_id",ph.id).gte("received_at",today_start),
      sb.from("ordonnances").select("*",{count:"exact",head:true}).eq("pharmacie_id",ph.id).eq("status","nouveau").lte("received_at",now24),
      sb.from("ordonnances").select("source").eq("pharmacie_id",ph.id).gte("received_at",now30),
      // Délai de traitement (envoi → impression) — ordonnances imprimées des 30 derniers jours
      sb.from("ordonnances").select("received_at, printed_at").eq("pharmacie_id",ph.id).gte("received_at",now30).not("printed_at","is",null),
    ]);

    const total_canaux = canaux?.length || 0;
    const qr_pct    = total_canaux ? Math.round((canaux.filter(o=>o.source==="qrcode").length/total_canaux)*100) : 0;
    const email_pct = total_canaux ? Math.round((canaux.filter(o=>o.source==="email").length/total_canaux)*100) : 0;
    const taux = total ? Math.round(((total-(attente||0))/total)*100) : 0;
    const score = Math.min(100, Math.round((mois||0)*0.4 + (semaine||0)*2 + qr_pct*0.2));
    const delais = (traitees||[])
      .map(o => (new Date(o.printed_at) - new Date(o.received_at)) / 60000)
      .filter(m => Number.isFinite(m) && m >= 0);
    const delaiMoyen = delais.length ? Math.round(delais.reduce((a,b)=>a+b,0)/delais.length) : 0;

    // Upsert du snapshot du jour (ON CONFLICT → UPDATE)
    await sb.from("metriques_journalieres").upsert({
      pharmacie_id:     ph.id,
      date:             today,
      ordos_jour:       jour    || 0,
      ordos_semaine:    semaine || 0,
      ordos_mois:       mois    || 0,
      ordos_total:      total   || 0,
      ordos_attente:    attente || 0,
      canal_qr_pct:     qr_pct,
      canal_email_pct:  email_pct,
      taux_traitement:  taux,
      score_activite:   score,
      delai_moyen_min: delaiMoyen,
    }, { onConflict: "pharmacie_id,date" });
  }
}

// Charger l'historique d'une pharmacie
export async function fetchHistoriqueMetriques(pharmacieId, jours = 30) {
  if (IS_DEMO) {
    // Générer des données mock pour la démo
    const data = [];
    for (let i = jours; i >= 0; i--) {
      const d = new Date(Date.now() - i*86400000);
      data.push({
        date:             d.toISOString().split("T")[0],
        ordos_jour:       Math.floor(Math.random()*15)+1,
        ordos_mois:       Math.floor(Math.random()*80)+20,
        taux_traitement:  Math.floor(Math.random()*20)+75,
        delai_moyen_min: Math.floor(Math.random()*20)+5,
        score_activite:   Math.floor(Math.random()*30)+60,
        canal_qr_pct:     Math.floor(Math.random()*30)+50,
      });
    }
    return data;
  }
  const sb = getSupabase();
  const since = new Date(Date.now() - jours*86400000).toISOString().split("T")[0];
  const { data } = await sb
    .from("metriques_journalieres")
    .select("*")
    .eq("pharmacie_id", pharmacieId)
    .gte("date", since)
    .order("date", { ascending: true });
  return data || [];
}


// ─── Intérêts patients pour les offres ───────────────────────────────────────
export async function fetchInteretsParCode(pharmacieId, codePatient) {
  if (IS_DEMO) return [];
  const today = new Date().toISOString().split("T")[0];
  try {
    return await _callSecureData('offre_interets', { codePatient, dateJour: today }) || [];
  } catch(e) {
    console.error('[fetchInteretsParCode]', e.message);
    return [];
  }
}

// Charger tous les intérêts du jour pour une pharmacie (pour le dashboard)
export async function fetchInteretsDuJour(pharmacieId) {
  if (IS_DEMO) {
    // Mode démo : lire depuis window.__ordomailDB
    const db = getDB ? getDB() : window.__ordomailDB;
    const today = new Date().toISOString().split("T")[0];
    return (db?.offre_interets || []).filter(
      i => i.pharmacie_id === pharmacieId && i.date_jour === today
    );
  }
  const today = new Date().toISOString().split("T")[0];
  try {
    return await _callSecureData('offre_interets', { dateJour: today }) || [];
  } catch(e) {
    console.error('[fetchInteretsDuJour]', e.message);
    return [];
  }
}

// Charger les métriques de consultation des stories (vue, temps passé, actions)
// pour une pharmacie — pas encore branché sur un écran dédié, disponible pour
// analyse ponctuelle ou un futur tableau de bord d'engagement patient.
export async function fetchStoryMetrics(pharmacieId, params = {}) {
  if (IS_DEMO) return [];
  try {
    return await _callSecureData('story_metrics', params) || [];
  } catch(e) {
    console.error('[fetchStoryMetrics]', e.message);
    return [];
  }
}


// ─── Sonnette patient ─────────────────────────────────────────────────────────

// Vendeur → appeler un patient

// Patient → écouter les appels (Realtime)

// Activer/désactiver sonnette (admin backoffice)
export async function setSonnetteActive(pharmacieId, active) {
  const sb = getSupabase();
  await sb.from('pharmacies').update({ sonnette_active: active }).eq('id', pharmacieId);
}


// ─── Sonnette patient ─────────────────────────────────────────────────────────

export async function appellerPatient(pharmacieId, codePatient) {
  console.log("[SONNETTE] appel pharmacie:", pharmacieId, "code:", codePatient, "demo:", IS_DEMO);
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

export function ecouterAppels(pharmacieId, codePatient, callback) {
  console.log("[SONNETTE] écoute pharmacie:", pharmacieId, "code:", codePatient, "demo:", IS_DEMO);
  if (IS_DEMO) {
    const handler = (e) => {
      console.log("[SONNETTE] event reçu, code event:", e.detail?.code_patient, "code attendu:", codePatient);
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

// ─── Mode démo : ajouter une ordonnance dans la DB mémoire ───────────────────
export function addOrdonnance(pharmacieId, ordo) {
  const db = getDB();
  if (!db) { console.warn("[addOrdonnance] DB non initialisée"); return; }
  const ph = db.pharmacies.find(p => p.id === pharmacieId);
  if (!ph) { console.warn("[addOrdonnance] Pharmacie introuvable:", pharmacieId); return; }
  if (!ph.ordonnances) ph.ordonnances = [];
  ph.ordonnances.unshift(ordo);
  // Notifier les listeners Realtime démo
  if (_listeners[pharmacieId]) {
    _listeners[pharmacieId].forEach(fn => fn(ordo));
  }
}
