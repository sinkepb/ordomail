// @phase1-security 23/07/2026 — émet désormais un jeton admin signé (voir _shared/jwt.ts),
// consommé par secure-data (resource=admin_pharmacies) pour authentifier les lectures du
// backoffice OrdoMail Business côté serveur, au lieu de requêtes anon-key non vérifiées.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
import { signToken } from "../_shared/jwt.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { checkRateLimit, getClientIp } from "../_shared/rateLimit.ts";
import { safeErrorMessage } from "../_shared/errors.ts";

const ADMIN_TOKEN_TTL_SECONDS = 4 * 3600; // 4h de session backoffice

serve(async (req) => {
  const CORS = corsHeaders(req, {
    "Access-Control-Allow-Headers": "content-type, authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  });
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

    // Limitation de débit (23/09/2026, audit critique) — jusqu'ici seul un
    // délai fixe de 400ms protégeait contre le timing attack, mais rien
    // n'empêchait un brute-force au débit réseau sur le mot de passe
    // backoffice. Par IP, comme resolve-qr-code/log-qr-scan — 10 tentatives/
    // 15min est large pour un usage légitime (une poignée d'admins) mais
    // bloque un brute-force scripté.
    const allowed = await checkRateLimit(supabase, "verify-admin", getClientIp(req), 10, 15);
    if (!allowed) {
      return new Response(
        JSON.stringify({ success: false, error: "Trop de tentatives — réessayez dans quelques minutes" }),
        { status: 429, headers: CORS }
      );
    }

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
      JSON.stringify({ success: false, error: safeErrorMessage(e, "verify-admin") }),
      { status: 500, headers: CORS }
    );
  }
});
