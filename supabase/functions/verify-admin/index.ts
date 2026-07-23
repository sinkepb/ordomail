// @phase1-security 23/07/2026 — émet désormais un jeton admin signé (voir _shared/jwt.ts),
// consommé par secure-data (resource=admin_pharmacies) pour authentifier les lectures du
// backoffice OrdoMail Business côté serveur, au lieu de requêtes anon-key non vérifiées.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
import { signToken } from "../_shared/jwt.ts";

const ADMIN_TOKEN_TTL_SECONDS = 4 * 3600; // 4h de session backoffice

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: CORS });
  }

  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return new Response(
        JSON.stringify({ success: false, error: "Email et mot de passe requis" }),
        { status: 400, headers: CORS }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: admin, error } = await supabase
      .from("ordomail_admins")
      .select("email, password_hash, nom, role")
      .eq("email", email.toLowerCase().trim())
      .maybeSingle();

    // Délai fixe anti-timing attack
    await new Promise(r => setTimeout(r, 400));

    if (error || !admin) {
      return new Response(
        JSON.stringify({ success: false, error: "Identifiants incorrects" }),
        { status: 401, headers: CORS }
      );
    }

    // compareSync (pas compare async) : la version async de ce package spawn un Worker,
    // indisponible dans le runtime des Edge Functions Supabase ("Worker is not defined").
    // C'est probablement la cause du repli fréquent sur la porte dérobée avant son retrait.
    const valid = bcrypt.compareSync(password, admin.password_hash);
    if (!valid) {
      return new Response(
        JSON.stringify({ success: false, error: "Identifiants incorrects" }),
        { status: 401, headers: CORS }
      );
    }

    const jwtSecret = Deno.env.get("ORDOMAIL_JWT_SECRET")!;
    const token = await signToken(
      { sub: admin.email, role: "admin", admin_role: admin.role },
      jwtSecret,
      ADMIN_TOKEN_TTL_SECONDS,
    );

    return new Response(
      JSON.stringify({ success: true, token, admin: { email: admin.email, nom: admin.nom, role: admin.role } }),
      { headers: CORS }
    );

  } catch(e) {
    return new Response(
      JSON.stringify({ success: false, error: e.message }),
      { status: 500, headers: CORS }
    );
  }
});
