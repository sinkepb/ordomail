// ─── Ordonnances (lecture, statut, extraction OCR, upload fichier) ────────────
// Extrait de src/supabase.js (27/07/2026) — voir src/supabase.js.
import { IS_DEMO, getDB, callSecureData } from './client.js';
import { _listeners } from './realtime.js';
import { maskId, fileToBase64 } from '../utils.js';
import { compressImageFile } from '../imageCompress.js';

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
  // Mode prod : upload via secure-data (clé de service), pas en direct.
  //
  // Avant le 18/08/2026, cet upload passait par un appel direct
  // sb.storage.upload() en clé anon (le vendeur n'a pas de session Supabase
  // Auth réelle) — la policy INSERT sur storage.objects n'ayant aucune
  // restriction de chemin au-delà du bucket, n'importe quel appelant anonyme
  // pouvait écrire un fichier arbitraire dans le dossier de N'IMPORTE QUELLE
  // pharmacie. secure-data vérifie maintenant que l'ordonnance appartient
  // bien à l'appelant avant d'écrire (même modèle que submit-ordonnance).
  // Compression avant upload (04/09/2026) — l'OCR (côté appelant, avant ce
  // point) a déjà tourné sur le fichier original ; seul ce qui part vers le
  // Storage doit être allégé. PDF/HEIC ressortent inchangés.
  const uploadFile = await compressImageFile(file);
  const fileBase64 = await fileToBase64(uploadFile);
  const { path, signedUrl } = await callSecureData('ordonnances_upload_file', {
    ordoId, fileName: uploadFile.name, fileType: uploadFile.type, fileBase64,
  });
  return { dataUrl: signedUrl, path };
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
