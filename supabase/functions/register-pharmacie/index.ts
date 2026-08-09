// @version 16/07/2026 16:04 — fix-email-notnull
// OrdoMail — register-pharmacie
// Crée le compte pharmacie après inscription Supabase Auth

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { maskId } from "../_shared/log-mask.ts";

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
    const { nom, email, tel, userId } = await req.json();

    if (!nom || !email) {
      return new Response(
        JSON.stringify({ error: "Nom et email requis" }),
        { status: 400, headers: CORS }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Générer le code vendeur (6 chiffres unique)
    const codeVendeur = String(100000 + Math.floor(Math.random() * 900000));

    // email_slug : code court "pharmacie-XXXX" (4 caractères alphanumériques), PAS dérivé
    // du nom — deux pharmacies au nom identique ou proche (ex: deux officines "Pharmacie
    // Centrale" dans des villes différentes) auraient sinon produit le même slug et donc
    // violé la contrainte UNIQUE sur email_reception à l'inscription de la seconde. Le code
    // court élimine aussi la fuite du nom de la pharmacie dans une adresse email publique.
    const CODE_CHARS = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // sans I/O (confusion avec 1/0)
    function generateEmailCode() {
      const arr = new Uint8Array(4);
      crypto.getRandomValues(arr);
      return Array.from(arr, (b) => CODE_CHARS[b % CODE_CHARS.length]).join("");
    }

    // Créer la pharmacie — retente avec un nouveau code en cas de collision sur la
    // contrainte UNIQUE email_reception (23505), jusqu'à 5 tentatives.
    let pharmacie, phErr, emailSlug;
    for (let attempt = 0; attempt < 5; attempt++) {
      emailSlug = `pharmacie-${generateEmailCode()}`;
      const res = await supabase
        .from("pharmacies")
        .insert({
          nom,
          email,
          email_reception: `${emailSlug}@in.ordomail.fr`,
          email_slug:      emailSlug,
          code_vendeur:    codeVendeur,
          plan:            "starter",
          sonnette_active: true,
          couleur:         "#1a3a6e",
        })
        .select()
        .single();
      pharmacie = res.data;
      phErr = res.error;
      if (!phErr || phErr.code !== "23505") break;
    }

    if (phErr) {
      return new Response(
        JSON.stringify({ error: phErr.message }),
        { status: 500, headers: CORS }
      );
    }

    // Lier l'utilisateur à la pharmacie
    if (userId) {
      await supabase.from("pharmacie_users").insert({
        id:           userId,
        pharmacie_id: pharmacie.id,
        role:         "admin",
      });
    }

    // Créer 2 postes vendeurs par défaut
    await supabase.from("pharmacie_postes").insert([
      { pharmacie_id: pharmacie.id, nom: "Poste Accueil", actif: true },
      { pharmacie_id: pharmacie.id, nom: "Poste Caisse",  actif: true },
    ]);

    console.log("[register-pharmacie] Pharmacie créée:", maskId(pharmacie.id), nom);

    return new Response(JSON.stringify({
      success:      true,
      pharmacie_id: pharmacie.id,
      code_vendeur: codeVendeur,
      email_slug:   emailSlug,
    }), { headers: CORS });

  } catch (e) {
    console.error("[register-pharmacie] Erreur:", e.message);
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: CORS }
    );
  }
});
