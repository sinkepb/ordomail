// ─── Journal d'audit (traçabilité connexions/impressions/consultations) ──────
// Extrait de src/supabase.js (27/07/2026) — voir src/supabase.js.
import { getSupabase } from './client.js';

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
