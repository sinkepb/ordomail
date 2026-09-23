// OrdoMail — Edge Function log-qr-scan (22/09/2026)
//
// Enregistre un évènement "scan de QR code" pour une pharmacie, indépendamment
// de tout dépôt d'ordonnance ultérieur — jusqu'ici, un scan qui n'aboutissait
// pas à un dépôt soumis était totalement invisible (voir migration
// 20260922_qr_scans.sql). Appelée en fire-and-forget par App.jsx juste après
// la résolution du QR (goodie pré-imprimé via resolve-qr-code, ou affiche
// self-service via fetchPharmaciePublic), avant même l'affichage de la page
// de dépôt — un échec ici ne doit jamais bloquer le parcours patient.
//
// Fonction séparée plutôt qu'ajout direct dans resolve-qr-code : les deux
// parcours QR existants (goodie pré-imprimé vs affiche self-service) ne
// passent pas tous les deux par resolve-qr-code (l'affiche self-service
// résout la pharmacie côté client via fetchPharmaciePublic), donc un point
// d'entrée commun aux deux évite de dupliquer la logique d'écriture.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { checkRateLimit, getClientIp } from "../_shared/rateLimit.ts";
import { safeErrorMessage } from "../_shared/errors.ts";

serve(async (req) => {
  const CORS = corsHeaders(req, {
    "Access-Control-Allow-Headers": "content-type, authorization, apikey",
    "Content-Type": "application/json",
  });
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const { pharmacieId, source } = await req.json().catch(() => ({}));
    if (!pharmacieId) {
      return new Response(JSON.stringify({ error: "pharmacieId requis" }), { status: 400, headers: CORS });
    }
    const safeSource = source === "affiche" ? "affiche" : "qr_code";

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Même principe que resolve-qr-code : endpoint public anonyme, par IP
    // (un même sticker/affiche est scanné par de nombreux patients différents,
    // c'est la vitesse d'ÉNUMÉRATION depuis une même source qui doit être
    // limitée, pas l'usage réel même partagé).
    const allowed = await checkRateLimit(sb, "log-qr-scan", getClientIp(req), 60, 5);
    if (!allowed) {
      return new Response(JSON.stringify({ error: "Trop de requêtes" }), { status: 429, headers: CORS });
    }

    // Vérifie que la pharmacie existe réellement avant d'écrire — évite de
    // polluer les stats avec un pharmacieId arbitraire envoyé par un appelant
    // malveillant (cet endpoint est public, sans authentification).
    const { data: ph } = await sb.from("pharmacies").select("id").eq("id", pharmacieId).maybeSingle();
    if (!ph) {
      return new Response(JSON.stringify({ error: "Pharmacie introuvable" }), { status: 404, headers: CORS });
    }

    await sb.from("qr_scans").insert({ pharmacie_id: pharmacieId, source: safeSource });

    return new Response(JSON.stringify({ success: true }), { headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ error: safeErrorMessage(e, "log-qr-scan") }), { status: 500, headers: CORS });
  }
});
