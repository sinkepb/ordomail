// Edge Function : resolve-rappel
// 04/09/2026 — page publique patient d'un rappel de renouvellement
// d'ordonnance (lien reçu par SMS, ?rappel=<token> côté frontend).
//
// GET  ?token=<token>  → identité minimale pour personnaliser l'écran (prénom
//                        du patient, nom de la pharmacie) — jamais le nom de
//                        famille ni le téléphone à un appelant anonyme.
// POST {token, choix}  → enregistre le choix du patient (tout_renouveler /
//                        rien / partiel) et fait passer le rappel en
//                        "à traiter" côté pharmacien.
//
// N'accepte le POST que si le rappel est encore au statut "sms_envoye" — un
// token déjà répondu, ou d'un cycle précédent (régénéré à chaque envoi, voir
// rappelLogic.ts), ne doit plus jamais pouvoir écrire une réponse.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { checkRateLimit, getClientIp } from "../_shared/rateLimit.ts";

const CHOIX_VALIDES = ["tout_renouveler", "rien", "partiel"];

serve(async (req) => {
  const CORS = corsHeaders(req, {
    "Access-Control-Allow-Headers": "content-type, authorization, apikey",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Content-Type": "application/json",
  });
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Endpoint public anonyme — même protection que resolve-qr-code (par IP,
  // un même lien légitime pouvant être ouvert plusieurs fois par le même
  // patient n'est pas un abus, c'est la vitesse d'énumération de tokens
  // depuis une même source qui doit être limitée).
  const allowed = await checkRateLimit(sb, "resolve-rappel", getClientIp(req), 30, 5);
  if (!allowed) {
    return new Response(JSON.stringify({ error: "Trop de requêtes — réessayez dans quelques minutes" }), { status: 429, headers: CORS });
  }

  try {
    if (req.method === "GET") {
      const token = new URL(req.url).searchParams.get("token") || "";
      if (!token) return new Response(JSON.stringify({ error: "token requis" }), { status: 400, headers: CORS });

      const { data: rappel } = await sb
        .from("rappels_ordonnance")
        .select("statut, patient_prenom, pharmacies(nom)")
        .eq("token", token)
        .maybeSingle();
      if (!rappel) return new Response(JSON.stringify({ error: "Lien inconnu ou expiré" }), { status: 404, headers: CORS });

      return new Response(JSON.stringify({
        data: {
          patientPrenom: rappel.patient_prenom,
          pharmacieNom: (rappel as any).pharmacies?.nom || "votre pharmacie",
          dejaRepondu: rappel.statut !== "sms_envoye",
        },
      }), { headers: CORS });
    }

    if (req.method === "POST") {
      const { token, choix } = await req.json();
      if (!token || !CHOIX_VALIDES.includes(choix)) {
        return new Response(JSON.stringify({ error: "token et choix (tout_renouveler|rien|partiel) requis" }), { status: 400, headers: CORS });
      }

      const { data: rappel } = await sb
        .from("rappels_ordonnance")
        .select("id, statut")
        .eq("token", token)
        .maybeSingle();
      if (!rappel) return new Response(JSON.stringify({ error: "Lien inconnu ou expiré" }), { status: 404, headers: CORS });
      if (rappel.statut !== "sms_envoye") {
        return new Response(JSON.stringify({ error: "Ce rappel a déjà reçu une réponse" }), { status: 409, headers: CORS });
      }

      const { error } = await sb.from("rappels_ordonnance").update({
        statut: "a_traiter",
        choix_patient: choix,
        date_reponse_patient: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", rappel.id);
      if (error) throw new Error(error.message);
      await sb.from("rappels_evenements").insert({ rappel_id: rappel.id, type: "reponse_patient", meta: { choix } });

      return new Response(JSON.stringify({ data: { success: true } }), { headers: CORS });
    }

    return new Response(JSON.stringify({ error: "Méthode non supportée" }), { status: 405, headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: CORS });
  }
});
