// OrdoMail — Edge Function contact (14/11/2026)
//
// Formulaire de contact public de la page d'accueil (ContactPage.jsx). Envoie
// le message par email (Postmark, voir _shared/email.ts) à l'adresse de
// CONTACT_EMAIL (secret de fonction), siseocontact@gmail.com par défaut. Le
// destinataire n'est jamais exposé côté navigateur : il reste ici, à l'abri
// des robots qui moissonnent les adresses dans les pages web.
//
// Endpoint public anonyme (appelé avec la clé anon, comme log-qr-scan) :
// - piège à robots (champ invisible + délai minimal, voir contactLogic.ts),
//   auquel on répond "succès" sans rien envoyer pour ne pas renseigner le robot ;
// - limite de débit par IP (5 messages / heure) et globale (60 / heure), pour
//   qu'un abus ne puisse ni inonder la boîte ni épuiser le quota Postmark ;
// - validation et échappement de tous les champs (contactLogic.ts).
// Aucune donnée n'est stockée en base : le message n'existe que dans l'email.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { checkRateLimit, getClientIp } from "../_shared/rateLimit.ts";
import { safeErrorMessage } from "../_shared/errors.ts";
import { sendTransactionalEmail } from "../_shared/email.ts";
import { escapeHtml } from "../_shared/html.ts";
import { validerContact, estRobot, construireEmail } from "../_shared/contactLogic.ts";

const DESTINATAIRE_DEFAUT = "siseocontact@gmail.com";

serve(async (req) => {
  const CORS = corsHeaders(req, {
    "Access-Control-Allow-Headers": "content-type, authorization, apikey",
    "Content-Type": "application/json",
  });
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Méthode non autorisée" }), { status: 405, headers: CORS });
  }

  try {
    const brut = await req.json().catch(() => null);
    if (!brut || typeof brut !== "object") {
      return new Response(JSON.stringify({ error: "Requête invalide" }), { status: 400, headers: CORS });
    }
    if (estRobot(brut)) {
      return new Response(JSON.stringify({ success: true }), { headers: CORS });
    }
    const v = validerContact(brut);
    if (!v.ok) {
      return new Response(JSON.stringify({ error: v.erreur }), { status: 400, headers: CORS });
    }

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const parIp = await checkRateLimit(sb, "contact", getClientIp(req), 5, 60);
    const global = parIp && await checkRateLimit(sb, "contact-global", "all", 60, 60);
    if (!parIp || !global) {
      return new Response(JSON.stringify({ error: "Trop de messages envoyés. Réessayez dans une heure, ou écrivez-nous directement par email." }), { status: 429, headers: CORS });
    }

    const { sujet, html, text } = construireEmail(v.data, escapeHtml);
    const destinataire = Deno.env.get("CONTACT_EMAIL") || DESTINATAIRE_DEFAUT;
    const res = await sendTransactionalEmail(destinataire, sujet, html, text, v.data.email);
    if (!res.success) {
      console.error("[contact] échec d'envoi :", res.error);
      return new Response(JSON.stringify({ error: "Le message n'a pas pu être envoyé. Réessayez dans quelques minutes." }), { status: 502, headers: CORS });
    }
    return new Response(JSON.stringify({ success: true }), { headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ error: safeErrorMessage(e, "contact") }), { status: 500, headers: CORS });
  }
});
