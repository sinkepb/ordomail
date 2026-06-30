import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const form = await req.formData();
    const pharmacie_id = form.get("pharmacie_id")?.toString();
    const from_name    = form.get("from_name")?.toString() || "";
    const patient_nom  = form.get("patient_nom")?.toString() || from_name;
    const patient_cv   = form.get("patient_cv")?.toString() || null;
    const medecin      = form.get("medecin")?.toString() || null;
    const medicaments  = JSON.parse(form.get("medicaments")?.toString() || "[]");
    const file         = form.get("file") as File | null;

    if (!pharmacie_id) {
      return new Response(JSON.stringify({ error: "pharmacie_id requis" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    // Service role → bypass RLS complet
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Vérifier que la pharmacie existe
    const { data: ph } = await sb.from("pharmacies")
      .select("id").eq("id", pharmacie_id).maybeSingle();
    if (!ph) {
      return new Response(JSON.stringify({ error: "Pharmacie introuvable" }),
        { status: 404, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    // 2. Créer l'ordonnance
    const { data: ordo, error: ordoErr } = await sb.from("ordonnances").insert({
      pharmacie_id,
      source: "qrcode",
      from_name,
      status: "nouveau",
      patient_nom,
      patient_cv:   patient_cv || null,
      medecin:      medecin    || null,
      medicaments:  medicaments,
    }).select().single();

    if (ordoErr) throw new Error(ordoErr.message);

    // 3. Uploader le fichier si présent
    if (file && file.size > 0) {
      const ext  = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${pharmacie_id}/${ordo.id}/ordonnance.${ext}`;
      const buf  = await file.arrayBuffer();

      const { error: upErr } = await sb.storage
        .from("ordonnances-files")
        .upload(path, buf, { contentType: file.type, upsert: true });

      if (!upErr) {
        await sb.from("ordonnances").update({
          fichier_url:    path,
          fichier_nom:    file.name,
          fichier_type:   ext === "pdf" ? "pdf" : "image",
          fichier_taille: `${Math.round(file.size / 1024)} Ko`,
        }).eq("id", ordo.id);
      }
    }

    return new Response(
      JSON.stringify({ success: true, id: ordo.id }),
      { headers: { ...CORS, "Content-Type": "application/json" } }
    );

  } catch(e) {
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
});
