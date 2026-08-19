// ─── Client Supabase + état partagé (mode démo/prod, jeton vendeur, secure-data) ──
// Extrait de src/supabase.js (27/07/2026) — voir src/supabase.js pour l'historique
// complet et la façade de compatibilité (ré-export unique conservé pour ne pas
// avoir à modifier les ~30 sites d'import existants dans le reste de l'app).
import { createClient } from '@supabase/supabase-js';

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

export const IS_DEMO = _DEMO_EXPLICIT || (_SUPABASE_URL_MISSING && !import.meta.env.PROD);

let _supabase = null;

export function getSupabase() {
  if (_supabase) return _supabase;
  if (IS_DEMO) return null;
  _supabase = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY,
    { auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true } }
  );
  return _supabase;
}

// ─── Client "anonyme garanti" pour la page patient ────────────────────────────
// ⚠️ Bug réel confirmé en direct le 27/07/2026 : getSupabase() persiste la
// session Supabase Auth du titulaire dans localStorage (persistSession: true,
// nécessaire pour que le dashboard reste connecté après un rechargement). Si le
// MÊME navigateur a une session titulaire/admin active (onglet différent, ou
// juste laissée ouverte), le SDK attache AUTOMATIQUEMENT le jeton de cette
// session à CHAQUE requête PostgREST — y compris depuis PatientPage.jsx, censée
// être strictement anonyme. Or offre_interets/story_metrics n'ont aucune policy
// INSERT pour le rôle `authenticated` (volontairement — seul `anon` peut y
// écrire) : la requête échoue alors avec "new row violates row-level security
// policy", un message qui ressemble à un bug de policy alors que la vraie cause
// est qu'elle n'est jamais appelée en tant qu'anon. Un second client, sans
// persistance de session, garantit que la page patient reste anonyme quel que
// soit l'état de connexion du reste de l'app dans le même navigateur.
let _supabaseAnon = null;

export function getSupabaseAnon() {
  if (_supabaseAnon) return _supabaseAnon;
  if (IS_DEMO) return null;
  _supabaseAnon = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY,
    { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } }
  );
  return _supabaseAnon;
}

// ─── Référence à la DB mock via pont global window._ordomailDB ───────────────
// App.jsx expose la DB via window._ordomailDB = DB après son initialisation
export function getDB() {
  if (typeof window !== 'undefined' && window._ordomailDB) return window._ordomailDB;
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
export function getVendeurToken() { return _vendeurToken; }

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
export async function callSecureData(resource, params = {}) {
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

// Export du client Supabase pour composants App.jsx
export function getSupabaseClient() { return getSupabase(); }

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

// ─── Intention de paiement en attente (19/08/2026) ────────────────────────────
// Ce projet Supabase exige la confirmation d'email : signUp() ne renvoie aucune
// session tant que le lien reçu par email n'est pas cliqué, donc
// create-checkout-session (qui exige une vraie session) ne peut pas être appelé
// dans la foulée de l'inscription. On mémorise ici le plan/billing choisis pour
// les reprendre automatiquement dès qu'une session existe (voir App.jsx, effet
// "Restaurer la session"). localStorage (pas sessionStorage comme le jeton
// admin) : doit survivre à la fermeture de l'onglet — la confirmation par email
// se fait typiquement dans un nouvel onglet/une nouvelle fenêtre — et ne
// contient aucun secret, juste un choix de plan non sensible.
const PENDING_CHECKOUT_KEY = 'ordomail_pending_checkout';

export function setPendingCheckout(intent) {
  try { localStorage.setItem(PENDING_CHECKOUT_KEY, JSON.stringify(intent)); } catch { /* stockage indisponible, tant pis */ }
}
export function getPendingCheckout() {
  try { return JSON.parse(localStorage.getItem(PENDING_CHECKOUT_KEY)); } catch { return null; }
}
export function clearPendingCheckout() {
  try { localStorage.removeItem(PENDING_CHECKOUT_KEY); } catch { /* ignore */ }
}
