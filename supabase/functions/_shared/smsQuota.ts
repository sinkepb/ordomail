// OrdoMail — Quota SMS mensuel des rappels (11/09/2026, révisé 15/09/2026)
//
// Le plan Performance inclut SMS_INCLUS_MENSUEL SMS/mois. Au-delà, l'envoi
// n'est jamais bloqué (send-rappel-sms n'a aucune vérification de quota) —
// le dépassement est facturé automatiquement en fin de mois par l'edge
// function facturer-depassement-sms (0,10 €/SMS, ligne ajoutée à la
// prochaine facture Stripe), sans action requise du pharmacien. Avant le
// 15/09/2026, le dépassement nécessitait l'achat manuel d'un pack de 100 SMS
// (sms_acheter_pack, supprimé) — sms_packs_achetes garde son rôle
// d'historique : les packs achetés avant ce changement restent crédités.
// La consommation se lit depuis rappels_evenements (jamais dupliquée dans un
// compteur séparé, pour ne jamais désynchroniser deux sources de vérité).
export const SMS_INCLUS_MENSUEL = 100;

function debutMoisCourantISO(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

// Même filtre que admin_rappels_metrics (secure-data-admin) : un envoi test
// par email (meta.canal === "email_test") n'a jamais consommé de SMS réel,
// donc jamais compté dans le quota — sinon un titulaire qui teste beaucoup
// la fonctionnalité s'auto-facturerait des packs pour rien.
function isSmsReel(e: { type: string; meta?: { canal?: string } }): boolean {
  return e.type === "sms_envoye" && e.meta?.canal !== "email_test";
}

export async function getSmsConsommation(sb: any, pharmacieId: string) {
  const debutMois = debutMoisCourantISO();

  const [{ data: rappels }, { data: packs }] = await Promise.all([
    sb.from("rappels_ordonnance").select("id").eq("pharmacie_id", pharmacieId),
    sb.from("sms_packs_achetes").select("quantite, prix_paye_ttc, created_at").eq("pharmacie_id", pharmacieId).gte("created_at", debutMois),
  ]);

  const rappelIds = (rappels || []).map((r: { id: string }) => r.id);
  let smsEnvoyesMoisCourant = 0;
  if (rappelIds.length > 0) {
    const { data: evenements } = await sb.from("rappels_evenements")
      .select("type, meta, created_at")
      .in("rappel_id", rappelIds)
      .gte("created_at", debutMois);
    smsEnvoyesMoisCourant = (evenements || []).filter(isSmsReel).length;
  }

  const packsAchetesMoisCourant = (packs || []).reduce((sum: number, p: { quantite: number }) => sum + p.quantite, 0);
  const quotaTotal = SMS_INCLUS_MENSUEL + packsAchetesMoisCourant;

  return {
    smsEnvoyesMoisCourant,
    packsAchetesMoisCourant,
    quotaInclus: SMS_INCLUS_MENSUEL,
    quotaTotal,
    quotaRestant: Math.max(0, quotaTotal - smsEnvoyesMoisCourant),
    depassement: Math.max(0, smsEnvoyesMoisCourant - quotaTotal),
  };
}
