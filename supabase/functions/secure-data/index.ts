// OrdoMail — Edge Function secure-data
// @phase1-security 23/07/2026
//
// Remplace les lectures directes en clé anon (fetchOrdonnances, offre_interets,
// liste des pharmacies côté backoffice) qui reposaient sur des policies RLS
// permissives pour fonctionner avec des sessions "vendeur" non authentifiées.
// Confirmé en audit : une requête REST anonyme suffisait à lire les ordonnances
// (données de santé) de n'importe quelle pharmacie.
//
// Toute lecture passe maintenant par ici et par une vérification serveur de
// l'appelant :
//   - jeton vendeur émis par verify-pin (rôle "vendeur", scope = une pharmacie)
//   - jeton admin émis par verify-admin (rôle "admin", accès backoffice)
//   - session Supabase Auth du titulaire (email/mot de passe), résolue via
//     pharmacie_users
//
// Nécessite le secret de fonction ORDOMAIL_JWT_SECRET (le même que verify-pin
// et verify-admin — supabase secrets set ORDOMAIL_JWT_SECRET=...).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyToken } from "../_shared/jwt.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, x-client-info, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

Deno.serve(async (req) => {
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

    // ── Identifier l'appelant ────────────────────────────────────────────────
    let pharmacieId: string | null = null;
    let isAdmin = false;

    const internal = bearer ? await verifyToken(bearer, jwtSecret) : { valid: false as const, error: "" };
    if (internal.valid && internal.payload.role === "vendeur") {
      pharmacieId = String(internal.payload.pharmacie_id);
    } else if (internal.valid && internal.payload.role === "admin") {
      isAdmin = true;
    } else if (bearer) {
      // Ni jeton vendeur ni jeton admin — tenter une session Supabase Auth (titulaire)
      const { data: userData } = await sb.auth.getUser(bearer);
      if (userData?.user) {
        const { data: link } = await sb
          .from("pharmacie_users")
          .select("pharmacie_id")
          .eq("id", userData.user.id)
          .maybeSingle();
        if (link) pharmacieId = link.pharmacie_id;
      }
    }

    if (!pharmacieId && !isAdmin) {
      return new Response(JSON.stringify({ error: "Authentification requise" }),
        { status: 401, headers: CORS });
    }

    // ── Router par ressource ─────────────────────────────────────────────────
    if (resource === "ordonnances") {
      if (!pharmacieId) {
        return new Response(JSON.stringify({ error: "Réservé aux comptes pharmacie" }),
          { status: 403, headers: CORS });
      }
      const days  = Number(params?.days) || 7;
      const since = new Date(Date.now() - days * 86400000).toISOString();
      const { data, error } = await sb
        .from("ordonnances")
        .select("*")
        .eq("pharmacie_id", pharmacieId)
        .gte("received_at", since)
        .order("received_at", { ascending: false });
      if (error) throw new Error(error.message);
      return new Response(JSON.stringify({ data }), { headers: CORS });
    }

    if (resource === "ordonnances_update") {
      if (!pharmacieId) {
        return new Response(JSON.stringify({ error: "Réservé aux comptes pharmacie" }),
          { status: 403, headers: CORS });
      }
      const { ordoId, patch } = params || {};
      if (!ordoId || !patch || typeof patch !== "object") {
        return new Response(JSON.stringify({ error: "ordoId et patch requis" }),
          { status: 400, headers: CORS });
      }
      // Vérifier que l'ordonnance appartient bien à la pharmacie de l'appelant
      // (un poste vendeur n'a pas de session Supabase Auth donc pas de RLS pour le protéger).
      const { data: existing, error: findErr } = await sb
        .from("ordonnances")
        .select("id, pharmacie_id")
        .eq("id", ordoId)
        .maybeSingle();
      if (findErr || !existing || existing.pharmacie_id !== pharmacieId) {
        return new Response(JSON.stringify({ error: "Ordonnance introuvable" }),
          { status: 404, headers: CORS });
      }
      // Liste blanche des colonnes modifiables — jamais pharmacie_id, id, received_at...
      const ALLOWED_FIELDS = [
        "status", "printed_at", "printed_by", "patient_nom", "patient_cv", "medecin",
        "date_prescription", "medicaments", "fichier_url", "fichier_nom", "fichier_type", "fichier_taille",
      ];
      const safePatch: Record<string, unknown> = {};
      for (const k of Object.keys(patch)) if (ALLOWED_FIELDS.includes(k)) safePatch[k] = (patch as any)[k];

      const { error: updErr } = await sb.from("ordonnances").update(safePatch).eq("id", ordoId);
      if (updErr) throw new Error(updErr.message);
      return new Response(JSON.stringify({ success: true }), { headers: CORS });
    }

    if (resource === "pharmacie_info") {
      if (!pharmacieId) {
        return new Response(JSON.stringify({ error: "Réservé aux comptes pharmacie" }),
          { status: 403, headers: CORS });
      }
      // Utilisé par le dashboard vendeur (jeton, pas de session Supabase Auth) à la place
      // d'un select('*') direct — jamais de postes/pin_hash ici, un vendeur n'en a pas besoin
      // (les écrans postes/PIN sont réservés au titulaire, qui utilise fetchPharmacie normal).
      const { data, error } = await sb
        .from("pharmacies")
        .select("id, nom, couleur, plan, plan_status, sonnette_active, code_vendeur, email_reception")
        .eq("id", pharmacieId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return new Response(JSON.stringify({ data }), { headers: CORS });
    }

    if (resource === "offre_interets") {
      if (!pharmacieId) {
        return new Response(JSON.stringify({ error: "Réservé aux comptes pharmacie" }),
          { status: 403, headers: CORS });
      }
      let q = sb.from("offre_interets").select("*").eq("pharmacie_id", pharmacieId);
      if (params?.codePatient) q = q.eq("code_patient", params.codePatient);
      if (params?.dateJour)    q = q.eq("date_jour", params.dateJour);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return new Response(JSON.stringify({ data }), { headers: CORS });
    }

    if (resource === "admin_pharmacies") {
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: "Réservé aux administrateurs OrdoMail" }),
          { status: 403, headers: CORS });
      }
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
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: "Réservé aux administrateurs OrdoMail" }),
          { status: 403, headers: CORS });
      }
      const { data, error } = await sb.from("pricing_plans").select("*").order("sort_order", { ascending: true });
      if (error) throw new Error(error.message);
      return new Response(JSON.stringify({ data }), { headers: CORS });
    }

    if (resource === "admin_update_pricing") {
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: "Réservé aux administrateurs OrdoMail" }),
          { status: 403, headers: CORS });
      }
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

    if (resource === "admin_update_plan") {
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: "Réservé aux administrateurs OrdoMail" }),
          { status: 403, headers: CORS });
      }
      const { pharmacieId: targetPharmacieId, plan } = params || {};
      if (!targetPharmacieId || !plan) {
        return new Response(JSON.stringify({ error: "pharmacieId et plan requis" }),
          { status: 400, headers: CORS });
      }
      const { error } = await sb.from("pharmacies").update({ plan }).eq("id", targetPharmacieId);
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
