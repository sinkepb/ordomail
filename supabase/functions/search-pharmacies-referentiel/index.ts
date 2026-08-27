// OrdoMail — Edge Function search-pharmacies-referentiel
// Autocomplete "Pharmacie *" à l'inscription (BillingModule.jsx) : suggère de
// vraies pharmacies françaises (nom, adresse, SIRET) pour accélérer et
// fiabiliser la saisie — un assistant, pas une contrainte (le titulaire garde
// la main pour corriger/saisir librement).
//
// Public, sans authentification (appelé avant la création du compte) — la
// donnée elle-même est un annuaire public (SIRENE), mais la table reste
// derrière service_role plutôt qu'exposée en lecture directe via l'API REST
// anon, pour ne pas donner un accès de requêtage libre sur les 10k lignes.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const CORS = corsHeaders(req, {
    "Access-Control-Allow-Headers": "content-type, apikey",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Content-Type": "application/json",
  });
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: CORS });
  }

  try {
    const q = new URL(req.url).searchParams.get("q")?.trim() || "";
    if (q.length < 2) {
      return new Response(JSON.stringify({ data: [] }), { headers: CORS });
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // pg_trgm : tolère les fautes de frappe/variantes, classe par pertinence
    // (similarity) plutôt qu'un simple ILIKE préfixe.
    const { data, error } = await sb.rpc("search_pharmacies_referentiel", { q, max_results: 8 });
    if (error) throw new Error(error.message);

    return new Response(JSON.stringify({ data: data || [] }), { headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }),
      { status: 500, headers: CORS });
  }
});
