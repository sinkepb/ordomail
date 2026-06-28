import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

serve(async (req) => {
  const { posteId, pin } = await req.json();
  if (!pin || !/^\d{4}$/.test(pin)) return new Response(JSON.stringify({ error:"PIN doit être 4 chiffres" }), { status:400 });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const hash = await bcrypt.hash(pin, 10);
  const { error } = await supabase.from("postes").update({ pin_hash: hash }).eq("id", posteId);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status:500 });
  return new Response(JSON.stringify({ success:true }));
});
