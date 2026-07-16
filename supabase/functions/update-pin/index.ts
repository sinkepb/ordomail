// OrdoMail — Edge Function update-pin
// Met à jour le PIN d'un poste vendeur

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, x-client-info, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

Deno.serve(async (req) => {
  // Preflight CORS — répondre immédiatement
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: CORS });
  }

  try {
    const { posteId, pin } = await req.json();

    if (!posteId || !pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      return new Response(
        JSON.stringify({ error: "PIN invalide — 4 chiffres requis" }),
        { status: 400, headers: CORS }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const res = await fetch(
      `${supabaseUrl}/rest/v1/pharmacie_postes?id=eq.${posteId}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "apikey": serviceKey,
          "Authorization": `Bearer ${serviceKey}`,
          "Prefer": "return=minimal",
        },
        body: JSON.stringify({ pin }),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      return new Response(
        JSON.stringify({ error: err }),
        { status: 500, headers: CORS }
      );
    }

    return new Response(JSON.stringify({ success: true }), { headers: CORS });

  } catch (e) {
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: CORS }
    );
  }
});
