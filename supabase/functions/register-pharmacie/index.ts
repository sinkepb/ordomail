// @version 16/07/2026 16:04 — fix-email-notnull
// OrdoMail — register-pharmacie
// Crée le compte pharmacie après inscription Supabase Auth

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    // Générer email_slug depuis le nom
    const emailSlug = nom
      .toLowerCase()
      .replace(/[éèêë]/g, "e")
      .replace(/[àâä]/g, "a")
      .replace(/[ùûü]/g, "u")
      .replace(/[îï]/g, "i")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    // Créer la pharmacie
    const { data: pharmacie, error: phErr } = await supabase
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

    console.log("[register-pharmacie] Pharmacie créée:", pharmacie.id, nom, codeVendeur);

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
