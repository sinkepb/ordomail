// ─── Ordonnances (lecture, statut, extraction OCR, upload fichier) ────────────
// Extrait de src/supabase.js (27/07/2026) — voir src/supabase.js.
import { IS_DEMO, getSupabase, getDB, callSecureData } from './client.js';
import { _listeners } from './realtime.js';
import { maskId } from '../utils.js';

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
    const data = await callSecureData('ordonnances', { days });
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
  await callSecureData('ordonnances_update', {
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
  await callSecureData('ordonnances_update', {
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
  await callSecureData('ordonnances_update', { ordoId, patch: { fichier_url: path, fichier_nom: file.name } });
  return { dataUrl: signed?.signedUrl, path };
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

// ─── Mode démo : ajouter une ordonnance dans la DB mémoire ───────────────────
export function addOrdonnance(pharmacieId, ordo) {
  const db = getDB();
  if (!db) { console.warn("[addOrdonnance] DB non initialisée"); return; }
  const ph = db.pharmacies.find(p => p.id === pharmacieId);
  if (!ph) { console.warn("[addOrdonnance] Pharmacie introuvable:", maskId(pharmacieId)); return; }
  if (!ph.ordonnances) ph.ordonnances = [];
  ph.ordonnances.unshift(ordo);
  // Notifier les listeners Realtime démo
  if (_listeners[pharmacieId]) {
    _listeners[pharmacieId].forEach(fn => fn(ordo));
  }
}
