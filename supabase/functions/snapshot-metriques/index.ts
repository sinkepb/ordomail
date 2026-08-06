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
    const now30 = new Date(Date.now() - 30 * 86400000).toISOString();
    const now7  = new Date(Date.now() - 7  * 86400000).toISOString();
    const now24 = new Date(Date.now() - 1  * 86400000).toISOString();
    const today_start = today + "T00:00:00.000Z";

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
        // 2. Compter les ordonnances par période
        const [total, mois, semaine, jour, attente] = await Promise.all([
          query(`ordonnances?select=id&pharmacie_id=eq.${ph.id}&head=true`,
            { method: "HEAD", headers: { ...headers, "Prefer": "count=exact" } }),
          query(`ordonnances?select=id&pharmacie_id=eq.${ph.id}&received_at=gte.${now30}&head=true`,
            { method: "HEAD", headers: { ...headers, "Prefer": "count=exact" } }),
          query(`ordonnances?select=id&pharmacie_id=eq.${ph.id}&received_at=gte.${now7}&head=true`,
            { method: "HEAD", headers: { ...headers, "Prefer": "count=exact" } }),
          query(`ordonnances?select=id&pharmacie_id=eq.${ph.id}&received_at=gte.${today_start}&head=true`,
            { method: "HEAD", headers: { ...headers, "Prefer": "count=exact" } }),
          query(`ordonnances?select=id&pharmacie_id=eq.${ph.id}&status=eq.nouveau&received_at=lte.${now24}&head=true`,
            { method: "HEAD", headers: { ...headers, "Prefer": "count=exact" } }),
        ]);

        // Extraire les counts depuis le header Content-Range
        function extractCount(res: { ok: boolean; status: number; data: unknown }): number {
          return 0; // HEAD ne retourne pas de body — on utilise une autre approche
        }

        // Approche alternative : SELECT avec count
        const [
          { data: d_total },
          { data: d_mois },
          { data: d_semaine },
          { data: d_jour },
          { data: d_attente },
          { data: d_canaux },
          { data: d_traitees },
        ] = await Promise.all([
          query(`ordonnances?select=id&pharmacie_id=eq.${ph.id}`),
          query(`ordonnances?select=id&pharmacie_id=eq.${ph.id}&received_at=gte.${now30}`),
          query(`ordonnances?select=id&pharmacie_id=eq.${ph.id}&received_at=gte.${now7}`),
          query(`ordonnances?select=id&pharmacie_id=eq.${ph.id}&received_at=gte.${today_start}`),
          query(`ordonnances?select=id&pharmacie_id=eq.${ph.id}&status=eq.nouveau&received_at=lte.${now24}`),
          query(`ordonnances?select=source&pharmacie_id=eq.${ph.id}&received_at=gte.${now30}`),
          // Délai de traitement (envoi → impression) — ordonnances imprimées des 30 derniers jours
          query(`ordonnances?select=received_at,printed_at&pharmacie_id=eq.${ph.id}&received_at=gte.${now30}&printed_at=not.is.null`),
        ]);

        const c_total   = Array.isArray(d_total)   ? d_total.length   : 0;
        const c_mois    = Array.isArray(d_mois)    ? d_mois.length    : 0;
        const c_semaine = Array.isArray(d_semaine) ? d_semaine.length : 0;
        const c_jour    = Array.isArray(d_jour)    ? d_jour.length    : 0;
        const c_attente = Array.isArray(d_attente) ? d_attente.length : 0;

        // Calcul canaux
        const canaux = Array.isArray(d_canaux) ? d_canaux : [];
        const qr_count    = canaux.filter((o: { source: string }) => o.source === "qrcode").length;
        const email_count = canaux.filter((o: { source: string }) => o.source === "email").length;
        const canal_qr_pct    = canaux.length ? Math.round(qr_count    / canaux.length * 100) : 0;
        const canal_email_pct = canaux.length ? Math.round(email_count / canaux.length * 100) : 0;

        // Score activité 0-100
        const score = Math.min(100, Math.round(
          c_mois * 0.4 + c_semaine * 2 + canal_qr_pct * 0.2
        ));

        // Taux de traitement
        const taux = c_total ? Math.round(((c_total - c_attente) / c_total) * 100) : 0;

        // Temps de traitement moyen (minutes, envoi → impression)
        const traitees = Array.isArray(d_traitees) ? d_traitees : [];
        const delais = traitees
          .map((o: { received_at: string; printed_at: string }) =>
            (new Date(o.printed_at).getTime() - new Date(o.received_at).getTime()) / 60000)
          .filter((m: number) => Number.isFinite(m) && m >= 0);
        const delaiMoyen = delais.length
          ? Math.round(delais.reduce((a: number, b: number) => a + b, 0) / delais.length)
          : 0;

        // 3. UPSERT du snapshot
        const payload = {
          pharmacie_id:    ph.id,
          date:            today,
          ordos_jour:      c_jour,
          ordos_semaine:   c_semaine,
          ordos_mois:      c_mois,
          ordos_total:     c_total,
          ordos_attente:   c_attente,
          canal_qr_pct,
          canal_email_pct,
          taux_traitement: taux,
          score_activite:  score,
          delai_moyen_min: delaiMoyen,
        };

        const { ok: upsertOk, status: upsertStatus } = await query(
          "metriques_journalieres",
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
          results.details.push(`${ph.nom}: upsert status ${upsertStatus}`);
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
