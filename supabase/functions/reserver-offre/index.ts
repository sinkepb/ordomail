// OrdoMail — Edge Function reserver-offre (03/09/2026)
//
// "Ajouter à la commande" côté patient — un système de réservation interne
// ("Click & Collect"), PAS un paiement : aucun Stripe ici, l'encaissement se
// fait physiquement au TPE de la pharmacie, lié à son propre LGO. Même schéma
// d'accès que toggle-interet (clé de service, contrôles explicites) — offre_
// reservations n'a aucune policy anon/authenticated par conception.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isValidPatientCode } from "../_shared/upload-validation.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { checkRateLimit, getClientIp } from "../_shared/rateLimit.ts";

Deno.serve(async (req) => {
  const CORS = corsHeaders(req, {
    "Access-Control-Allow-Headers": "content-type, authorization, apikey",
    "Content-Type": "application/json",
  });
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const body = await req.json();
    const pharmacieId = body?.pharmacieId?.toString();
    const codePatient  = body?.codePatient?.toString() || "";
    const offreId      = body?.offreId?.toString();
    const action       = body?.action === "annuler" ? "annuler" : "ajouter";

    if (!pharmacieId || !offreId) {
      return new Response(JSON.stringify({ error: "pharmacieId et offreId requis" }), { status: 400, headers: CORS });
    }
    if (!isValidPatientCode(codePatient)) {
      return new Response(JSON.stringify({ error: "code_patient invalide" }), { status: 400, headers: CORS });
    }

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Limitation de débit (04/09/2026) — endpoint public anonyme, jusqu'ici
    // sans aucune protection.
    const allowed = await checkRateLimit(sb, "reserver-offre", getClientIp(req), 60, 5);
    if (!allowed) {
      return new Response(JSON.stringify({ error: "Trop de requêtes — réessayez dans quelques minutes" }), { status: 429, headers: CORS });
    }

    const { data: offre } = await sb.from("offres_stories").select("id, pharmacie_id, prix, epuise, actif").eq("id", offreId).maybeSingle();
    if (!offre || offre.pharmacie_id !== pharmacieId) {
      return new Response(JSON.stringify({ error: "Offre introuvable" }), { status: 404, headers: CORS });
    }

    const { data: existing } = await sb.from("offre_reservations")
      .select("id, quantite").eq("offre_id", offreId).eq("code_patient", codePatient).eq("statut", "en_attente").maybeSingle();

    if (action === "annuler") {
      if (existing) await sb.from("offre_reservations").update({ statut: "annulee", updated_at: new Date().toISOString() }).eq("id", existing.id);
      return new Response(JSON.stringify({ success: true, quantite: 0 }), { headers: CORS });
    }

    // "ajouter" — refusé si la rupture a été signalée entre-temps ou si
    // l'offre a été mise en pause côté PC (état vu au moment du clic patient,
    // pas de contrôle de stock quantitatif : juste "toujours disponible ?").
    if (offre.epuise || !offre.actif) {
      return new Response(JSON.stringify({ error: "Cette offre n'est plus disponible" }), { status: 409, headers: CORS });
    }

    let quantite = 1;
    if (existing) {
      quantite = existing.quantite + 1;
      await sb.from("offre_reservations").update({ quantite, updated_at: new Date().toISOString() }).eq("id", existing.id);
    } else {
      await sb.from("offre_reservations").insert({ pharmacie_id: pharmacieId, offre_id: offreId, code_patient: codePatient, quantite: 1 });
    }

    return new Response(JSON.stringify({ success: true, quantite }), { headers: CORS });

  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: CORS });
  }
});
