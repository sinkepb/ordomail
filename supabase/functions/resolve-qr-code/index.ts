// OrdoMail — Edge Function resolve-qr-code
// @qr-pregenere 18/08/2026
//
// Résout un token de QR code pré-imprimé (?qr=<token> côté patient) vers
// {pharmacie_id, qr_token} — le parcours de dépôt existant (PatientPage,
// submit-ordonnance) prend le relais ensuite sans aucune modification,
// exactement comme avec l'ancien lien ?patient=<id>&t=<qr_token>.
//
// N'expose jamais qr_codes.code ni qr_codes.id : un appelant anonyme ne
// doit rien apprendre du stock/des identifiants internes, seulement la
// pharmacie liée (si le code a bien été attribué par le staff).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  const CORS = corsHeaders(req, {
    "Access-Control-Allow-Headers": "content-type, authorization, apikey",
    "Content-Type": "application/json",
  });
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const token = new URL(req.url).searchParams.get("token") || "";
    if (!token) {
      return new Response(JSON.stringify({ error: "token requis" }),
        { status: 400, headers: CORS });
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: qr } = await sb
      .from("qr_codes")
      .select("pharmacie_id, status")
      .eq("token", token)
      .maybeSingle();

    if (!qr || qr.status !== "attribue" || !qr.pharmacie_id) {
      return new Response(JSON.stringify({ error: "QR code inconnu ou pas encore attribué" }),
        { status: 404, headers: CORS });
    }

    const { data: ph } = await sb
      .from("pharmacies")
      .select("id, qr_token")
      .eq("id", qr.pharmacie_id)
      .maybeSingle();

    if (!ph) {
      return new Response(JSON.stringify({ error: "Pharmacie introuvable" }),
        { status: 404, headers: CORS });
    }

    return new Response(JSON.stringify({ pharmacie_id: ph.id, qr_token: ph.qr_token }),
      { headers: CORS });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS });
  }
});
