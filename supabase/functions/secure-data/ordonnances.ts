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

export async function handle_ordonnances(ctx: ContexteSecureData): Promise<Response | null> {
  const { req, sb, supabaseUrl, serviceKey, jwtSecret, pharmacieId, vendeurSub, callerUserId, resource, params, CORS } = ctx;
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

    // Suppression définitive d'une ordonnance (18/09/2026, demande titulaire) —
    // fichier Storage ET ligne en base, jamais l'un sans l'autre. Toujours
    // précédée d'une confirmation côté client (DeleteConfirmModal) : aucune
    // suppression accidentelle possible depuis l'UI, mais le serveur reste la
    // seule autorité — même vérification d'appartenance que ordonnances_update.
    if (resource === "ordonnances_delete") {
      if (!pharmacieId) {
        return new Response(JSON.stringify({ error: "Réservé aux comptes pharmacie" }),
          { status: 403, headers: CORS });
      }
      const { ordoId } = params || {};
      if (!ordoId) {
        return new Response(JSON.stringify({ error: "ordoId requis" }),
          { status: 400, headers: CORS });
      }
      const { data: existing, error: findErr } = await sb
        .from("ordonnances")
        .select("id, pharmacie_id, fichier_url")
        .eq("id", ordoId)
        .maybeSingle();
      if (findErr || !existing || existing.pharmacie_id !== pharmacieId) {
        return new Response(JSON.stringify({ error: "Ordonnance introuvable" }),
          { status: 404, headers: CORS });
      }
      if (existing.fichier_url) {
        // Best-effort : un fichier déjà absent (ou une erreur de storage) ne doit
        // pas empêcher la suppression de la ligne elle-même.
        await sb.storage.from("ordonnances-files").remove([existing.fichier_url]).catch(() => {});
      }
      const { error: delErr } = await sb.from("ordonnances").delete().eq("id", ordoId);
      if (delErr) throw new Error(delErr.message);
      return new Response(JSON.stringify({ data: { success: true } }), { headers: CORS });
    }

    // Création manuelle d'une ordonnance depuis le dashboard (26/09/2026) — le
    // pharmacien/vendeur ajoute une ordonnance depuis son ordinateur (pas via
    // le flux patient QR code/email), typiquement pour créer un rappel de
    // renouvellement sans ordonnance déjà présente dans OrdoMail (voir "+
    // Nouveau rappel", RappelOrdonnanceUpload côté client).
    //
    // Insère la ligne PUIS uploade le fichier, plutôt que de réutiliser
    // ordonnances_upload_file (juste en dessous) : cette dernière EXIGE une
    // ligne déjà existante et sert de garde-fou anti-IDOR (voir son
    // commentaire) — mélanger création et upload y affaiblirait ce garde-fou.
    if (resource === "ordonnances_create") {
      if (!pharmacieId) {
        return new Response(JSON.stringify({ error: "Réservé aux comptes pharmacie" }), { status: 403, headers: CORS });
      }
      const { fileName, fileType, fileBase64 } = params || {};
      if (!fileName || !fileType || !fileBase64) {
        return new Response(JSON.stringify({ error: "fileName, fileType et fileBase64 requis" }), { status: 400, headers: CORS });
      }
      let bytes: Uint8Array;
      try {
        bytes = Uint8Array.from(atob(fileBase64), (c) => c.charCodeAt(0));
      } catch (_e) {
        return new Response(JSON.stringify({ error: "Fichier illisible (base64 invalide)" }), { status: 400, headers: CORS });
      }
      const checkFile = validateFile({ name: fileName, type: fileType, size: bytes.length });
      if (!checkFile.ok) {
        return new Response(JSON.stringify({ error: checkFile.error }), { status: 400, headers: CORS });
      }

      // TIFF → PNG au dépôt (03/10/2026, retour pharmacien — LGO qui exporte
      // en .tiff) — voir _shared/tiffConvert.ts. Jamais de .tiff stocké tel
      // quel : aucun navigateur ne sait l'afficher (OrdonnanceViewerModal,
      // impression, OCR en dépendent tous).
      let uploadBytes = bytes, uploadFileType = fileType, uploadFileName = fileName;
      if (isTiff(fileName, fileType)) {
        try {
          uploadBytes = convertTiffToPng(bytes);
          uploadFileType = "image/png";
          uploadFileName = fileName.replace(/\.\w+$/, "") + ".png";
        } catch (e) {
          return new Response(JSON.stringify({ error: (e as Error).message || "Fichier TIFF illisible" }), { status: 400, headers: CORS });
        }
      }

      const { data: ordo, error: insertError } = await sb.from("ordonnances").insert({
        pharmacie_id: pharmacieId,
        source: "upload",
        // Déjà traitée (01/10/2026, retour titulaire) — cette ordonnance
        // n'existe que comme pièce jointe au rappel qu'on est en train de
        // créer (seul appelant de cette ressource, voir commentaire plus
        // haut) : jamais besoin de l'imprimer/traiter au comptoir, elle ne
        // doit donc pas encombrer la file "Nouveau" de l'onglet Ordonnances.
        status: "imprime",
        from_name: vendeurSub ? "Ajout manuel (poste)" : "Ajout manuel (titulaire)",
      }).select().single();
      if (insertError) throw new Error(insertError.message);

      const ext  = uploadFileName.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${pharmacieId}/${ordo.id}/ordonnance.${ext}`;
      const { error: upErr } = await sb.storage.from("ordonnances-files").upload(path, uploadBytes, { contentType: uploadFileType, upsert: true });
      if (upErr) throw new Error(upErr.message);

      await sb.from("ordonnances").update({
        fichier_url:    path,
        fichier_nom:    uploadFileName,
        fichier_type:   ext === "pdf" ? "pdf" : "image",
        fichier_taille: `${Math.round(uploadBytes.length / 1024)} Ko`,
      }).eq("id", ordo.id);

      const { data: signed } = await sb.storage.from("ordonnances-files").createSignedUrl(path, 3600);
      return new Response(JSON.stringify({
        data: { id: ordo.id, path, signedUrl: signed?.signedUrl || null },
      }), { headers: CORS });
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

      // TIFF → PNG au dépôt (03/10/2026, retour pharmacien) — voir
      // _shared/tiffConvert.ts et le commentaire équivalent sur
      // ordonnances_create ci-dessus.
      let uploadBytes = bytes, uploadFileType = fileType, uploadFileName = fileName;
      if (isTiff(fileName, fileType)) {
        try {
          uploadBytes = convertTiffToPng(bytes);
          uploadFileType = "image/png";
          uploadFileName = fileName.replace(/\.\w+$/, "") + ".png";
        } catch (e) {
          return new Response(JSON.stringify({ error: (e as Error).message || "Fichier TIFF illisible" }), { status: 400, headers: CORS });
        }
      }

      const ext  = uploadFileName.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${pharmacieId}/${ordoId}/ordonnance.${ext}`;

      const { error: upErr } = await sb.storage
        .from("ordonnances-files")
        .upload(path, uploadBytes, { contentType: uploadFileType, upsert: true });
      if (upErr) throw new Error(upErr.message);

      await sb.from("ordonnances").update({
        fichier_url:    path,
        fichier_nom:    uploadFileName,
        fichier_type:   ext === "pdf" ? "pdf" : "image",
        fichier_taille: `${Math.round(uploadBytes.length / 1024)} Ko`,
      }).eq("id", ordoId);

      const { data: signed } = await sb.storage
        .from("ordonnances-files")
        .createSignedUrl(path, 3600);

      return new Response(JSON.stringify({ data: { success: true, path, signedUrl: signed?.signedUrl || null } }),
        { headers: CORS });
    }

    // Fichier d'une ordonnance, pour la popup "voir" du Dashboard (28/09/2026)
    // — même raison d'être que rappels_ordonnance_fichier ci-dessus (URL
    // signée générée ici, clé de service, jamais côté client via
    // sb.storage.createSignedUrl() : cassé pour un poste vendeur, qui n'a pas
    // de session Supabase Auth donc pas de auth.uid() pour la policy
    // storage.objects). Appartenance vérifiée par pharmacie_id avant de
    // générer quoi que ce soit.
    if (resource === "ordonnances_fichier") {
      if (!pharmacieId) {
        return new Response(JSON.stringify({ error: "Réservé aux comptes pharmacie" }), { status: 403, headers: CORS });
      }
      const { ordoId } = params || {};
      if (!ordoId) {
        return new Response(JSON.stringify({ error: "ordoId requis" }), { status: 400, headers: CORS });
      }
      const { data: ordo } = await sb.from("ordonnances")
        .select("fichier_url, fichier_nom, fichier_type")
        .eq("id", ordoId).eq("pharmacie_id", pharmacieId).maybeSingle();
      if (!ordo?.fichier_url) {
        return new Response(JSON.stringify({ data: null }), { headers: CORS });
      }
      const { data: signed } = await sb.storage.from("ordonnances-files").createSignedUrl(ordo.fichier_url, 300);
      return new Response(JSON.stringify({
        data: { name: ordo.fichier_nom || "ordonnance", type: ordo.fichier_type || "image", signedUrl: signed?.signedUrl || null },
      }), { headers: CORS });
    }

  return null;
}
