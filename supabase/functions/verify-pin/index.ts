// Supabase Edge Function : verify-pin
// Vérifie le PIN d'un vendeur et retourne les infos de la pharmacie

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, x-client-info, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

Deno.serve(async (req) => {
  // Répondre aux preflight OPTIONS immédiatement
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: CORS });
  }

  try {
    const { pin, pharmacieId } = await req.json();

    if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      return new Response(JSON.stringify({ error: "PIN invalide" }), 
        { status: 400, headers: CORS });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Construire la requête postes
    let url = `${supabaseUrl}/rest/v1/pharmacie_postes?pin=eq.${pin}&actif=eq.true&select=id,nom,pin,pharmacie_id,pharmacies(id,nom,couleur,plan,code_vendeur)`;
    if (pharmacieId) url += `&pharmacie_id=eq.${pharmacieId}`;

    const res = await fetch(url, {
      headers: {
        "apikey": serviceKey,
        "Authorization": `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
    });

    const postes = await res.json();

    if (!postes || postes.length === 0) {
      return new Response(JSON.stringify({ error: "PIN incorrect ou poste inactif" }),
        { status: 401, headers: CORS });
    }

    const poste = postes[0];
    const pharmacie = poste.pharmacies;

    return new Response(JSON.stringify({
      success: true,
      poste: { id: poste.id, nom: poste.nom, pin: poste.pin },
      pharmacie: { id: pharmacie.id, nom: pharmacie.nom, couleur: pharmacie.couleur, plan: pharmacie.plan },
    }), { headers: CORS });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }),
      { status: 500, headers: CORS });
  }
});
