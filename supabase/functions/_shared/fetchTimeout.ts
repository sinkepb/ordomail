// OrdoMail — fetch avec timeout (01/10/2026, audit DevOps)
//
// Aucun appel réseau externe du dépôt (OVH SMS, Postmark, webhooks d'alerte,
// snapshot-metriques, receive-email, update-pin) n'avait de limite de temps —
// seul le timeout global de la fonction Edge bornait l'attente. Pour
// send-rappel-sms (concurrence bornée à 5, lot de 200), un prestataire lent
// dégradait tout le scan au lieu d'échouer vite et de libérer le slot pour le
// suivant.
//
// 10s par défaut — largement au-dessus d'une latence réseau normale, mais
// assez court pour ne jamais laisser un seul appel bloquant monopoliser un
// slot de concurrence pendant la durée du timeout de la fonction elle-même.
export async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
