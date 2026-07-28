// OrdoMail — Edge Function submit-ordonnance
// @phase1-security 23/07/2026 — durcissement :
//  - exige le qr_token public de la pharmacie (imprimé sur le QR code), pas seulement
//    son pharmacie_id (UUID visible dans l'URL, donc pas un vrai secret à lui seul)
//  - limitation de débit par pharmacie (fenêtre glissante) pour empêcher le spam de
//    la file d'attente / l'explosion de la facture de stockage
// Avant ce correctif, n'importe qui connaissant (ou devinant) un pharmacie_id pouvait
// déposer un nombre illimité de fausses ordonnances, sans aucune vérification.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isValidPatientCode, validateFile } from "../_shared/upload-validation.ts";
import { corsHeaders } from "../_shared/cors.ts";

const MAX_SUBMISSIONS_PER_WINDOW = 20;
const WINDOW_MINUTES = 10;

serve(async (req) => {
  const CORS = corsHeaders(req, { "Access-Control-Allow-Headers": "content-type, authorization" });
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const form = await req.formData();
    const pharmacie_id = form.get("pharmacie_id")?.toString();
    const qr_token     = form.get("qr_token")?.toString() || "";
    const from_name    = form.get("from_name")?.toString() || "";
    const patient_nom  = form.get("patient_nom")?.toString() || from_name;
    const patient_cv   = form.get("patient_cv")?.toString() || null;
    const medecin      = form.get("medecin")?.toString() || null;
    const medicaments  = JSON.parse(form.get("medicaments")?.toString() || "[]");
    const file         = form.get("file") as File | null;
    // Code patient (3 chiffres + 1 lettre insérée à une position aléatoire, depuis le
    // 25/07/2026) généré côté client (crypto-random, voir PatientPage.jsx) — même code
    // pour tous les fichiers d'une même session d'envoi. Avant le 24/07/2026 ce champ
    // était envoyé par le client mais jamais lu ici : les ordonnances déposées par QR
    // code n'obtenaient jamais de code_patient, contrairement à celles reçues par email.
    const sessionCodeRaw = form.get("session_code")?.toString() || "";
    const code_patient = isValidPatientCode(sessionCodeRaw) ? sessionCodeRaw : null;

    if (!pharmacie_id) {
      return new Response(JSON.stringify({ error: "pharmacie_id requis" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    if (file && file.size > 0) {
      const fileCheck = validateFile(file);
      if (!fileCheck.ok) {
        return new Response(JSON.stringify({ error: fileCheck.error }),
          { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
      }
    }

    // Service role → bypass RLS complet (contrôles d'accès faits explicitement ci-dessous)
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Vérifier que la pharmacie existe ET que le jeton public correspond
    const { data: ph } = await sb.from("pharmacies")
      .select("id, qr_token").eq("id", pharmacie_id).maybeSingle();
    if (!ph || !ph.qr_token || ph.qr_token !== qr_token) {
      return new Response(JSON.stringify({ error: "Pharmacie introuvable" }),
        { status: 404, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    // 2. Limitation de débit — fenêtre glissante par pharmacie
    const since = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();
    const { count: recent } = await sb
      .from("submission_log")
      .select("id", { count: "exact", head: true })
      .eq("pharmacie_id", pharmacie_id)
      .gte("created_at", since);
    if ((recent || 0) >= MAX_SUBMISSIONS_PER_WINDOW) {
      return new Response(JSON.stringify({ error: "Trop d'envois — réessayez dans quelques minutes" }),
        { status: 429, headers: { ...CORS, "Content-Type": "application/json" } });
    }
    await sb.from("submission_log").insert({ pharmacie_id });

    // 3. Créer l'ordonnance
    const { data: ordo, error: ordoErr } = await sb.from("ordonnances").insert({
      pharmacie_id,
      source: "qrcode",
      from_name,
      status: "nouveau",
      patient_nom,
      patient_cv:   patient_cv || null,
      medecin:      medecin    || null,
      medicaments:  medicaments,
      code_patient,
    }).select().single();

    if (ordoErr) throw new Error(ordoErr.message);

    // 4. Uploader le fichier si présent
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
      JSON.stringify({ success: true, id: ordo.id, code_patient }),
      { headers: { ...CORS, "Content-Type": "application/json" } }
    );

  } catch(e) {
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
});
