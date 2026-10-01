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
function peutEncoreRepondre(rappel: { statut: string; choix_patient: string | null }): boolean {
  return rappel.statut === "sms_envoye" || (rappel.statut === "a_appeler" && !rappel.choix_patient);
}

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
        .select("statut, choix_patient, patient_prenom, pharmacies(nom)")
        .eq("token", token)
        .maybeSingle();
      if (!rappel) return new Response(JSON.stringify({ error: "Lien inconnu ou expiré" }), { status: 404, headers: CORS });

      return new Response(JSON.stringify({
        data: {
          patientPrenom: rappel.patient_prenom,
          pharmacieNom: (rappel as any).pharmacies?.nom || "votre pharmacie",
          dejaRepondu: !peutEncoreRepondre(rappel),
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

      const { data: rappel } = await sb
        .from("rappels_ordonnance")
        .select("id, statut, choix_patient")
        .eq("token", token)
        .maybeSingle();
      if (!rappel) return new Response(JSON.stringify({ error: "Lien inconnu ou expiré" }), { status: 404, headers: CORS });
      if (!peutEncoreRepondre(rappel)) {
        return new Response(JSON.stringify({ error: "Ce rappel a déjà reçu une réponse" }), { status: 409, headers: CORS });
      }
      // "Sauvetage" après escalade (01/10/2026, audit) — le patient répond
      // enfin lui-même après avoir été basculé en "à appeler" faute de
      // réponse : évite un appel du pharmacien devenu inutile. Tracé dans le
      // journal pour qu'il voie que ce cas s'est résolu tout seul.
      const apresEscalade = rappel.statut === "a_appeler";

      // Renouvellement partiel (01/10/2026, retour titulaire) — "partiel"
      // ne dit pas QUELS médicaments renouveler, un simple clic sur le lien
      // SMS ne suffit pas à le savoir : passe par "à appeler" pour que le
      // pharmacien rappelle le patient préciser sa demande, plutôt que
      // d'aller directement à "à traiter" comme pour tout_renouveler/rien
      // (choix non ambigus, aucun appel nécessaire). Voir
      // secure-data:rappels_confirmer_appel_partiel pour la suite.
      // "stop" termine directement le suivi (01/10/2026) — pas de créneau à
      // choisir, pas d'étape "à traiter" côté pharmacien, ce n'est pas un
      // renouvellement à préparer.
      const statutSuivant = choix === "stop" ? "termine" : choix === "partiel" ? "a_appeler" : "a_traiter";
      const { error } = await sb.from("rappels_ordonnance").update({
        statut: statutSuivant,
        choix_patient: choix,
        creneau_retrait: choix === "stop" ? null : (creneau || null),
        opt_out: choix === "stop",
        date_reponse_patient: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", rappel.id);
      if (error) throw new Error(error.message);
      await sb.from("rappels_evenements").insert({ rappel_id: rappel.id, type: "reponse_patient", meta: { choix, ...(creneau ? { creneau } : {}), ...(apresEscalade ? { apres_escalade: true } : {}) } });

      return new Response(JSON.stringify({ data: { success: true } }), { headers: CORS });
    }

    return new Response(JSON.stringify({ error: "Méthode non supportée" }), { status: 405, headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ error: safeErrorMessage(e, "resolve-rappel") }), { status: 500, headers: CORS });
  }
});
