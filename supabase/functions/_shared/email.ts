// ─── Envoi d'email transactionnel sortant (Postmark API HTTP) ─────────────
// 04/09/2026 — jusqu'ici Postmark n'était utilisé QUE côté entrant
// (receive-email/send-email traitent les webhooks Postmark pour les
// ordonnances reçues par email, voir _shared/webhook-secret.ts). Aucun envoi
// sortant n'existait dans le code (les emails Auth — confirmation, reset —
// passent par le SMTP configuré directement dans Supabase, invisible ici).
//
// Utilisé pour le bouton "Envoyer (test)" des rappels de renouvellement : en
// attendant un vrai prestataire SMS (voir _shared/sms.ts, mock), le
// pharmacien peut se faire parvenir le lien du rappel par email pour tester
// le parcours patient de bout en bout.
//
// Nécessite POSTMARK_SERVER_TOKEN (Server API Token — différent du secret de
// webhook POSTMARK_WEBHOOK_SECRET déjà configuré) et un expéditeur vérifié
// dans Postmark (Sender Signature ou domaine authentifié) via EMAIL_FROM.
export interface SendEmailResult {
  success: boolean;
  error?: string;
}

export async function sendTransactionalEmail(
  to: string,
  subject: string,
  htmlBody: string,
  textBody: string,
): Promise<SendEmailResult> {
  const token = Deno.env.get("POSTMARK_SERVER_TOKEN");
  const from = Deno.env.get("EMAIL_FROM") || "OrdoMail <notifications@ordomail.fr>";
  if (!token) {
    return { success: false, error: "Envoi d'email non configuré (POSTMARK_SERVER_TOKEN manquant)" };
  }
  try {
    const res = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-Postmark-Server-Token": token,
      },
      body: JSON.stringify({
        From: from,
        To: to,
        Subject: subject,
        HtmlBody: htmlBody,
        TextBody: textBody,
        MessageStream: "outbound",
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { success: false, error: `Postmark ${res.status} — ${body.slice(0, 200)}` };
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}
