// OrdoMail — Edge Function secure-data-admin
// @isolation-pannes 13/08/2026
//
// Extraite de secure-data : cette fonction ne sert QUE le backoffice OrdoMail
// Business (gestion des pharmacies clientes, pricing, stories, monitoring,
// rétention RGPD, recherche/suppression droit à l'oubli). secure-data garde
// les ressources scopées à une pharmacie (vendeur/titulaire) — le flux métier
// critique (ordonnances, impression) ne partage plus de fichier ni de
// déploiement avec l'admin : un bug ou un déploiement raté ici n'affecte
// jamais le dashboard pharmacie.
//
// Même modèle d'appelant que secure-data (voir _shared/resolveCaller.ts) —
// toutes les ressources d'ici exigent isAdmin === true.
//
// Nécessite le secret de fonction ORDOMAIL_JWT_SECRET (le même que verify-pin,
// verify-admin et secure-data).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveCaller } from "../_shared/resolveCaller.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { validateFile } from "../_shared/upload-validation.ts";
import { trimExcessPostes } from "../_shared/trimPostes.ts";
import { runPurge } from "../_shared/purgeLogic.ts";

// Fréquences proposées dans l'onglet Purge du backoffice — whitelist plutôt
// que d'accepter une expression cron arbitraire depuis le frontend.
const PURGE_SCHEDULES: Record<string, string> = {
  hourly:   "0 * * * *",
  every6h:  "0 */6 * * *",
  every12h: "0 */12 * * *",
  daily:    "0 3 * * *",
  weekly:   "0 3 * * 0",
};
const PURGE_JOB_NAME = "purge-ordonnances-nightly";

Deno.serve(async (req) => {
  const CORS = corsHeaders(req, {
    "Access-Control-Allow-Headers": "content-type, authorization, x-client-info, apikey",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  });
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: CORS });
  }

  try {
    const authHeader = req.headers.get("authorization") || "";
    const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
    const { resource, params } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const jwtSecret   = Deno.env.get("ORDOMAIL_JWT_SECRET")!;
    const sb = createClient(supabaseUrl, serviceKey);

    const { isAdmin } = await resolveCaller(bearer, jwtSecret, sb);
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Réservé aux administrateurs OrdoMail" }),
        { status: 403, headers: CORS });
    }

    // ── Router par ressource ─────────────────────────────────────────────────
    if (resource === "admin_pharmacies") {
      // Colonnes volontairement limitées : jamais smtp_pass_enc ni autres secrets internes,
      // et surtout jamais les PIN/pin_hash des postes (l'ancien .select("*, postes(*)") côté
      // client renvoyait les PIN de vente en clair à quiconque savait appeler l'API anon).
      const { data: pharmacies, error: phErr } = await sb
        .from("pharmacies")
        .select("id, nom, email, adresse, plan, plan_status, created_at, stripe_customer_id, stripe_subscription_id, trial_ends_at, pharmacie_postes(id, actif, pin_hash), pharmacie_users(nom, role)")
        .order("created_at", { ascending: false });
      if (phErr) throw new Error(phErr.message);

      const now30 = new Date(Date.now() - 30 * 86400000).toISOString();
      const now7  = new Date(Date.now() - 7 * 86400000).toISOString();
      const now24 = new Date(Date.now() - 86400000).toISOString();

      const enriched = await Promise.all((pharmacies || []).map(async (ph: any) => {
        const [
          { count: total },
          { count: mois },
          { count: semaine },
          { count: attente },
          { data: canaux },
          { data: offres },
        ] = await Promise.all([
          sb.from("ordonnances").select("*", { count: "exact", head: true }).eq("pharmacie_id", ph.id),
          sb.from("ordonnances").select("*", { count: "exact", head: true }).eq("pharmacie_id", ph.id).gte("received_at", now30),
          sb.from("ordonnances").select("*", { count: "exact", head: true }).eq("pharmacie_id", ph.id).gte("received_at", now7),
          sb.from("ordonnances").select("*", { count: "exact", head: true }).eq("pharmacie_id", ph.id).eq("status", "nouveau").lte("received_at", now24),
          sb.from("ordonnances").select("source").eq("pharmacie_id", ph.id).gte("received_at", now30),
          sb.from("offres_stories").select("id", { count: "exact", head: true }).eq("pharmacie_id", ph.id).eq("actif", true),
        ]);

        const totalCanaux    = canaux?.length || 0;
        const qrCount        = canaux?.filter((o: any) => o.source === "qrcode").length || 0;
        const emailCount     = canaux?.filter((o: any) => o.source === "email").length || 0;
        const canalQrPct     = totalCanaux ? Math.round(qrCount / totalCanaux * 100) : 0;
        const canalEmailPct  = totalCanaux ? Math.round(emailCount / totalCanaux * 100) : 0;
        const postes         = ph.pharmacie_postes || [];
        const pinsConfigures = postes.filter((p: any) => p.pin_hash).length;

        const score = Math.min(100, Math.round(
          (mois || 0) * 0.4 + (semaine || 0) * 2 + canalQrPct * 0.2 +
          postes.filter((p: any) => p.actif && p.pin_hash).length * 5
        ));

        // On ne renvoie jamais pharmacie_postes brut (contient pin_hash) — seulement les agrégats.
        // pharmacie_users réduit au nom du titulaire (role admin) — pas le tableau brut.
        const { pharmacie_postes, pharmacie_users, ...phSafe } = ph;
        const titulaire = (pharmacie_users || []).find((u: any) => u.role === "admin")?.nom || null;
        return {
          ...phSafe,
          titulaire,
          postesActifs: postes.filter((p: any) => p.actif).length,
          postesTotal: postes.length,
          ordos_total: total || 0,
          ordos_mois: mois || 0,
          ordos_semaine: semaine || 0,
          ordos_attente: attente || 0,
          canal_qr_pct: canalQrPct,
          canal_email_pct: canalEmailPct,
          offres_actives: offres?.length || 0,
          pins_configures: pinsConfigures,
          score_activite: score,
          taux_traitement: total ? Math.round(((total - (attente || 0)) / total) * 100) : 0,
        };
      }));

      return new Response(JSON.stringify({ data: enriched }), { headers: CORS });
    }

    if (resource === "admin_pricing") {
      const { data, error } = await sb.from("pricing_plans").select("*").order("sort_order", { ascending: true });
      if (error) throw new Error(error.message);
      return new Response(JSON.stringify({ data }), { headers: CORS });
    }

    if (resource === "admin_update_pricing") {
      const { plans } = params || {};
      if (!Array.isArray(plans) || !plans.length) {
        return new Response(JSON.stringify({ error: "plans requis (tableau)" }),
          { status: 400, headers: CORS });
      }
      const rows = plans.map((p: any, i: number) => ({
        id: p.id,
        label: p.label,
        icon: p.icon,
        color: p.color,
        price: Number(p.price) || 0,
        price_annual: Number(p.priceAnnual) || 0,
        max_postes: Number(p.maxPostes) || 0,
        max_ordos: Number(p.maxOrdos) || 0,
        sort_order: i,
        updated_at: new Date().toISOString(),
      }));
      const { error } = await sb.from("pricing_plans").upsert(rows, { onConflict: "id" });
      if (error) throw new Error(error.message);
      return new Response(JSON.stringify({ success: true }), { headers: CORS });
    }

    if (resource === "admin_stories") {
      const { data, error } = await sb.from("stories_content").select("*").order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return new Response(JSON.stringify({ data }), { headers: CORS });
    }

    if (resource === "admin_stories_write") {
      const { action, id, payload } = params || {};
      if (action === "create") {
        if (!payload) return new Response(JSON.stringify({ error: "payload requis" }), { status: 400, headers: CORS });
        const { data, error } = await sb.from("stories_content").insert(payload).select().single();
        if (error) throw new Error(error.message);
        return new Response(JSON.stringify({ data }), { headers: CORS });
      }
      if (action === "update") {
        if (!id || !payload) return new Response(JSON.stringify({ error: "id et payload requis" }), { status: 400, headers: CORS });
        const { error } = await sb.from("stories_content").update(payload).eq("id", id);
        if (error) throw new Error(error.message);
        return new Response(JSON.stringify({ success: true }), { headers: CORS });
      }
      if (action === "delete") {
        if (!id) return new Response(JSON.stringify({ error: "id requis" }), { status: 400, headers: CORS });
        const { error } = await sb.from("stories_content").delete().eq("id", id);
        if (error) throw new Error(error.message);
        return new Response(JSON.stringify({ success: true }), { headers: CORS });
      }
      return new Response(JSON.stringify({ error: `action inconnue: ${action}` }), { status: 400, headers: CORS });
    }

    // Illustration d'une story santé — bucket public "story-images" (voir
    // migrations/20260825_stories_offres_images.sql) : contenu éditorial déjà
    // visible de tout patient, pas une donnée de santé comme ordonnances-files,
    // donc URL publique directe plutôt qu'une URL signée à renouveler.
    if (resource === "admin_stories_upload_image") {
      const { fileName, fileType, fileBase64 } = params || {};
      if (!fileName || !fileType || !fileBase64) {
        return new Response(JSON.stringify({ error: "fileName, fileType et fileBase64 requis" }),
          { status: 400, headers: CORS });
      }
      let bytes: Uint8Array;
      try {
        bytes = Uint8Array.from(atob(fileBase64), (c) => c.charCodeAt(0));
      } catch (_e) {
        return new Response(JSON.stringify({ error: "Fichier illisible (base64 invalide)" }), { status: 400, headers: CORS });
      }
      const check = validateFile({ name: fileName, type: fileType, size: bytes.length });
      if (!check.ok) {
        return new Response(JSON.stringify({ error: check.error }), { status: 400, headers: CORS });
      }
      const ext  = fileName.split(".").pop()?.toLowerCase() || "jpg";
      const path = `stories/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await sb.storage.from("story-images").upload(path, bytes, { contentType: fileType, upsert: false });
      if (upErr) throw new Error(upErr.message);
      const { data: pub } = sb.storage.from("story-images").getPublicUrl(path);
      return new Response(JSON.stringify({ url: pub.publicUrl }), { headers: CORS });
    }

    if (resource === "admin_update_plan") {
      const { pharmacieId: targetPharmacieId, plan } = params || {};
      if (!targetPharmacieId || !plan) {
        return new Response(JSON.stringify({ error: "pharmacieId et plan requis" }),
          { status: 400, headers: CORS });
      }
      const { error } = await sb.from("pharmacies").update({ plan }).eq("id", targetPharmacieId);
      if (error) throw new Error(error.message);
      await trimExcessPostes(sb, targetPharmacieId, plan);
      return new Response(JSON.stringify({ success: true }), { headers: CORS });
    }

    if (resource === "admin_alerts") {
      // Panneau Monitoring backoffice — voir _shared/alert.ts pour qui écrit ici.
      let q = sb.from("alerts").select("*");
      if (!params?.includeResolved) q = q.eq("resolved", false);
      q = q.order("created_at", { ascending: false }).limit(params?.limit || 200);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return new Response(JSON.stringify({ data }), { headers: CORS });
    }

    if (resource === "admin_alerts_resolve") {
      const { alertId } = params || {};
      if (!alertId) {
        return new Response(JSON.stringify({ error: "alertId requis" }),
          { status: 400, headers: CORS });
      }
      const { error } = await sb.from("alerts")
        .update({ resolved: true, resolved_at: new Date().toISOString() })
        .eq("id", alertId);
      if (error) throw new Error(error.message);
      return new Response(JSON.stringify({ success: true }), { headers: CORS });
    }

    if (resource === "admin_retention_get") {
      const { data, error } = await sb.from("retention_settings")
        .select("ordonnances_retention_days, updated_at, updated_by").eq("id", 1).maybeSingle();
      if (error) throw new Error(error.message);
      return new Response(JSON.stringify({ data }), { headers: CORS });
    }

    if (resource === "admin_retention_set") {
      const { days, updatedBy } = params || {};
      const parsed = days === null ? null : Number(days);
      if (parsed !== null && (!Number.isInteger(parsed) || parsed <= 0)) {
        return new Response(JSON.stringify({ error: "days doit être un entier positif ou null (désactive la purge)" }),
          { status: 400, headers: CORS });
      }
      const { error } = await sb.from("retention_settings")
        .update({ ordonnances_retention_days: parsed, updated_at: new Date().toISOString(), updated_by: updatedBy || null })
        .eq("id", 1);
      if (error) throw new Error(error.message);
      return new Response(JSON.stringify({ success: true }), { headers: CORS });
    }

    // ── Purge des ordonnances : onglet dédié du backoffice (25/08/2026) ────────
    // Fréquence paramétrable (whitelist PURGE_SCHEDULES ci-dessus), déclenchement
    // manuel avec confirmation côté UI, historique lu depuis `alerts` (déjà
    // alimentée par purgeLogic.ts — admin_alerts existant, filtré côté client
    // sur source="purge-ordonnances", pas besoin d'une ressource dédiée).
    if (resource === "admin_purge_schedule_get") {
      const { data, error } = await sb.rpc("get_purge_schedule", { p_job_name: PURGE_JOB_NAME });
      if (error) throw new Error(error.message);
      const row = Array.isArray(data) ? data[0] : data;
      const presetKey = Object.entries(PURGE_SCHEDULES).find(([, expr]) => expr === row?.schedule)?.[0] || null;
      return new Response(JSON.stringify({ data: { schedule: row?.schedule || null, active: row?.active ?? null, presetKey } }), { headers: CORS });
    }

    if (resource === "admin_purge_schedule_set") {
      const { presetKey } = params || {};
      const expr = PURGE_SCHEDULES[presetKey as string];
      if (!expr) {
        return new Response(JSON.stringify({ error: `Fréquence inconnue — valeurs autorisées : ${Object.keys(PURGE_SCHEDULES).join(", ")}` }),
          { status: 400, headers: CORS });
      }
      const { error } = await sb.rpc("alter_purge_schedule", { p_job_name: PURGE_JOB_NAME, p_schedule: expr });
      if (error) throw new Error(error.message);
      return new Response(JSON.stringify({ success: true, schedule: expr }), { headers: CORS });
    }

    if (resource === "admin_purge_run") {
      const result = await runPurge(sb, "backoffice-manuel");
      return new Response(JSON.stringify({ data: result }), { headers: CORS });
    }

    // Recherche RGPD (droits patient — art. 12-22) : localiser les ordonnances
    // d'un patient par son nom, dans la fenêtre de rétention active (purge
    // automatique — voir purge-ordonnances). Ne vérifie PAS l'identité du
    // demandeur — l'UI backoffice doit rappeler explicitement de la vérifier par
    // un autre moyen (téléphone/email) avant toute suppression.
    //
    // @conformite 25/08/2026 — bornée à retention_settings.ordonnances_retention_days
    // au lieu de chercher sans limite de date : un outil de recherche sur "tout
    // l'historique" présuppose une conservation longue, ce qui contredit
    // l'argument "courte période" (art. R.1111-8-8-I al.4 CSP) sur lequel repose
    // l'exemption d'hébergeur de données de santé — voir DEPLOIEMENT_CHECKLIST.md.
    if (resource === "admin_search_ordonnances") {
      const nom = (params?.nom || "").trim();
      if (nom.length < 2) {
        return new Response(JSON.stringify({ error: "Nom trop court (2 caractères minimum)" }),
          { status: 400, headers: CORS });
      }
      const { data: settings } = await sb.from("retention_settings")
        .select("ordonnances_retention_days").eq("id", 1).maybeSingle();
      const days = settings?.ordonnances_retention_days;

      // Échappe les caractères réservés à la syntaxe de filtre PostgREST (`,` `.`
      // `(` `)`) via son mécanisme de guillemettage documenté — sans ça, un nom
      // de recherche habilement construit pouvait injecter des clauses de
      // filtre supplémentaires dans cette requête.
      const esc = nom.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      let query = sb.from("ordonnances")
        .select("id, pharmacie_id, patient_nom, from_name, code_patient, status, received_at, pharmacies(nom)")
        .or(`patient_nom.ilike."%${esc}%",from_name.ilike."%${esc}%"`);
      if (days) query = query.gte("received_at", new Date(Date.now() - days * 86400000).toISOString());
      const { data, error } = await query.order("received_at", { ascending: false }).limit(100);
      if (error) throw new Error(error.message);
      return new Response(JSON.stringify({ data, retentionDays: days ?? null }), { headers: CORS });
    }

    if (resource === "admin_delete_ordonnance") {
      const { ordoId } = params || {};
      if (!ordoId) {
        return new Response(JSON.stringify({ error: "ordoId requis" }),
          { status: 400, headers: CORS });
      }
      const { data: ordo, error: findErr } = await sb.from("ordonnances")
        .select("id, fichier_url").eq("id", ordoId).maybeSingle();
      if (findErr) throw new Error(findErr.message);
      if (!ordo) {
        return new Response(JSON.stringify({ error: "Ordonnance introuvable" }),
          { status: 404, headers: CORS });
      }
      if (ordo.fichier_url) {
        const { error: rmErr } = await sb.storage.from("ordonnances-files").remove([ordo.fichier_url]);
        if (rmErr) console.error("[admin_delete_ordonnance] fichier:", rmErr.message);
      }
      const { error: delErr } = await sb.from("ordonnances").delete().eq("id", ordoId);
      if (delErr) throw new Error(delErr.message);
      return new Response(JSON.stringify({ success: true }), { headers: CORS });
    }

    // ── QR codes pré-imprimés (18/08/2026) ──────────────────────────────────
    // Génération de lots + association manuelle par le staff au moment de
    // l'envoi postal du goodie — voir supabase/migrations/20260818_qr_codes.sql
    // et resolve-qr-code (résolution côté patient).
    if (resource === "admin_qrcodes_generate") {
      const count = Number(params?.count) || 0;
      const batchLabel = params?.batchLabel ? String(params.batchLabel).slice(0, 200) : null;
      if (!count || count < 1 || count > 2000) {
        return new Response(JSON.stringify({ error: "count requis (1 à 2000)" }),
          { status: 400, headers: CORS });
      }
      // Alphabet sans I/O/0/1 (confusion visuelle) — même choix que register-pharmacie.
      const CODE_CHARS = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ";
      function randomCode(): string {
        const arr = new Uint8Array(6);
        crypto.getRandomValues(arr);
        return "QR-" + Array.from(arr, (b) => CODE_CHARS[b % CODE_CHARS.length]).join("");
      }
      function randomToken(): string {
        const arr = new Uint8Array(24);
        crypto.getRandomValues(arr);
        return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
      }
      const seenCodes = new Set<string>();
      const seenTokens = new Set<string>();
      const rows: { code: string; token: string; status: string; batch_label: string | null }[] = [];
      while (rows.length < count) {
        const code = randomCode();
        if (seenCodes.has(code)) continue;
        const token = randomToken();
        if (seenTokens.has(token)) continue;
        seenCodes.add(code); seenTokens.add(token);
        rows.push({ code, token, status: "genere", batch_label: batchLabel });
      }
      const { data, error } = await sb.from("qr_codes").insert(rows).select();
      if (error) throw new Error(error.message);
      return new Response(JSON.stringify({ data }), { headers: CORS });
    }

    if (resource === "admin_qrcodes_list") {
      // token inclus : cette ressource est déjà gate isAdmin (voir plus haut), le
      // visualiseur QR du backoffice (👁️ Voir) en a besoin pour reconstruire l'URL.
      let q = sb.from("qr_codes")
        .select("id, code, token, status, batch_label, created_at, assigned_at, pharmacie_id, pharmacies(nom, email)")
        .order("created_at", { ascending: false })
        .limit(500);
      if (params?.status) q = q.eq("status", params.status);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      // Recherche sur code OU nom/email de la pharmacie liée — filtrage en mémoire
      // (volume admin-only, borné à 500 lignes) plutôt qu'un OR PostgREST à travers
      // une relation, plus simple et suffisant ici.
      const search = String(params?.search || "").toLowerCase().trim();
      const filtered = search
        ? (data || []).filter((r: any) =>
            r.code?.toLowerCase().includes(search) ||
            r.pharmacies?.nom?.toLowerCase().includes(search) ||
            r.pharmacies?.email?.toLowerCase().includes(search))
        : (data || []);
      return new Response(JSON.stringify({ data: filtered }), { headers: CORS });
    }

    if (resource === "admin_qrcodes_assign") {
      const code = String(params?.code || "").trim().toUpperCase();
      const targetPharmacieId = params?.pharmacieId?.toString();
      if (!code || !targetPharmacieId) {
        return new Response(JSON.stringify({ error: "code et pharmacieId requis" }),
          { status: 400, headers: CORS });
      }
      const { data: already } = await sb
        .from("qr_codes")
        .select("id")
        .eq("pharmacie_id", targetPharmacieId)
        .eq("status", "attribue")
        .maybeSingle();
      if (already) {
        return new Response(JSON.stringify({ error: "Cette pharmacie a déjà un goodie associé" }),
          { status: 409, headers: CORS });
      }
      const { data, error } = await sb
        .from("qr_codes")
        .update({ pharmacie_id: targetPharmacieId, status: "attribue", assigned_at: new Date().toISOString() })
        .eq("code", code)
        .eq("status", "genere")
        .select()
        .maybeSingle();
      if (error) {
        // Ré-audit du 20/08/2026 : le SELECT ci-dessus (ligne ~339) et cet UPDATE
        // sont deux allers-retours séparés — une course entre deux appels
        // concurrents pour la même pharmacie pouvait passer les deux avant que
        // l'un des deux ne committe. L'index unique partiel
        // idx_qr_codes_one_attribue_per_pharmacie (migration 20260820) rend
        // cet UPDATE atomique : le perdant de la course échoue ici en 23505
        // au lieu de réussir silencieusement.
        if (error.code === "23505") {
          return new Response(JSON.stringify({ error: "Cette pharmacie a déjà un goodie associé" }),
            { status: 409, headers: CORS });
        }
        throw new Error(error.message);
      }
      if (!data) {
        return new Response(JSON.stringify({ error: "Code inconnu ou déjà attribué" }),
          { status: 404, headers: CORS });
      }
      return new Response(JSON.stringify({ data }), { headers: CORS });
    }

    if (resource === "admin_qrcodes_unassign") {
      // Déconnecte un code de sa pharmacie sans le supprimer — remet en stock
      // ("genere") pour ré-attribution ultérieure à un autre client (ex.
      // pharmacie qui résilie et récupère son sticker physique), contrairement
      // à admin_qrcodes_delete qui invalide le sticker de façon définitive.
      const id = params?.id?.toString();
      if (!id) {
        return new Response(JSON.stringify({ error: "id requis" }), { status: 400, headers: CORS });
      }
      const { data, error } = await sb
        .from("qr_codes")
        .update({ pharmacie_id: null, status: "genere", assigned_at: null })
        .eq("id", id)
        .eq("status", "attribue")
        .select()
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) {
        return new Response(JSON.stringify({ error: "Code introuvable ou déjà en stock" }),
          { status: 404, headers: CORS });
      }
      return new Response(JSON.stringify({ data }), { headers: CORS });
    }

    if (resource === "admin_qrcodes_delete") {
      const id = params?.id?.toString();
      if (!id) {
        return new Response(JSON.stringify({ error: "id requis" }), { status: 400, headers: CORS });
      }
      // Pas de garde particulière sur le statut ici : supprimer un code déjà
      // attribué est une action admin volontaire (ex. sticker envoyé par erreur,
      // décommissionné) — le front avertit explicitement dans ce cas avant
      // d'appeler cette ressource. La pharmacie concernée garde de toute façon
      // son lien ?patient=&t= habituel, indépendant de qr_codes.
      const { error } = await sb.from("qr_codes").delete().eq("id", id);
      if (error) throw new Error(error.message);
      return new Response(JSON.stringify({ success: true }), { headers: CORS });
    }

    return new Response(JSON.stringify({ error: `Ressource inconnue: ${resource}` }),
      { status: 400, headers: CORS });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }),
      { status: 500, headers: CORS });
  }
});
