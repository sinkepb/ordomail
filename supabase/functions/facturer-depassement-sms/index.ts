// OrdoMail — Edge Function facturer-depassement-sms (15/09/2026)
//
// Facturation automatique des SMS de rappel envoyés au-delà du quota inclus
// (SMS_INCLUS_MENSUEL, voir _shared/smsQuota.ts) — remplace l'achat manuel
// d'un pack de 100 SMS par le pharmacien : jusqu'ici, le dépassement affiché
// dans RappelsSection.jsx ne bloquait JAMAIS réellement l'envoi (send-rappel-sms
// n'a aucune vérification de quota), donc un dépassement non payé
// manuellement n'était tout simplement jamais facturé. Cette fonction ferme
// cet écart en créant une ligne de facturation Stripe (invoice item, incluse
// automatiquement à la prochaine facture du client) pour chaque SMS
// au-delà du quota, sans aucune action requise du pharmacien.
//
// Déclenchée par pg_cron le 1er de chaque mois (voir migration
// 20260915_facturer_depassement_sms.sql) — facture le mois qui vient de se
// terminer. Idempotent au niveau du mois via reportAlert(meta.mois) : si le
// job est relancé manuellement pour le même mois, on ne recrée pas une
// deuxième ligne de facturation pour la même pharmacie (vérifié via
// l'historique d'alertes plutôt qu'une table dédiée — volume faible, pas de
// nouveau schéma pour ce seul besoin).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.0.0";
import { reportAlert } from "../_shared/alert.ts";
import { sendTransactionalEmail, wrapCustomerEmail } from "../_shared/email.ts";
import { SMS_INCLUS_MENSUEL } from "../_shared/smsQuota.ts";
import { mapWithConcurrency } from "../_shared/concurrency.ts";

const PRIX_SMS_DEPASSEMENT_CENTIMES = 10; // 0,10 € / SMS au-delà du quota
// @fix 24/09/2026 (audit) — séquentiel jusqu'ici ; chaque pharmacie est
// traitée indépendamment (idempotence par pharmacie+mois), donc paralléliser
// est sûr. Concurrence bornée pour ne pas bombarder Stripe/le prestataire
// d'email de dizaines d'appels simultanés le 1er de chaque mois.
const FACTURATION_CONCURRENCY = 5;

function isSmsReel(e: { type: string; meta?: { canal?: string } }): boolean {
  return e.type === "sms_envoye" && e.meta?.canal !== "email_test";
}

Deno.serve(async (req) => {
  const cronSecret = req.headers.get("x-cron-secret") || new URL(req.url).searchParams.get("secret");
  if (cronSecret !== Deno.env.get("PURGE_CRON_SECRET")) {
    return new Response(JSON.stringify({ error: "Non autorisé" }), { status: 401 });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2023-10-16" });

  const now = new Date();
  const debutMoisPrecedent = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const debutMoisCourant = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const libelleMois = debutMoisPrecedent.toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });

  const { data: pharmacies, error } = await supabase
    .from("pharmacies")
    .select("id, nom, email, plan, stripe_customer_id")
    .eq("plan", "pro")
    .not("stripe_customer_id", "is", null);
  if (error) {
    await reportAlert(supabase, { source: "facturer-depassement-sms", severity: "critical", message: `Lecture des pharmacies échouée — ${error.message}` });
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const erreurs: string[] = [];

  const outcomes = await mapWithConcurrency(pharmacies || [], FACTURATION_CONCURRENCY, async (ph): Promise<boolean> => {
    try {
      const { data: rappels } = await supabase.from("rappels_ordonnance").select("id").eq("pharmacie_id", ph.id);
      const rappelIds = (rappels || []).map((r: { id: string }) => r.id);
      if (rappelIds.length === 0) return false;

      const { data: evenements } = await supabase.from("rappels_evenements")
        .select("type, meta, created_at")
        .in("rappel_id", rappelIds)
        .gte("created_at", debutMoisPrecedent.toISOString())
        .lt("created_at", debutMoisCourant.toISOString());
      const smsEnvoyes = (evenements || []).filter(isSmsReel).length;
      const depassement = Math.max(0, smsEnvoyes - SMS_INCLUS_MENSUEL);
      if (depassement === 0) return false;

      // Idempotence (relance manuelle du job pour le même mois) — une seule
      // ligne Stripe par pharmacie et par mois, jamais de double facturation.
      const { data: dejaFacture } = await supabase.from("alerts")
        .select("id").eq("source", "facturer-depassement-sms")
        .contains("meta", { pharmacieId: ph.id, mois: libelleMois }).limit(1);
      if (dejaFacture && dejaFacture.length > 0) return false;

      const montantCentimes = depassement * PRIX_SMS_DEPASSEMENT_CENTIMES;
      const description = `SMS de rappel au-delà du quota inclus — ${libelleMois} : ${depassement} SMS × 0,10 €`;

      await stripe.invoiceItems.create({
        customer: ph.stripe_customer_id,
        amount: montantCentimes,
        currency: "eur",
        description,
      });

      if (ph.email) {
        const { html, text } = wrapCustomerEmail(
          `<p>Vous avez envoyé <strong>${smsEnvoyes} SMS</strong> de rappel en ${libelleMois}, dont <strong>${depassement}</strong> au-delà des ${SMS_INCLUS_MENSUEL} SMS inclus dans votre abonnement.</p><p>Le montant correspondant (<strong>${(montantCentimes / 100).toFixed(2)} €</strong>, soit 0,10 € par SMS) sera automatiquement ajouté à votre prochaine facture — aucune action de votre part n'est nécessaire.</p>`,
          `Vous avez envoyé ${smsEnvoyes} SMS de rappel en ${libelleMois}, dont ${depassement} au-delà des ${SMS_INCLUS_MENSUEL} SMS inclus. Le montant correspondant (${(montantCentimes / 100).toFixed(2)} €, soit 0,10 € par SMS) sera automatiquement ajouté à votre prochaine facture — aucune action de votre part n'est nécessaire.`,
        );
        try {
          const result = await sendTransactionalEmail(ph.email, `Dépassement de quota SMS — ${libelleMois}`, html, text);
          if (!result.success) {
            await reportAlert(supabase, { source: "facturer-depassement-sms", severity: "warning", message: `Email de dépassement non envoyé à ${ph.email} — ${result.error}`, meta: { pharmacieId: ph.id, mois: libelleMois } });
          }
        } catch (e) {
          await reportAlert(supabase, { source: "facturer-depassement-sms", severity: "warning", message: `Email de dépassement non envoyé à ${ph.email} — ${(e as Error).message}`, meta: { pharmacieId: ph.id, mois: libelleMois } });
        }
      }

      await reportAlert(supabase, {
        source: "facturer-depassement-sms", severity: "info",
        message: `${depassement} SMS facturés pour ${ph.nom} (${libelleMois}) — ${(montantCentimes / 100).toFixed(2)} €`,
        meta: { pharmacieId: ph.id, mois: libelleMois, smsEnvoyes, depassement, montantCentimes },
      });
      return true;
    } catch (e) {
      erreurs.push(`${ph.id}: ${(e as Error).message}`);
      return false;
    }
  });
  const facturees = outcomes.filter(Boolean).length;

  if (erreurs.length) {
    await reportAlert(supabase, {
      source: "facturer-depassement-sms", severity: "warning",
      message: `${erreurs.length} pharmacie(s) en échec sur ${(pharmacies || []).length}`,
      meta: { erreurs, mois: libelleMois },
    });
  }

  return new Response(JSON.stringify({ facturees, total: (pharmacies || []).length, erreurs, mois: libelleMois }), { headers: { "Content-Type": "application/json" } });
});
