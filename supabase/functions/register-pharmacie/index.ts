import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: CORS });

  try {
    const { nom, pharmacie, adresse, email, plan, emailReception } = await req.json();

    if (!email || !pharmacie) {
      return new Response(JSON.stringify({ error: "Email et nom de pharmacie requis" }), { status: 400, headers: CORS });
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Récupérer l'utilisateur auth depuis l'email
    const { data: { users }, error: listErr } = await sb.auth.admin.listUsers();
    if (listErr) throw listErr;

    const authUser = users.find(u => u.email === email);
    if (!authUser) {
      return new Response(JSON.stringify({ error: "Utilisateur auth non trouvé. Vérifiez l'email." }), { status: 404, headers: CORS });
    }

    // 2. Vérifier si une pharmacie existe déjà pour cet email
    const { data: existing } = await sb.from("pharmacies").select("id").eq("email", email).maybeSingle();
    if (existing) {
      return new Response(JSON.stringify({ success: true, message: "Pharmacie déjà créée", pharmacieId: existing.id }), { headers: CORS });
    }

    // 3. Générer le slug email réception
    const slug = (pharmacie || "pharmacie")
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 25)
      .replace(/^-|-$/g, "");

    const emailRec = emailReception || `${slug}-${Date.now().toString(36)}@in.ordomail.fr`;

    // 4. Créer la pharmacie
    const { data: ph, error: phErr } = await sb.from("pharmacies").insert({
      nom:              pharmacie,
      email:            email,
      adresse:          adresse || "",
      couleur:          "#1a3a6e",
      plan:             plan || "starter",
      email_reception:  emailRec,
      trial_ends_at:    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    }).select().single();

    if (phErr) throw phErr;

    // 5. Lier l'utilisateur à la pharmacie
    const { error: linkErr } = await sb.from("pharmacie_users").insert({
      id:           authUser.id,
      pharmacie_id: ph.id,
      role:         "admin",
    });

    if (linkErr) throw linkErr;

    // 6. Créer un poste par défaut
    await sb.from("postes").insert({
      pharmacie_id: ph.id,
      nom:          "Poste 1",
      actif:        true,
    });

    return new Response(JSON.stringify({ success: true, pharmacieId: ph.id, emailReception: emailRec }), { headers: CORS });

  } catch(e) {
    console.error("[register-pharmacie]", e.message);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS });
  }
});
