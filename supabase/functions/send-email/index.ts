import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
serve(async (req) => {
  const p = await req.json();
  const toEmail = (p.To||"").toLowerCase();
  const { data:ph } = await supabase.from("pharmacies").select("id").eq("email_reception",toEmail).single();
  if (!ph) return new Response("Pharmacie inconnue", { status:404 });
  const { data:ordo } = await supabase.from("ordonnances").insert({ pharmacie_id:ph.id, source:"email", from_name:p.FromName||p.From, from_email:p.From, status:"nouveau" }).select().single();
  for (const att of (p.Attachments||[])) {
    if (!att.Content || !att.ContentType) continue;
    const isPdf = att.ContentType === "application/pdf";
    if (!att.ContentType.startsWith("image/") && !isPdf) continue;
    const ext = isPdf ? "pdf" : "jpg";
    const path = `${ph.id}/${ordo.id}/ordonnance.${ext}`;
    const buf = Uint8Array.from(atob(att.Content), (c:string) => c.charCodeAt(0));
    await supabase.storage.from("ordonnances-files").upload(path, buf, { contentType:att.ContentType, upsert:true });
    await supabase.from("ordonnances").update({ fichier_url:path, fichier_nom:att.Name, fichier_type:isPdf?"pdf":"image", fichier_taille:`${Math.round(buf.length/1024)} Ko` }).eq("id",ordo.id);
  }
  return new Response(JSON.stringify({ success:true, ordoId:ordo.id }));
});
