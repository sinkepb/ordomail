// Edge Function : snapshot-metriques
// Appelée chaque nuit par pg_cron à 2h00
// Calcule et persiste toutes les métriques de chaque pharmacie
//
// @phase4-security 25/07/2026 — cette fonction recalcule les métriques de
// TOUTES les pharmacies à chaque appel (coûteux) et n'était protégée par
// aucune vérification d'appelant : n'importe qui pouvait la déclencher à
// volonté. Elle exige désormais un secret partagé transmis par pg_cron dans
// l'en-tête x-cron-secret — voir DEPLOIEMENT_PHASE4.md pour la mise à jour du
// job pg_cron côté base de données (à faire manuellement, hors du périmètre
// de ce qui peut être automatisé depuis ce dépôt).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { reportAlert } from "../_shared/alert.ts";

Deno.serve(async (req: Request) => {
  const CORS = corsHeaders(req, {
    "Access-Control-Allow-Headers": "content-type, authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  });
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: CORS });
  }

  const cronSecret = Deno.env.get("SNAPSHOT_CRON_SECRET");
  if (cronSecret && req.headers.get("x-cron-secret") !== cronSecret) {
    return new Response(JSON.stringify({ error: "Non autorisé" }), { status: 401, headers: CORS });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const headers = {
    "Content-Type":  "application/json",
    "apikey":        SERVICE_KEY,
    "Authorization": `Bearer ${SERVICE_KEY}`,
    "Prefer":        "return=minimal",
  };

  async function query(path: string, opts: RequestInit = {}) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...opts,
      headers: { ...headers, ...(opts.headers || {}) },
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, data: text ? JSON.parse(text) : null };
  }

  try {
    const today = new Date().toISOString().split("T")[0];
    const now24 = new Date(Date.now() - 1  * 86400000).toISOString();
    const today_start = today + "T00:00:00.000Z";
    const date30ago = new Date(Date.now() - 29 * 86400000).toISOString().split("T")[0]; // fenêtre incluant aujourd'hui = 30 jours
    const date7ago  = new Date(Date.now() - 6  * 86400000).toISOString().split("T")[0]; // fenêtre incluant aujourd'hui = 7 jours

    console.log(`[snapshot] Démarrage — date: ${today}`);

    // 1. Charger toutes les pharmacies
    const { data: pharmacies, ok: phOk } = await query("pharmacies?select=id,plan,nom");
    if (!phOk || !pharmacies?.length) {
      return new Response(
        JSON.stringify({ success: false, error: "Aucune pharmacie trouvée" }),
        { status: 500, headers: CORS }
      );
    }

    console.log(`[snapshot] ${pharmacies.length} pharmacies à traiter`);

    const results = { ok: 0, error: 0, details: [] as string[] };

    for (const ph of pharmacies) {
      try {
        // 2. Données du jour même uniquement — toujours dans la fenêtre de
        // rétention, quelle que soit la durée de purge configurée (voir
        // migration 20260827_metriques_purge_safe.sql : les agrégats
        // 7j/30j/total ne recomptent plus la table `ordonnances` au-delà
        // d'aujourd'hui, ils cumulent les snapshots quotidiens déjà stockés
        // ci-dessous, jamais purgés).
        const [
          { data: d_jour },
          { data: d_attente },
          { data: d_prevRows },
        ] = await Promise.all([
          query(`ordonnances?select=id,source,received_at,printed_at&pharmacie_id=eq.${ph.id}&received_at=gte.${today_start}`),
          query(`ordonnances?select=id&pharmacie_id=eq.${ph.id}&status=eq.nouveau&received_at=lte.${now24}`),
          // Snapshots déjà persistés — remplacent les requêtes directes sur
          // `ordonnances` pour tout ce qui dépasse la fenêtre de purge.
          query(`metriques_journalieres?select=date,ordos_jour,ordos_total,qr_jour,email_jour,delai_moyen_jour,delai_count_jour&pharmacie_id=eq.${ph.id}&date=gte.${date30ago}&date=lt.${today}&order=date.desc`),
        ]);

        const jourRows = Array.isArray(d_jour) ? d_jour : [];
        const c_jour    = jourRows.length;
        const c_attente = Array.isArray(d_attente) ? d_attente.length : 0;

        const qr_jour    = jourRows.filter((o: { source: string }) => o.source === "qrcode").length;
        const email_jour = jourRows.filter((o: { source: string }) => o.source === "email").length;

        const delaisJour = jourRows
          .filter((o: { printed_at: string | null }) => o.printed_at)
          .map((o: { received_at: string; printed_at: string }) =>
            (new Date(o.printed_at).getTime() - new Date(o.received_at).getTime()) / 60000)
          .filter((m: number) => Number.isFinite(m) && m >= 0);
        const delai_count_jour = delaisJour.length;
        const delai_moyen_jour = delai_count_jour
          ? Math.round(delaisJour.reduce((a: number, b: number) => a + b, 0) / delai_count_jour)
          : 0;

        // 3. Cumuls à partir des snapshots précédents (aucune donnée patient
        // dedans — juste des compteurs — donc jamais affectés par la purge).
        const prevRows: Array<{ date: string; ordos_jour: number; ordos_total: number;
          qr_jour: number; email_jour: number; delai_moyen_jour: number; delai_count_jour: number }> =
          Array.isArray(d_prevRows) ? d_prevRows : [];

        const prevTotal = prevRows[0]?.ordos_total || 0; // ligne la plus récente avant aujourd'hui
        const ordos_total = prevTotal + c_jour;

        const rows7  = prevRows.filter(r => r.date >= date7ago);
        const ordos_semaine = c_jour + rows7.reduce((s, r) => s + (r.ordos_jour || 0), 0);
        const ordos_mois    = c_jour + prevRows.reduce((s, r) => s + (r.ordos_jour || 0), 0);

        const qrTotal30    = qr_jour    + prevRows.reduce((s, r) => s + (r.qr_jour || 0), 0);
        const emailTotal30 = email_jour + prevRows.reduce((s, r) => s + (r.email_jour || 0), 0);
        const canaux30 = qrTotal30 + emailTotal30;
        const canal_qr_pct    = canaux30 ? Math.round(qrTotal30    / canaux30 * 100) : 0;
        const canal_email_pct = canaux30 ? Math.round(emailTotal30 / canaux30 * 100) : 0;

        // Moyenne pondérée par le nombre d'ordonnances de chaque jour (pas
        // une simple moyenne de moyennes, qui sous-pondérerait les jours à
        // fort volume).
        const delaiWeightedSum = delai_moyen_jour * delai_count_jour
          + prevRows.reduce((s, r) => s + (r.delai_moyen_jour || 0) * (r.delai_count_jour || 0), 0);
        const delaiWeightCount = delai_count_jour
          + prevRows.reduce((s, r) => s + (r.delai_count_jour || 0), 0);
        const delaiMoyen = delaiWeightCount ? Math.round(delaiWeightedSum / delaiWeightCount) : 0;

        // Score activité 0-100
        const score = Math.min(100, Math.round(
          ordos_mois * 0.4 + ordos_semaine * 2 + canal_qr_pct * 0.2
        ));

        // Taux de traitement (sur le cumul depuis toujours)
        const taux = ordos_total ? Math.round(((ordos_total - c_attente) / ordos_total) * 100) : 0;

        // 4. UPSERT du snapshot
        const payload = {
          pharmacie_id:    ph.id,
          date:            today,
          ordos_jour:      c_jour,
          ordos_semaine,
          ordos_mois,
          ordos_total,
          ordos_attente:   c_attente,
          qr_jour,
          email_jour,
          delai_moyen_jour,
          delai_count_jour,
          canal_qr_pct,
          canal_email_pct,
          taux_traitement: taux,
          score_activite:  score,
          delai_moyen_min: delaiMoyen,
        };

        // @fix 27/08/2026 — sans on_conflict explicite, PostgREST cible la
        // clé primaire (id, toujours nouvelle ici) pour la résolution de
        // merge-duplicates, pas la contrainte unique réelle (pharmacie_id,
        // date) : un deuxième passage le même jour (relance manuelle, debug)
        // échouait en 409 au lieu de mettre à jour la ligne existante.
        const { ok: upsertOk, status: upsertStatus, data: upsertData } = await query(
          "metriques_journalieres?on_conflict=pharmacie_id,date",
          {
            method: "POST",
            body: JSON.stringify(payload),
            headers: {
              ...headers,
              "Prefer": "resolution=merge-duplicates,return=minimal",
            },
          }
        );

        if (upsertOk || upsertStatus === 201 || upsertStatus === 204) {
          results.ok++;
          console.log(`[snapshot] ✅ ${ph.nom} — ${c_jour} ordos aujourd'hui, score ${score}`);
        } else {
          results.error++;
          results.details.push(`${ph.nom}: upsert status ${upsertStatus} — ${JSON.stringify(upsertData)}`);
        }

      } catch (e) {
        results.error++;
        results.details.push(`${ph.nom}: ${String(e)}`);
        console.error(`[snapshot] ❌ ${ph.nom}:`, String(e));
      }
    }

    console.log(`[snapshot] Terminé — ${results.ok} OK, ${results.error} erreurs`);

    // Échecs partiels/totaux invisibles jusqu'ici sans lire les logs Supabase
    // manuellement — le cron tourne la nuit, personne ne le surveille en direct.
    if (results.error > 0) {
      const alertClient = createClient(SUPABASE_URL, SERVICE_KEY);
      await reportAlert(alertClient, {
        source: "snapshot-metriques",
        severity: results.error === pharmacies.length ? "critical" : "warning",
        message: `${results.error} pharmacie(s) en échec sur ${pharmacies.length}`,
        meta: { details: results.details },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        date:    today,
        total:   pharmacies.length,
        ok:      results.ok,
        errors:  results.error,
        details: results.details,
      }),
      { headers: CORS }
    );

  } catch (e) {
    console.error("[snapshot] EXCEPTION:", String(e));
    const alertClient = createClient(SUPABASE_URL, SERVICE_KEY);
    await reportAlert(alertClient, {
      source: "snapshot-metriques", severity: "critical",
      message: `Exception globale — ${String(e)}`,
    });
    return new Response(
      JSON.stringify({ success: false, error: String(e) }),
      { status: 500, headers: CORS }
    );
  }
});
