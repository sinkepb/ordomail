// ─── Adaptateur SMS ─────────────────────────────────────────────────────────
// 04/09/2026 — mock volontaire pour le lancement des rappels de renouvellement
// (voir rappelLogic.ts) : aucun compte prestataire n'est encore configuré.
// sendSms() n'appelle personne, journalise l'envoi simulé et renvoie toujours
// un succès — le reste du pipeline (statuts, cron, page patient) est ainsi
// développé et testable indépendamment de l'intégration réelle.
//
// Pour brancher un vrai envoi (Brevo décidé) : remplacer uniquement le corps
// de cette fonction par l'appel à
// https://api.brevo.com/v3/transactionalSMS/sms (header api-key, body
// {sender, recipient, content}) — aucun appelant (rappelLogic.ts) n'a besoin
// de changer, sendSms() garde la même signature.
export interface SendSmsResult {
  success: boolean;
  mocked: boolean;
  error?: string;
}

export async function sendSms(to: string, message: string, senderName: string): Promise<SendSmsResult> {
  console.log(`[sms:mock] de="${senderName}" à="${to}" message="${message}"`);
  return { success: true, mocked: true };
}
