// OrdoMail — Edge Function secure-data
// @phase1-security 23/07/2026
// @isolation-pannes 13/08/2026 — resserrée aux ressources scopées à une pharmacie
// (vendeur/titulaire). Les 12 ressources backoffice OrdoMail Business ont été
// déplacées vers secure-data-admin (fonction et déploiement séparés) : un bug ou
// un déploiement raté sur l'admin n'affecte plus jamais ce flux, celui dont
// dépend directement le métier (consultation/impression des ordonnances).
//
// Remplace les lectures directes en clé anon (fetchOrdonnances, offre_interets)
// qui reposaient sur des policies RLS permissives pour fonctionner avec des
// sessions "vendeur" non authentifiées. Confirmé en audit : une requête REST
// anonyme suffisait à lire les ordonnances (données de santé) de n'importe
// quelle pharmacie.
//
// Toute lecture passe maintenant par ici et par une vérification serveur de
// l'appelant (voir _shared/resolveCaller.ts) :
//   - jeton vendeur émis par verify-pin (rôle "vendeur", scope = une pharmacie)
//   - session Supabase Auth du titulaire (email/mot de passe), résolue via
//     pharmacie_users
//
// Nécessite le secret de fonction ORDOMAIL_JWT_SECRET (le même que verify-pin,
// verify-admin et secure-data-admin — supabase secrets set ORDOMAIL_JWT_SECRET=...).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveCaller } from "../_shared/resolveCaller.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { validateFile } from "../_shared/upload-validation.ts";

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

    const { pharmacieId } = await resolveCaller(bearer, jwtSecret, sb);

    if (!pharmacieId) {
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
      // actif=true seulement : le patient retire son intérêt via un UPDATE
      // (actif=false), plus via DELETE — voir 20260727_fix_offre_interets_upsert_delete.sql.
      let q = sb.from("offre_interets").select("*").eq("pharmacie_id", pharmacieId).eq("actif", true);
      if (params?.codePatient) q = q.eq("code_patient", params.codePatient);
      if (params?.dateJour)    q = q.eq("date_jour", params.dateJour);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return new Response(JSON.stringify({ data }), { headers: CORS });
    }

    if (resource === "story_metrics") {
      if (!pharmacieId) {
        return new Response(JSON.stringify({ error: "Réservé aux comptes pharmacie" }),
          { status: 403, headers: CORS });
      }
      let q = sb.from("story_metrics").select("*").eq("pharmacie_id", pharmacieId);
      if (params?.codePatient) q = q.eq("code_patient", params.codePatient);
      if (params?.storyId)     q = q.eq("story_id", params.storyId);
      if (params?.since)       q = q.gte("created_at", params.since);
      q = q.order("created_at", { ascending: false }).limit(params?.limit || 500);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return new Response(JSON.stringify({ data }), { headers: CORS });
    }

    // Catalogue global de stories (stories_content) fusionné avec la sélection
    // actif/inactif propre à cette pharmacie — voir pharmacie_stories_selection.
    if (resource === "pharmacie_stories") {
      if (!pharmacieId) {
        return new Response(JSON.stringify({ error: "Réservé aux comptes pharmacie" }),
          { status: 403, headers: CORS });
      }
      const { data: stories, error: storiesErr } = await sb
        .from("stories_content").select("*").eq("actif", true).order("created_at", { ascending: false });
      if (storiesErr) throw new Error(storiesErr.message);
      const { data: selections, error: selErr } = await sb
        .from("pharmacie_stories_selection").select("story_id, actif").eq("pharmacie_id", pharmacieId);
      if (selErr) throw new Error(selErr.message);
      const selMap = new Map((selections || []).map(s => [s.story_id, s.actif]));
      // Absence de ligne de sélection = affichée par défaut (true)
      const data = (stories || []).map(s => ({ ...s, pharmacie_actif: selMap.has(s.id) ? selMap.get(s.id) : true }));
      return new Response(JSON.stringify({ data }), { headers: CORS });
    }

    // Activer/désactiver une story du catalogue pour cette pharmacie uniquement.
    if (resource === "pharmacie_stories_write") {
      if (!pharmacieId) {
        return new Response(JSON.stringify({ error: "Réservé aux comptes pharmacie" }),
          { status: 403, headers: CORS });
      }
      const { storyId, actif } = params || {};
      if (!storyId || typeof actif !== "boolean") {
        return new Response(JSON.stringify({ error: "storyId et actif (booléen) requis" }),
          { status: 400, headers: CORS });
      }
      const { error } = await sb.from("pharmacie_stories_selection").upsert(
        { pharmacie_id: pharmacieId, story_id: storyId, actif, updated_at: new Date().toISOString() },
        { onConflict: "pharmacie_id,story_id" },
      );
      if (error) throw new Error(error.message);
      return new Response(JSON.stringify({ success: true }), { headers: CORS });
    }

    // Upload du fichier d'une ordonnance (photo/PDF), depuis le Dashboard vendeur/
    // titulaire.
    //
    // Audit du 17/08/2026 (finding 8, durci le 18/08/2026) : ce chemin passait
    // avant par un appel direct sb.storage.upload() en clé anon (le vendeur n'a
    // pas de session Supabase Auth réelle) — la policy INSERT sur
    // storage.objects n'ayant AUCUNE restriction de chemin au-delà du bucket,
    // n'importe quel appelant anonyme pouvait écrire un fichier arbitraire sous
    // N'IMPORTE QUEL {pharmacie_id}/{ordonnance_id}/, y compris celui d'une
    // pharmacie qui n'est pas la sienne. En passant par ici (clé de service,
    // même modèle que submit-ordonnance), l'appartenance de l'ordonnance à la
    // pharmacie de l'appelant est vérifiée AVANT d'écrire, et la policy INSERT
    // publique sur storage.objects peut être supprimée (voir
    // 20260818_close_storage_anon_write.sql).
    if (resource === "ordonnances_upload_file") {
      if (!pharmacieId) {
        return new Response(JSON.stringify({ error: "Réservé aux comptes pharmacie" }),
          { status: 403, headers: CORS });
      }
      const { ordoId, fileName, fileType, fileBase64 } = params || {};
      if (!ordoId || !fileName || !fileType || !fileBase64) {
        return new Response(JSON.stringify({ error: "ordoId, fileName, fileType et fileBase64 requis" }),
          { status: 400, headers: CORS });
      }

      const { data: existing, error: findErr } = await sb
        .from("ordonnances")
        .select("id, pharmacie_id")
        .eq("id", ordoId)
        .maybeSingle();
      if (findErr || !existing || existing.pharmacie_id !== pharmacieId) {
        return new Response(JSON.stringify({ error: "Ordonnance introuvable" }),
          { status: 404, headers: CORS });
      }

      let bytes: Uint8Array;
      try {
        bytes = Uint8Array.from(atob(fileBase64), (c) => c.charCodeAt(0));
      } catch (_e) {
        return new Response(JSON.stringify({ error: "Fichier illisible (base64 invalide)" }),
          { status: 400, headers: CORS });
      }

      const check = validateFile({ name: fileName, type: fileType, size: bytes.length });
      if (!check.ok) {
        return new Response(JSON.stringify({ error: check.error }), { status: 400, headers: CORS });
      }

      const ext  = fileName.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${pharmacieId}/${ordoId}/ordonnance.${ext}`;

      const { error: upErr } = await sb.storage
        .from("ordonnances-files")
        .upload(path, bytes, { contentType: fileType, upsert: true });
      if (upErr) throw new Error(upErr.message);

      await sb.from("ordonnances").update({
        fichier_url:    path,
        fichier_nom:    fileName,
        fichier_type:   ext === "pdf" ? "pdf" : "image",
        fichier_taille: `${Math.round(bytes.length / 1024)} Ko`,
      }).eq("id", ordoId);

      const { data: signed } = await sb.storage
        .from("ordonnances-files")
        .createSignedUrl(path, 3600);

      return new Response(JSON.stringify({ success: true, path, signedUrl: signed?.signedUrl || null }),
        { headers: CORS });
    }

    return new Response(JSON.stringify({ error: `Ressource inconnue: ${resource}` }),
      { status: 400, headers: CORS });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }),
      { status: 500, headers: CORS });
  }
});
