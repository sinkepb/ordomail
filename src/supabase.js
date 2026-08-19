// ═══════════════════════════════════════════════════════════════════════════════
// ordomail/src/supabase.js
// Couche de persistance — mode DÉMO ou SUPABASE selon VITE_DEMO_MODE
//
// En mode DÉMO  : toutes les fonctions opèrent sur DB (mock en mémoire)
// En mode PROD  : appels Supabase réels (PostgreSQL + Storage + Realtime)
//
// Pour activer Supabase : mettre VITE_DEMO_MODE=false dans .env.local
//
// @refactor 27/07/2026 — ce fichier (828 lignes à l'origine) est désormais une
// façade de compatibilité : l'implémentation vit dans src/lib/supabase/*.js,
// scindée par domaine (auth, pharmacies, ordonnances, realtime, audit, billing,
// metriques, stories, sonnette). Ce fichier ne fait que ré-exporter, à
// l'identique, chaque fonction déjà utilisée par ~30 sites d'import dans le
// reste de l'app — aucun de ces imports n'a besoin de changer.
// ═══════════════════════════════════════════════════════════════════════════════

export {
  IS_DEMO as isDemoMode,
  getSupabase as supabase,
  getSupabaseClient,
  getSupabaseAnon,
  getSignedUrl,
  getCurrentSession,
  onAuthStateChange,
  registerDB,
  setVendeurToken,
  clearVendeurToken,
  setPendingCheckout,
  getPendingCheckout,
  clearPendingCheckout,
} from './lib/supabase/client.js';

export {
  authSignInEmail,
  authSignInPIN,
  authSignInPSC,
  authSignOut,
} from './lib/supabase/auth.js';

export {
  fetchPharmacie,
  fetchPharmaciePublic,
  savePharmacie,
  savePostes,
} from './lib/supabase/pharmacies.js';

export {
  fetchOrdonnances,
  updateOrdoStatus,
  updateOrdoExtracted,
  uploadOrdoFile,
  addOrdonnance,
} from './lib/supabase/ordonnances.js';

export {
  subscribeToPharmacy,
  notifyPharmacy,
} from './lib/supabase/realtime.js';

export {
  addAuditLog,
  getAuditLogs,
  exportLogsCSV,
} from './lib/supabase/audit.js';

export {
  fetchAbonnement,
  fetchFactures,
  changePlan,
} from './lib/supabase/billing.js';

export {
  snapshotMetriquesJournalieres,
  fetchHistoriqueMetriques,
} from './lib/supabase/metriques.js';

export {
  fetchInteretsParCode,
  fetchInteretsDuJour,
  fetchStoryMetrics,
  fetchPharmacieStories,
  updatePharmacieStorySelection,
} from './lib/supabase/stories.js';

export {
  setSonnetteActive,
  appellerPatient,
  ecouterAppels,
  updateSonnetteActive,
} from './lib/supabase/sonnette.js';
