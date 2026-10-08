// Sonnette patient : l'appel est enregistré et diffusé côté serveur, pour
// que seul un vendeur ou titulaire authentifié puisse déclencher une
// notification (plus d'insertion anonyme ni de diffusion depuis le navigateur).
import type { ContexteSecureData } from "./contexte.ts";

const CODE_PATIENT = /^[A-Za-z0-9]{2,8}$/;

export async function handle_sonnette(ctx: ContexteSecureData): Promise<Response | null> {
  const { sb, supabaseUrl, serviceKey, pharmacieId, resource, params, CORS } = ctx;
  if (resource !== "appeler_patient") return null;

  if (!pharmacieId) {
    return new Response(JSON.stringify({ error: "Réservé aux comptes pharmacie" }), { status: 403, headers: CORS });
  }
  const codePatient = typeof params?.codePatient === "string" ? params.codePatient.trim() : "";
  if (!CODE_PATIENT.test(codePatient)) {
    return new Response(JSON.stringify({ error: "Code patient invalide" }), { status: 400, headers: CORS });
  }

  const { error } = await sb.from("appels_patient").insert({ pharmacie_id: pharmacieId, code_patient: codePatient });
  if (error) throw new Error(error.message);

  const diffusion = await fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    body: JSON.stringify({
      messages: [{ topic: `appels:${pharmacieId}`, event: "appel", payload: { pharmacie_id: pharmacieId, code_patient: codePatient } }],
    }),
  });
  if (!diffusion.ok) {
    return new Response(JSON.stringify({ error: "Échec de la notification" }), { status: 502, headers: CORS });
  }
  return new Response(JSON.stringify({ data: { ok: true } }), { headers: CORS });
}
