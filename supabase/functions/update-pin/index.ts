// OrdoMail — Edge Function update-pin
// Met à jour le PIN d'un poste vendeur.
//
// @phase1-security 23/07/2026 — durcissement :
//  - exige désormais un jeton Supabase Auth valide (le titulaire connecté)
//  - vérifie que l'appelant est bien admin de la pharmacie propriétaire du poste
//  - stocke le PIN hashé (bcrypt) dans pin_hash, plus jamais en clair
// Avant ce correctif, n'importe qui pouvait appeler cette fonction avec un
// posteId arbitraire et changer le PIN de n'importe quel poste, sans authentification.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

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
    const callerToken = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!callerToken) {
      return new Response(
        JSON.stringify({ error: "Authentification requise" }),
        { status: 401, headers: CORS },
      );
    }

    const { posteId, pin } = await req.json();

    if (!posteId || !pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      return new Response(
        JSON.stringify({ error: "PIN invalide — 4 chiffres requis" }),
        { status: 400, headers: CORS },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    // 1. Vérifier que le jeton correspond à un utilisateur Supabase Auth réel
    const { data: userData, error: userErr } = await sb.auth.getUser(callerToken);
    if (userErr || !userData?.user) {
      return new Response(
        JSON.stringify({ error: "Session invalide ou expirée" }),
        { status: 401, headers: CORS },
      );
    }

    // 2. Retrouver le poste et sa pharmacie
    const { data: poste, error: posteErr } = await sb
      .from("pharmacie_postes")
      .select("id, pharmacie_id")
      .eq("id", posteId)
      .maybeSingle();
    if (posteErr || !poste) {
      return new Response(JSON.stringify({ error: "Poste introuvable" }),
        { status: 404, headers: CORS });
    }

    // 3. Vérifier que l'appelant est admin (titulaire) de CETTE pharmacie
    const { data: link, error: linkErr } = await sb
      .from("pharmacie_users")
      .select("pharmacie_id, role")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (linkErr || !link || link.pharmacie_id !== poste.pharmacie_id || link.role !== "admin") {
      return new Response(
        JSON.stringify({ error: "Vous n'êtes pas autorisé à modifier ce poste" }),
        { status: 403, headers: CORS },
      );
    }

    // 4. Hasher le nouveau PIN et l'enregistrer — jamais en clair
    const pinHash = await bcrypt.hash(pin);
    const res = await fetch(
      `${supabaseUrl}/rest/v1/pharmacie_postes?id=eq.${posteId}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "apikey": serviceKey,
          "Authorization": `Bearer ${serviceKey}`,
          "Prefer": "return=minimal",
        },
        body: JSON.stringify({ pin_hash: pinHash, pin: null }),
      },
    );

    if (!res.ok) {
      const err = await res.text();
      return new Response(JSON.stringify({ error: err }),
        { status: 500, headers: CORS });
    }

    return new Response(JSON.stringify({ success: true }), { headers: CORS });

  } catch (e) {
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: CORS },
    );
  }
});
