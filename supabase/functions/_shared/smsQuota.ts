// OrdoMail — Quota SMS mensuel des rappels (11/09/2026)
//
// Le plan Performance inclut SMS_INCLUS_MENSUEL SMS/mois ; au-delà, la
// pharmacie achète des packs de PACK_SMS_QUANTITE SMS (voir sms_acheter_pack).
// La consommation se lit depuis rappels_evenements (jamais dupliquée dans un
// compteur séparé, pour ne jamais désynchroniser deux sources de vérité) ;
// seuls les packs achetés (sms_packs_achetes) sont une donnée propre, écrite
// une seule fois à la confirmation du paiement Stripe.
export const SMS_INCLUS_MENSUEL = 200;
export const PACK_SMS_QUANTITE = 100;
export const PACK_SMS_PRIX_TTC_CENTIMES = 1000; // 10,00 €

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
