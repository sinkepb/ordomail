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
        .select("id, nom, email, plan, plan_status, created_at, stripe_customer_id, stripe_subscription_id, trial_ends_at, pharmacie_postes(id, actif, pin_hash)")
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
        const { pharmacie_postes, ...phSafe } = ph;
        return {
          ...phSafe,
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

    if (resource === "admin_update_plan") {
      const { pharmacieId: targetPharmacieId, plan } = params || {};
      if (!targetPharmacieId || !plan) {
        return new Response(JSON.stringify({ error: "pharmacieId et plan requis" }),
          { status: 400, headers: CORS });
      }
      const { error } = await sb.from("pharmacies").update({ plan }).eq("id", targetPharmacieId);
      if (error) throw new Error(error.message);
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

    // Recherche RGPD (droits patient — art. 12-22) : localiser TOUT l'historique
    // des ordonnances d'un patient par son nom, au-delà de la fenêtre de 7 jours
    // normalement chargée par le dashboard vendeur. Ne vérifie PAS l'identité du
    // demandeur — l'UI backoffice doit rappeler explicitement de la vérifier par
    // un autre moyen (téléphone/email) avant toute suppression.
    if (resource === "admin_search_ordonnances") {
      const nom = (params?.nom || "").trim();
      if (nom.length < 2) {
        return new Response(JSON.stringify({ error: "Nom trop court (2 caractères minimum)" }),
          { status: 400, headers: CORS });
      }
      const { data, error } = await sb.from("ordonnances")
        .select("id, pharmacie_id, patient_nom, from_name, code_patient, status, received_at, pharmacies(nom)")
        .or(`patient_nom.ilike.%${nom}%,from_name.ilike.%${nom}%`)
        .order("received_at", { ascending: false })
        .limit(100);
      if (error) throw new Error(error.message);
      return new Response(JSON.stringify({ data }), { headers: CORS });
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

    return new Response(JSON.stringify({ error: `Ressource inconnue: ${resource}` }),
      { status: 400, headers: CORS });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }),
      { status: 500, headers: CORS });
  }
});
