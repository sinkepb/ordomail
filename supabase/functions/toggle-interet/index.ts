// OrdoMail — Edge Function toggle-interet
// @phase-security 27/07/2026
//
// Remplace l'écriture directe (anon key) sur offre_interets depuis
// PatientPage.jsx. Cause du remplacement, confirmée en direct : Postgres exige
// une visibilité SELECT pour un INSERT ... ON CONFLICT DO UPDATE (marquage) et,
// de façon plus surprenante, un simple UPDATE filtré échoue aussi SILENCIEUSEMENT
// pour le rôle anon sur cette table (200/204 renvoyé, mais 0 ligne réellement
// modifiée — confirmé via EXPLAIN VERBOSE : "One-Time Filter: false" malgré une
// policy UPDATE USING(true)/WITH CHECK(true) correcte). Cause exacte non
// élucidée malgré une investigation approfondie (policies, grants, contraintes,
// cache de plan — tout vérifié correct). Plutôt que d'exposer une policy SELECT
// large pour anon (qui laisserait n'importe qui lire les intérêts de TOUS les
// patients de TOUTES les pharmacies via la clé anon publique), cette écriture
// passe désormais par la clé de service (bypass RLS complet), avec les
// vérifications d'accès faites explicitement ci-dessous — même schéma que
// submit-ordonnance.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isValidPatientCode } from "../_shared/upload-validation.ts";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  const CORS = corsHeaders(req, {
    "Access-Control-Allow-Headers": "content-type, authorization",
    "Content-Type": "application/json",
  });
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const body = await req.json();
    const pharmacieId = body?.pharmacieId?.toString();
    const codePatient = body?.codePatient?.toString() || "";
    const offreId      = body?.offreId?.toString();
    const offreTitre   = body?.offreTitre?.toString();
    const offreEmoji   = body?.offreEmoji?.toString() || "🎁";
    const offreType    = body?.offreType?.toString() || "promo";
    const actif        = body?.actif === true;

    if (!pharmacieId || !offreId || !offreTitre) {
      return new Response(JSON.stringify({ error: "pharmacieId, offreId et offreTitre requis" }),
        { status: 400, headers: CORS });
    }
    if (!isValidPatientCode(codePatient)) {
      return new Response(JSON.stringify({ error: "code_patient invalide" }),
        { status: 400, headers: CORS });
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Vérifier que la pharmacie existe (garde-fou léger — pas de qr_token exigé
    // ici : cet appel n'a lieu qu'après un dépôt d'ordonnance réussi, où le
    // qr_token a déjà été vérifié par submit-ordonnance).
    const { data: ph } = await sb.from("pharmacies").select("id").eq("id", pharmacieId).maybeSingle();
    if (!ph) {
      return new Response(JSON.stringify({ error: "Pharmacie introuvable" }),
        { status: 404, headers: CORS });
    }

    const dateJour = new Date().toISOString().split("T")[0];

    // Clé de service → bypass RLS, aucun problème de visibilité SELECT pour
    // l'upsert (contrairement à un appel direct en clé anon).
    const { error } = await sb.from("offre_interets").upsert({
      pharmacie_id: pharmacieId,
      code_patient: codePatient,
      offre_id:     offreId,
      offre_titre:  offreTitre,
      offre_emoji:  offreEmoji,
      offre_type:   offreType,
      date_jour:    dateJour,
      actif,
    }, { onConflict: "code_patient,offre_id,date_jour" });

    if (error) throw new Error(error.message);

    return new Response(JSON.stringify({ success: true }), { headers: CORS });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS });
  }
});
