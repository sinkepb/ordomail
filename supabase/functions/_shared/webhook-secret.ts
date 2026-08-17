// OrdoMail — vérification du secret partagé pour les webhooks Postmark
// (receive-email, send-email).
//
// Audit du 17/08/2026 : ces deux fonctions n'appliquaient AUCUNE
// authentification — n'importe qui, en devinant/observant l'URL de la
// fonction, pouvait injecter une fausse ordonnance dans la file de
// n'importe quelle pharmacie en fournissant un email_reception valide dans
// le payload. Postmark ne peut pas envoyer de JWT Supabase Auth (ce n'est
// pas un client Supabase) : le secret est donc transmis en paramètre d'URL,
// configuré côté Postmark (Message Streams → Inbound → Webhook URL) :
//   https://<projet>.functions.supabase.co/receive-email?secret=<POSTMARK_WEBHOOK_SECRET>
//
// Échoue FERMÉ : si POSTMARK_WEBHOOK_SECRET n'est pas configuré côté
// serveur, tous les appels sont rejetés plutôt que laissés passer (à
// l'inverse du pattern "fail-open" déjà identifié comme dangereux sur
// purge-ordonnances/snapshot-metriques — `if (cronSecret && header !== cronSecret)`
// ne protège rien si la variable d'environnement est absente).

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = new TextEncoder().encode(a);
  const bufB = new TextEncoder().encode(b);
  if (bufA.length !== bufB.length) return false;
  let diff = 0;
  for (let i = 0; i < bufA.length; i++) diff |= bufA[i] ^ bufB[i];
  return diff === 0;
}

/** Vérifie le paramètre ?secret= de l'URL contre POSTMARK_WEBHOOK_SECRET. */
export function verifyWebhookSecret(req: Request): boolean {
  const expected = Deno.env.get("POSTMARK_WEBHOOK_SECRET") || "";
  if (!expected) return false;
  const provided = new URL(req.url).searchParams.get("secret") || "";
  if (!provided) return false;
  return timingSafeEqual(provided, expected);
}
