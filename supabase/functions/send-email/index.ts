// @version 16/07/2026 10:45 — fusion receive-email
// OrdoMail — send-email
// Reçoit les webhooks Postmark (inbound email)
// Gère les adresses dynamiques avec code patient : pharmacie-slug-247@in.ordomail.fr

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// Nettoie l'email (gère format Yahoo, Gmail, avec ou sans code patient)
function extractEmail(toHeader: string): string {
  const emailRegex = /(?:<([^>]+)>|([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}))/;
  const match = toHeader.match(emailRegex);
  if (match) return (match[1] || match[2]).toLowerCase().trim();
  return toHeader.toLowerCase().trim();
}

// Extrait le code patient depuis l'adresse email dynamique — 3 chiffres + 1 lettre
// (depuis le 25/07/2026), insérée à une position aléatoire par generateCode() côté
// client (voir PatientPage.jsx).
// "pharmacie-de-la-paix-24k7@in.ordomail.fr" → "24K7"
// "pharmacie-de-la-paix@in.ordomail.fr"      → null
// ⚠️ L'adresse est déjà passée en minuscules par extractEmail() ci-dessus (les adresses
// email sont insensibles à la casse) — mais le code affiché au patient et comparé côté
// client (sonnette, regroupement dashboard) est généré en MAJUSCULES. Remettre en
// majuscules ici pour que la comparaison stricte (===) reste valable des deux côtés.
function extractCode(email: string): string | null {
  const match = email.match(/-([0-9a-z]{4})(?=@)/);
  return match ? match[1].toUpperCase() : null;
}

// Retire le code de l'adresse pour retrouver l'adresse de base
// "pharmacie-de-la-paix-24k7@in.ordomail.fr" → "pharmacie-de-la-paix@in.ordomail.fr"
function cleanEmail(email: string): string {
  return email.replace(/-[0-9a-z]{4}(?=@)/, "");
}

serve(async (req) => {
  const p = await req.json();

  // ── 1. Parser l'adresse To ──────────────────────────────────────────────────
  const toEmailRaw   = extractEmail(p.To || "");
  const codePatient  = extractCode(toEmailRaw);
  const toEmailClean = cleanEmail(toEmailRaw);

  console.log("[send-email] To original:", toEmailRaw);
  console.log("[send-email] To nettoyé :", toEmailClean);
  console.log("[send-email] code patient:", codePatient);

  // ── 2. Identifier la pharmacie par email_reception ──────────────────────────
  const { data: ph } = await supabase
    .from("pharmacies")
    .select("id")
    .eq("email_reception", toEmailClean)
    .single();

  if (!ph) {
    console.warn("[send-email] Pharmacie introuvable pour:", toEmailClean);
    return new Response("Pharmacie inconnue", { status: 404 });
  }

  // ── 3. Insérer l'ordonnance avec le code patient ────────────────────────────
  const { data: ordo } = await supabase
    .from("ordonnances")
    .insert({
      pharmacie_id:  ph.id,
      source:        "email",
      from_name:     p.FromName || p.From,
      from_email:    p.From,
      status:        "nouveau",
      code_patient:  codePatient,
    })
    .select()
    .single();

  console.log("[send-email] ordonnance créée:", ordo?.id, "code:", codePatient);

  // ── 4. Uploader les pièces jointes ──────────────────────────────────────────
  for (const att of (p.Attachments || [])) {
    if (!att.Content || !att.ContentType) continue;
    const isPdf = att.ContentType === "application/pdf";
    if (!att.ContentType.startsWith("image/") && !isPdf) continue;

    const ext  = isPdf ? "pdf" : "jpg";
    const path = `${ph.id}/${ordo.id}/ordonnance.${ext}`;
    const buf  = Uint8Array.from(atob(att.Content), (c: string) => c.charCodeAt(0));

    await supabase.storage
      .from("ordonnances-files")
      .upload(path, buf, { contentType: att.ContentType, upsert: true });

    await supabase
      .from("ordonnances")
      .update({
        fichier_url:    path,
        fichier_nom:    att.Name,
        fichier_type:   isPdf ? "pdf" : "image",
        fichier_taille: `${Math.round(buf.length / 1024)} Ko`,
      })
      .eq("id", ordo.id);
  }

  return new Response(JSON.stringify({
    success:       true,
    ordonnance_id: ordo.id,
    ordoId:        ordo.id,
    code_patient:  codePatient,
  }));
});
