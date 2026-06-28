import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

serve(async (req) => {
  const { pin } = await req.json();
  if (!pin || !/^\d{4}$/.test(pin))
    return new Response(JSON.stringify({ success: false, error: "PIN invalide" }), { status: 400 });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: postes } = await supabase.from("postes").select("id,nom,pharmacie_id,pin_hash").eq("actif", true);

  let match = null;
  for (const p of postes || []) {
    if (p.pin_hash && await bcrypt.compare(pin, p.pin_hash)) { match = p; break; }
  }
  if (!match) { await new Promise(r => setTimeout(r, 300)); return new Response(JSON.stringify({ success:false, error:"PIN incorrect" }), { status:401 }); }

  const { data: ph } = await supabase.from("pharmacies").select("id,nom,couleur,plan,email_reception").eq("id", match.pharmacie_id).single();
  return new Response(JSON.stringify({ success:true, poste:{ id:match.id, nom:match.nom }, pharmacie:ph }), { headers:{"Content-Type":"application/json"} });
});
