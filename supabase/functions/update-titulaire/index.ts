// OrdoMail — Edge Function update-titulaire
// Met à jour le nom du titulaire (pharmacie_users.nom) — distinct du nom de
// l'officine (pharmacies.nom). Le titulaire n'a que le droit de LIRE sa propre
// ligne pharmacie_users via RLS (voir auth.js: _fetchPharmacieForUser), pas de
// l'écrire directement : cette fonction passe par service_role après avoir
// vérifié le jeton Supabase Auth de l'appelant (même schéma que update-pin).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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
    const callerToken = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!callerToken) {
      return new Response(JSON.stringify({ error: "Authentification requise" }),
        { status: 401, headers: CORS });
    }

    const { nom } = await req.json();
    if (!nom || typeof nom !== "string" || !nom.trim()) {
      return new Response(JSON.stringify({ error: "Nom requis" }),
        { status: 400, headers: CORS });
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: userData, error: userErr } = await sb.auth.getUser(callerToken);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Session invalide ou expirée" }),
        { status: 401, headers: CORS });
    }

    const { error: updErr } = await sb.from("pharmacie_users")
      .update({ nom: nom.trim().slice(0, 200) })
      .eq("id", userData.user.id)
      .eq("role", "admin");
    if (updErr) throw new Error(updErr.message);

    return new Response(JSON.stringify({ success: true }), { headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }),
      { status: 500, headers: CORS });
  }
});
