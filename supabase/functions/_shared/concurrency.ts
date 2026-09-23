// OrdoMail — exécution en parallèle bornée pour les traitements par lot (cron)
// @fix 24/09/2026 (audit) — plusieurs crons (rappels SMS, facturation de
// dépassement, downgrades différés) traitaient leur lot entièrement en
// séquentiel : pas bloquant au volume actuel, mais un mur de passage à
// l'échelle (un seul appel externe lent multiplie le temps total). Une
// concurrence bornée (plutôt qu'un Promise.all sans limite) accélère le
// traitement sans bombarder un prestataire externe (Stripe, SMS, email) de
// dizaines d'appels simultanés au même instant.
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, () => worker());
  await Promise.all(workers);
  return results;
}
