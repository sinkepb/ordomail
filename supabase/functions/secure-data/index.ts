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
import { handle_compte } from "./compte.ts";
import { handle_ordonnances } from "./ordonnances.ts";
import { handle_offres } from "./offres.ts";
import { handle_rappels } from "./rappels.ts";
import type { ContexteSecureData } from "./contexte.ts";
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

    const { pharmacieId, vendeurSub, userId: callerUserId } = await resolveCaller(bearer, jwtSecret, sb);

    if (!pharmacieId) {
      return new Response(JSON.stringify({ error: "Authentification requise" }),
        { status: 401, headers: CORS });
    }

    // ── Router par ressource (découpé par domaine, 04/10/2026 — voir ./*.ts) ──
    const ctx: ContexteSecureData = { req, sb, supabaseUrl, serviceKey, jwtSecret, pharmacieId, vendeurSub, callerUserId, resource, params, CORS };
    for (const domaine of [handle_compte, handle_ordonnances, handle_offres, handle_rappels]) {
      const reponse = await domaine(ctx);
      if (reponse) return reponse;
    }


    return new Response(JSON.stringify({ error: `Ressource inconnue: ${resource}` }),
      { status: 400, headers: CORS });

  } catch (e) {
    return new Response(JSON.stringify({ error: safeErrorMessage(e, "secure-data") }),
      { status: 500, headers: CORS });
  }
});
