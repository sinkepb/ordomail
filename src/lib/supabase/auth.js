// ─── Authentification (titulaire, vendeur PIN, Pro Santé Connect) ────────────
// Extrait de src/supabase.js (27/07/2026) — voir src/supabase.js.
import { IS_DEMO, getSupabase, getDB, setVendeurToken, clearVendeurToken } from './client.js';
import { maskId } from '../utils.js';

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
    console.warn('[OrdoMail] Aucune pharmacie liée pour userId:', maskId(userId));
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
  // needsSubscription : compte confirmé mais jamais passé par un paiement Stripe
  // abouti (checkout abandonné/expiré). Avant ce champ, seul le refresh de page
  // (effet de restauration de session, App.jsx) bloquait ces comptes — une
  // connexion "fraîche" via ce formulaire laissait passer tout droit vers le
  // dashboard, sans jamais avoir payé.
  return { pharmacie, userRole: pharmacie?.userRole || 'admin', userId: data.user.id, needsSubscription: !pharmacie.stripe_subscription_id };
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
