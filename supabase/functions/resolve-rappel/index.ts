// Edge Function : resolve-rappel
// 04/09/2026 — page publique patient d'un rappel de renouvellement
// d'ordonnance (lien reçu par SMS, ?rappel=<token> côté frontend).
//
// GET  ?token=<token>  → identité minimale pour personnaliser l'écran (prénom
//                        du patient, nom de la pharmacie) — jamais le nom de
//                        famille ni le téléphone à un appelant anonyme.
// POST {token, choix, creneau?} → enregistre le choix du patient
//                        (tout_renouveler / rien / partiel), un créneau de
//                        retrait optionnel (08/09/2026 — indication large,
//                        pas une réservation de capacité) et fait passer le
//                        rappel en "à traiter" côté pharmacien.
//
// N'accepte le POST que si le rappel est encore "sms_envoye", OU "à appeler"
// SANS choix déjà connu (01/10/2026, audit — voir peutEncoreRepondre) — un
// token déjà répondu, ou d'un cycle précédent (régénéré à chaque envoi, voir
// rappelLogic.ts), ne doit plus jamais pouvoir écrire une réponse.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { checkRateLimit, getClientIp } from "../_shared/rateLimit.ts";
import { safeErrorMessage } from "../_shared/errors.ts";
import { peutEncoreRepondre } from "../_shared/rappelLogic.ts";
import { repondreRappelAction } from "../_shared/rappelHandlers.ts";

// "stop" (01/10/2026, audit RGPD) — canal d'opposition : jusqu'ici le patient
// n'avait aucun moyen de signifier "ne plus me recontacter" (seuls choix
// tout_renouveler/rien/partiel). Termine définitivement le suivi et marque
// opt_out=true pour empêcher toute réactivation ultérieure de ce rappel.
const CHOIX_VALIDES = ["tout_renouveler", "rien", "partiel", "stop"];
// Créneau de retrait (08/09/2026) — optionnel, indication large plutôt qu'un
// vrai système de réservation de capacité (voir migration correspondante).
const CRENEAUX_VALIDES = ["ce_matin", "cet_apres_midi", "demain_matin", "demain_apres_midi"];

// Un rappel escaladé en "à appeler" sans réponse (relance épuisée ou échecs
// d'envoi répétés, voir rappelLogic.ts) n'a PAS reçu de réponse — le patient
// peut encore cliquer son lien SMS et répondre lui-même, ce qui évite un
// appel inutile au pharmacien. À l'inverse, un "à appeler" dont le choix est
// déjà connu (ex. "partiel" répondu par SMS, en attente de l'appel de
// clarification) a déjà répondu : un second POST ne doit pas l'écraser.

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
        .select("statut, choix_patient, patient_prenom, groupe_id, pharmacie_id, pharmacies(nom)")
        .eq("token", token)
        .is("supprime_le", null)
        .maybeSingle();
      if (!rappel) return new Response(JSON.stringify({ error: "Lien inconnu ou expiré" }), { status: 404, headers: CORS });

      // Rappel groupé (03/10/2026, retour pharmacien) — un seul lien envoyé
      // par groupe (voir rappelLogic.ts:traiterGroupeRappels), mais le
      // patient doit voir qu'il répond pour PLUSIEURS ordonnances, pas une
      // seule. Compte simple ; pas le détail médecin/spécialité de chacune
      // (page publique anonyme, minimisation des données affichées).
      let nombreOrdonnances = 1;
      if (rappel.groupe_id) {
        const { count } = await sb
          .from("rappels_ordonnance")
          .select("id", { count: "exact", head: true })
          .eq("groupe_id", rappel.groupe_id)
          .eq("pharmacie_id", rappel.pharmacie_id)
          .eq("opt_out", false)
          .is("supprime_le", null);
        if (count) nombreOrdonnances = count;
      }

      return new Response(JSON.stringify({
        data: {
          patientPrenom: rappel.patient_prenom,
          pharmacieNom: (rappel as any).pharmacies?.nom || "votre pharmacie",
          dejaRepondu: !peutEncoreRepondre(rappel),
          nombreOrdonnances,
        },
      }), { headers: CORS });
    }

    if (req.method === "POST") {
      const { token, choix, creneau } = await req.json();
      if (!token || !CHOIX_VALIDES.includes(choix)) {
        return new Response(JSON.stringify({ error: "token et choix (tout_renouveler|rien|partiel|stop) requis" }), { status: 400, headers: CORS });
      }
      if (creneau && !CRENEAUX_VALIDES.includes(creneau)) {
        return new Response(JSON.stringify({ error: "Créneau invalide" }), { status: 400, headers: CORS });
      }

      const r = await repondreRappelAction(sb, { token, choix, creneau });
      return new Response(JSON.stringify(r.body), { status: r.status, headers: CORS });
    }

    return new Response(JSON.stringify({ error: "Méthode non supportée" }), { status: 405, headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ error: safeErrorMessage(e, "resolve-rappel") }), { status: 500, headers: CORS });
  }
});
