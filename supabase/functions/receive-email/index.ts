// @version 16/07/2026 09:48 — fix-to-clean
// OrdoMail — Edge Function receive-email
// Wrapper autour de send-email qui ajoute le parsing du code patient
// depuis l'adresse email dynamique (ex: ph1-247@in.ordomail.fr)
//
// FLUX :
// Postmark → receive-email → send-email (comportement existant préservé)
//                          → UPDATE ordonnances SET code_patient = '247'

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, x-client-info, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: CORS });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const dbHeaders   = {
      "apikey": serviceKey,
      "Authorization": `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    };

    // Lire le payload Postmark
    const payload = await req.json();

    // ── 1. Extraire le code depuis l'adresse To ─────────────────────────────
    const toRaw   = payload.To || payload.to || payload.recipient || "";
    const toEmail = toRaw.match(/[\w.+%-]+@[\w.-]+/)?.[0]?.toLowerCase() || "";

    // Regex : -[0-9a-z]{4}(?=@) — code patient = 3 chiffres + 1 lettre (insérée à une
    // position aléatoire par generateCode() côté client, voir PatientPage.jsx).
    // "pharmacie-de-la-paix-24k7@in.immodiaspora.fr" → code="24K7"
    // "pharmacie-de-la-paix@in.immodiaspora.fr"      → code=null (inchangé)
    // ⚠️ toEmail est déjà en minuscules (ligne ci-dessus) — remis en majuscules pour
    // matcher le code généré côté client (comparaison stricte === en aval : sonnette,
    // regroupement dashboard).
    const codeMatch   = toEmail.match(/-([0-9a-z]{4})(?=@)/);
    const codePatient = codeMatch ? codeMatch[1].toUpperCase() : null;

    // Nettoyer l'adresse To pour send-email : retirer le code
    // "pharmacie-de-la-paix-24k7@in.immodiaspora.fr"
    // → "pharmacie-de-la-paix@in.immodiaspora.fr"
    const toEmailClean = toEmail.replace(/-[0-9a-z]{4}(?=@)/, "");

    // Reconstruire le payload avec l'adresse nettoyée pour send-email
    const payloadForSendEmail = {
      ...payload,
      To: toEmailClean,
      to: toEmailClean,
      recipient: toEmailClean,
    };

    console.log("[receive-email] To original:", toEmail);
    console.log("[receive-email] To nettoyé:", toEmailClean);
    console.log("[receive-email] code extrait:", codePatient);

    // ── 2. Appeler send-email avec l'adresse SANS le code ───────────────────
    const sendEmailUrl = `${supabaseUrl}/functions/v1/send-email`;
    const sendRes = await fetch(sendEmailUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": serviceKey,
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify(payloadForSendEmail), // payload avec To nettoyé
    });

    const sendData = await sendRes.json().catch(() => ({}));
    console.log("[receive-email] send-email status:", sendRes.status, sendData);

    // ── 3. Si un code a été extrait, mettre à jour l'ordonnance créée ───────
    if (codePatient && sendData?.ordonnance_id) {
      // send-email retourne l'id de l'ordonnance créée
      const updateRes = await fetch(
        `${supabaseUrl}/rest/v1/ordonnances?id=eq.${sendData.ordonnance_id}`,
        {
          method: "PATCH",
          headers: { ...dbHeaders, "Prefer": "return=minimal" },
          body: JSON.stringify({ code_patient: codePatient }),
        }
      );
      console.log("[receive-email] code_patient mis à jour:", codePatient, "status:", updateRes.status);
    } else if (codePatient && !sendData?.ordonnance_id) {
      // send-email ne retourne pas l'id → chercher l'ordonnance la plus récente
      // créée dans les 10 dernières secondes pour cette pharmacie
      console.log("[receive-email] ordonnance_id non retourné par send-email — cherche la plus récente");

      // Attendre 1s que l'insertion soit complète
      await new Promise(r => setTimeout(r, 1000));

      const since = new Date(Date.now() - 15000).toISOString(); // 15s
      const searchRes = await fetch(
        `${supabaseUrl}/rest/v1/ordonnances?source=eq.email&code_patient=is.null&received_at=gte.${since}&order=received_at.desc&limit=1&select=id`,
        { headers: dbHeaders }
      );
      const ordos = await searchRes.json();

      if (Array.isArray(ordos) && ordos.length > 0) {
        const ordoId = ordos[0].id;
        await fetch(
          `${supabaseUrl}/rest/v1/ordonnances?id=eq.${ordoId}`,
          {
            method: "PATCH",
            headers: { ...dbHeaders, "Prefer": "return=minimal" },
            body: JSON.stringify({ code_patient: codePatient }),
          }
        );
        console.log("[receive-email] code_patient mis à jour sur ordo récente:", ordoId);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      code_patient: codePatient,
      send_email_status: sendRes.status,
    }), { headers: CORS });

  } catch (e) {
    console.error("[receive-email] Erreur:", e.message);
    // En cas d'erreur dans receive-email, NE PAS bloquer — retourner 200
    // pour que Postmark ne retry pas en boucle
    return new Response(JSON.stringify({ success: false, error: e.message }), 
      { status: 200, headers: CORS });
  }
});
