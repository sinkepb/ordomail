// OrdoMail — Edge Function mobile-offre (03/09/2026)
//
// Page mobile atteinte en scannant le QR affiché sur le dashboard PC (jeton
// signé émis par secure-data:offre_mint_mobile_token). Volontairement PAS
// vérifiée via resolveCaller (vendeur/titulaire/admin) : le rôle "offre_mobile"
// est un jeton distinct, à durée de vie courte (15 min), qui ne donne accès
// qu'à créer une offre pour LA pharmacie encodée dedans — rien d'autre. Le
// mobile n'a jamais de session Supabase Auth ni de PIN à saisir ("zéro
// connexion" — voir la mission).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { verifyToken } from "../_shared/jwt.ts";
import { validateFile } from "../_shared/upload-validation.ts";
import { planHasFeature } from "../_shared/planFeatures.ts";

async function checkToken(bearer: string, jwtSecret: string): Promise<{ pharmacieId: string } | null> {
  const result = await verifyToken(bearer, jwtSecret);
  if (!result.valid || result.payload.role !== "offre_mobile" || !result.payload.pharmacie_id) return null;
  return { pharmacieId: String(result.payload.pharmacie_id) };
}

Deno.serve(async (req) => {
  const CORS = corsHeaders(req, {
    // ⚠️ apikey requis (voir toggle-interet/index.ts pour le même bug déjà
    // rencontré) : le client envoie ce header en plus d'Authorization —
    // sans lui ici, le préflight OPTIONS échoue et la vraie requête POST
    // n'est jamais envoyée ("Request header field apikey is not allowed").
    "Access-Control-Allow-Headers": "content-type, authorization, apikey",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  });
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const jwtSecret = Deno.env.get("ORDOMAIL_JWT_SECRET")!;
    const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
    const { action, ...params } = await req.json();

    const auth = await checkToken(bearer, jwtSecret);
    if (!auth) {
      return new Response(JSON.stringify({ error: "Lien expiré ou invalide — redemandez un QR code depuis le dashboard PC" }), { status: 401, headers: CORS });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Confirme juste que le lien est encore valide (affichage de la page
    // avant capture) — sans ça, un lien expiré n'échouerait qu'au moment de
    // "Diffuser", après que le préparateur a déjà pris la photo et tapé le prix.
    if (action === "verify") {
      const { data: ph } = await supabase.from("pharmacies").select("nom, plan").eq("id", auth.pharmacieId).maybeSingle();
      if (!ph) return new Response(JSON.stringify({ error: "Pharmacie introuvable" }), { status: 404, headers: CORS });
      const canCreate = await planHasFeature(supabase, ph.plan, "offresStories");
      return new Response(JSON.stringify({ data: { pharmacieNom: ph.nom, canCreate } }), { headers: CORS });
    }

    if (action === "create") {
      const { data: ph } = await supabase.from("pharmacies").select("plan").eq("id", auth.pharmacieId).maybeSingle();
      if (!ph) return new Response(JSON.stringify({ error: "Pharmacie introuvable" }), { status: 404, headers: CORS });
      // Contrôle serveur explicite (§14, même logique que secure-data:offre_template_toggle) —
      // ce chemin ne passe jamais par la policy RLS pharmacie_insert_own_offres
      // (clé de service), donc rien d'autre ne bloquerait un plan Essentiel ici.
      if (!(await planHasFeature(supabase, ph.plan, "offresStories"))) {
        return new Response(JSON.stringify({ error: "Fonctionnalité non disponible sur ce plan" }), { status: 403, headers: CORS });
      }

      const { fileName, fileType, fileBase64, prix, titre } = params || {};
      if (!fileName || !fileType || !fileBase64) {
        return new Response(JSON.stringify({ error: "Photo requise" }), { status: 400, headers: CORS });
      }
      const prixNum = prix != null && prix !== "" ? Number(prix) : null;
      if (prixNum != null && (!Number.isFinite(prixNum) || prixNum < 0)) {
        return new Response(JSON.stringify({ error: "Prix invalide" }), { status: 400, headers: CORS });
      }

      let bytes: Uint8Array;
      try {
        bytes = Uint8Array.from(atob(fileBase64), (c) => c.charCodeAt(0));
      } catch (_e) {
        return new Response(JSON.stringify({ error: "Photo illisible (base64 invalide)" }), { status: 400, headers: CORS });
      }
      const check = validateFile({ name: fileName, type: fileType, size: bytes.length });
      if (!check.ok) {
        return new Response(JSON.stringify({ error: check.error }), { status: 400, headers: CORS });
      }

      const ext = fileName.split(".").pop()?.toLowerCase() || "jpg";
      const path = `offres/${auth.pharmacieId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("story-images").upload(path, bytes, { contentType: fileType, upsert: false });
      if (upErr) throw new Error(upErr.message);
      const { data: pub } = supabase.storage.from("story-images").getPublicUrl(path);

      const { data: offre, error: insErr } = await supabase.from("offres_stories").insert({
        pharmacie_id: auth.pharmacieId,
        type: "promo",
        titre: (titre && String(titre).trim()) || "Offre comptoir",
        image_url: pub.publicUrl,
        prix: prixNum,
        badge: prixNum != null ? `${prixNum} €` : null,
        actif: true,
        created_via: "mobile",
      }).select("id").single();
      if (insErr) throw new Error(insErr.message);

      return new Response(JSON.stringify({ data: { success: true, offreId: offre.id } }), { headers: CORS });
    }

    return new Response(JSON.stringify({ error: `Action inconnue: ${action}` }), { status: 400, headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: CORS });
  }
});
