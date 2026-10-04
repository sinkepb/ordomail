import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveCaller } from "../_shared/resolveCaller.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { validateFile } from "../_shared/upload-validation.ts";
import { isTiff, convertTiffToPng } from "../_shared/tiffConvert.ts";
import { signToken } from "../_shared/jwt.ts";
import { planHasFeature } from "../_shared/planFeatures.ts";
import { reportAlert } from "../_shared/alert.ts";
import { resolveAppOrigin } from "../_shared/checkout.ts";
import { sendSms } from "../_shared/sms.ts";
import { sendTransactionalEmail } from "../_shared/email.ts";
import { generateShortToken } from "../_shared/shortToken.ts";
import { buildRappelLien, buildRappelMessage, mergeCommentairePartiel } from "../_shared/rappelLogic.ts";
import { supprimerRappelAction, preparerRappelAction } from "../_shared/rappelHandlers.ts";
import { computeRappelsStats } from "../_shared/rappelsStatsLogic.ts";
import { estNumeroFixe } from "../_shared/telephone.ts";
import { getSmsConsommation } from "../_shared/smsQuota.ts";
import { escapeHtml } from "../_shared/html.ts";
import { safeErrorMessage } from "../_shared/errors.ts";
import type { ContexteSecureData } from "./contexte.ts";

export async function handle_offres(ctx: ContexteSecureData): Promise<Response | null> {
  const { req, sb, supabaseUrl, serviceKey, jwtSecret, pharmacieId, vendeurSub, callerUserId, resource, params, CORS } = ctx;
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

    // Illustration d'une offre pharmacie — bucket public "story-images" (voir
    // migrations/20260825_stories_offres_images.sql), même bucket que les stories
    // santé admin. Chemin préfixé par pharmacieId (déjà vérifié par
    // resolveCaller ci-dessus) : pas de vérification d'appartenance d'offre
    // nécessaire, l'offre peut ne pas encore exister au moment de l'upload
    // (créée juste après avec l'URL obtenue ici).
    if (resource === "offre_upload_image") {
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
      const path = `offres/${pharmacieId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await sb.storage.from("story-images").upload(path, bytes, { contentType: fileType, upsert: false });
      if (upErr) throw new Error(upErr.message);
      const { data: pub } = sb.storage.from("story-images").getPublicUrl(path);
      // { data: {...} } : lib/supabase/client.js:callSecureData renvoie body.data,
      // pas le body brut (contrairement au callSecureData local de secure-data-admin) —
      // ordonnances_upload_file suit désormais la même forme (corrigé le 25/08/2026,
      // renvoyait avant `undefined` à l'appelant faute de wrapper data).
      return new Response(JSON.stringify({ data: { url: pub.publicUrl } }), { headers: CORS });
    }

    // ── Offres mobile (03/09/2026) ───────────────────────────────────────────
    // Lien magique : le PC (vendeur ou titulaire, déjà authentifié via
    // resolveCaller ci-dessus) demande un jeton mobile de courte durée à
    // encoder dans un QR code. Le mobile qui scanne n'a JAMAIS besoin de se
    // connecter — ce jeton, vérifié explicitement par mobile-offre (pas par
    // resolveCaller : rôle distinct, jamais vendeur/titulaire/admin), est sa
    // seule preuve d'appartenance à la pharmacie pendant sa durée de vie.
    if (resource === "offre_mint_mobile_token") {
      if (!pharmacieId) {
        return new Response(JSON.stringify({ error: "Réservé aux comptes pharmacie" }), { status: 403, headers: CORS });
      }
      const jwtSecret = Deno.env.get("ORDOMAIL_JWT_SECRET")!;
      const MOBILE_TOKEN_TTL_S = 15 * 60; // 15 min — le temps de faire le tour du magasin avec le QR affiché
      const token = await signToken({ role: "offre_mobile", pharmacie_id: pharmacieId }, jwtSecret, MOBILE_TOKEN_TTL_S);
      const ALLOWED_APP_ORIGINS = [Deno.env.get("APP_URL"), "https://ordomail.fr", "http://localhost:5173", "http://127.0.0.1:5173"];
      const base = resolveAppOrigin(params?.appUrl, ALLOWED_APP_ORIGINS, Deno.env.get("APP_URL") || "https://ordomail.fr");
      return new Response(JSON.stringify({ data: { url: `${base}/?m=${token}`, expiresInSeconds: MOBILE_TOKEN_TTL_S } }), { headers: CORS });
    }

    // Rupture de stock — distinct de la pause (`actif`, déjà géré par le
    // formulaire existant) : le produit existe toujours, juste plus au
    // comptoir maintenant. Voir migration 20260903_offres_mobile_phase1.sql.
    if (resource === "offre_mark_epuise") {
      if (!pharmacieId) {
        return new Response(JSON.stringify({ error: "Réservé aux comptes pharmacie" }), { status: 403, headers: CORS });
      }
      const { offreId, epuise } = params || {};
      if (!offreId || typeof epuise !== "boolean") {
        return new Response(JSON.stringify({ error: "offreId et epuise (booléen) requis" }), { status: 400, headers: CORS });
      }
      const { data: offre } = await sb.from("offres_stories").select("id, pharmacie_id").eq("id", offreId).maybeSingle();
      if (!offre || offre.pharmacie_id !== pharmacieId) {
        return new Response(JSON.stringify({ error: "Offre introuvable" }), { status: 404, headers: CORS });
      }
      const { error } = await sb.from("offres_stories").update({ epuise }).eq("id", offreId);
      if (error) throw new Error(error.message);
      return new Response(JSON.stringify({ data: { success: true } }), { headers: CORS });
    }

    // Catalogue de modèles saisonniers + état d'activation pour CETTE pharmacie
    // (une pharmacie a au plus une instance active par modèle, voir l'index
    // unique pharmacie_id/template_id de la migration).
    if (resource === "offre_templates_list") {
      if (!pharmacieId) {
        return new Response(JSON.stringify({ error: "Réservé aux comptes pharmacie" }), { status: 403, headers: CORS });
      }
      const { data: templates, error: tplErr } = await sb.from("offre_templates").select("*").eq("actif", true).order("saison").order("ordre");
      if (tplErr) throw new Error(tplErr.message);
      const { data: mine, error: mineErr } = await sb.from("offres_stories").select("template_id, actif").eq("pharmacie_id", pharmacieId).not("template_id", "is", null);
      if (mineErr) throw new Error(mineErr.message);
      const activeMap = new Map((mine || []).map(o => [o.template_id, o.actif]));
      const data = (templates || []).map(t => ({ ...t, pharmacie_actif: activeMap.get(t.id) === true }));
      return new Response(JSON.stringify({ data }), { headers: CORS });
    }

    // Activer/désactiver un modèle en un clic ("zéro design") — crée l'offre
    // au premier ON, réactive/désactive ensuite la MÊME ligne (jamais de
    // doublon, voir l'index unique). Vérifie le plan serveur-side : la policy
    // RLS pharmacie_insert_own_offres ne s'applique pas ici (clé de service),
    // donc c'est ce contrôle explicite qui empêche un plan Essentiel de
    // publier des offres via ce chemin (voir _shared/planFeatures.ts).
    if (resource === "offre_template_toggle") {
      if (!pharmacieId) {
        return new Response(JSON.stringify({ error: "Réservé aux comptes pharmacie" }), { status: 403, headers: CORS });
      }
      const { templateId, on } = params || {};
      if (!templateId || typeof on !== "boolean") {
        return new Response(JSON.stringify({ error: "templateId et on (booléen) requis" }), { status: 400, headers: CORS });
      }
      const { data: ph } = await sb.from("pharmacies").select("plan").eq("id", pharmacieId).maybeSingle();
      if (on && !(await planHasFeature(sb, ph?.plan || "starter", "offresStories"))) {
        return new Response(JSON.stringify({ error: "Fonctionnalité non disponible sur ce plan" }), { status: 403, headers: CORS });
      }
      const { data: template } = await sb.from("offre_templates").select("*").eq("id", templateId).maybeSingle();
      if (!template) {
        return new Response(JSON.stringify({ error: "Modèle introuvable" }), { status: 404, headers: CORS });
      }
      const { data: existing } = await sb.from("offres_stories").select("id").eq("pharmacie_id", pharmacieId).eq("template_id", templateId).maybeSingle();
      if (existing) {
        const { error } = await sb.from("offres_stories").update({ actif: on }).eq("id", existing.id);
        if (error) throw new Error(error.message);
      } else if (on) {
        const { error } = await sb.from("offres_stories").insert({
          pharmacie_id: pharmacieId, template_id: templateId, type: template.type,
          titre: template.titre, description: template.description, emoji: template.emoji,
          badge: template.badge, couleur: template.couleur, actif: true, created_via: "template",
        });
        if (error) throw new Error(error.message);
      }
      return new Response(JSON.stringify({ data: { success: true } }), { headers: CORS });
    }

    // File d'attente "Click & Collect" — l'encaissement se fait physiquement
    // au TPE de la pharmacie (voir description de la mission : aucun paiement
    // Stripe pour ce produit), ceci n'est qu'une liste de ce qu'un patient a
    // dit vouloir récupérer.
    if (resource === "offre_reservations_list") {
      if (!pharmacieId) {
        return new Response(JSON.stringify({ error: "Réservé aux comptes pharmacie" }), { status: 403, headers: CORS });
      }
      const { data, error } = await sb.from("offre_reservations")
        .select("id, offre_id, code_patient, quantite, statut, created_at, offres_stories(titre, prix, emoji)")
        .eq("pharmacie_id", pharmacieId).eq("statut", "en_attente")
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return new Response(JSON.stringify({ data }), { headers: CORS });
    }

    if (resource === "offre_reservation_marquer") {
      if (!pharmacieId) {
        return new Response(JSON.stringify({ error: "Réservé aux comptes pharmacie" }), { status: 403, headers: CORS });
      }
      const { reservationId, statut } = params || {};
      if (!reservationId || !["recuperee", "annulee"].includes(statut)) {
        return new Response(JSON.stringify({ error: "reservationId requis, statut ∈ {recuperee, annulee}" }), { status: 400, headers: CORS });
      }
      const { data: resa } = await sb.from("offre_reservations").select("id, pharmacie_id").eq("id", reservationId).maybeSingle();
      if (!resa || resa.pharmacie_id !== pharmacieId) {
        return new Response(JSON.stringify({ error: "Réservation introuvable" }), { status: 404, headers: CORS });
      }
      const { error } = await sb.from("offre_reservations").update({ statut, updated_at: new Date().toISOString() }).eq("id", reservationId);
      if (error) throw new Error(error.message);
      return new Response(JSON.stringify({ data: { success: true } }), { headers: CORS });
    }

  return null;
}
