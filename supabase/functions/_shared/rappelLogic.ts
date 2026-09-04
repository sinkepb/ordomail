// ─── Scan quotidien des rappels de renouvellement d'ordonnance ─────────────
// 04/09/2026 — logique partagée entre send-rappel-sms (cron) et un futur
// déclenchement manuel depuis le backoffice, même schéma que purgeLogic.ts.
//
// Un rappel "en_attente" dont l'échéance (date_prochaine_relance, J+21) est
// passée reçoit un SMS (adaptateur mock, voir sms.ts) contenant un lien vers
// resolve-rappel côté patient. Le token est régénéré à CHAQUE envoi — un lien
// SMS plus ancien (cycle précédent) ne doit plus jamais pouvoir enregistrer de
// réponse. consentement_sms est revérifié ici en défense en profondeur, même
// si la création (secure-data:rappels_create) l'exige déjà côté UI.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendSms } from "./sms.ts";

export interface RappelScanResult {
  scanned: number;
  sent: number;
  failed: number;
}

export async function runRappelScan(sb: SupabaseClient, appUrl: string): Promise<RappelScanResult> {
  const { data: dus, error } = await sb
    .from("rappels_ordonnance")
    .select("id, pharmacie_id, patient_prenom, patient_telephone, pharmacies(nom)")
    .eq("statut", "en_attente")
    .eq("consentement_sms", true)
    .lte("date_prochaine_relance", new Date().toISOString());
  if (error) throw new Error(error.message);

  let sent = 0, failed = 0;
  for (const rappel of dus || []) {
    try {
      const newToken = crypto.randomUUID();
      const pharmacieNom = (rappel as any).pharmacies?.nom || "votre pharmacie";
      const lien = `${appUrl}/?rappel=${newToken}`;
      const message = `Bonjour ${rappel.patient_prenom}, votre renouvellement d'ordonnance chez ${pharmacieNom} est prévu prochainement. Cliquez ici pour nous indiquer ce que vous souhaitez faire : ${lien}`;

      const result = await sendSms(rappel.patient_telephone, message, pharmacieNom);

      if (!result.success) {
        failed++;
        await sb.from("rappels_evenements").insert({ rappel_id: rappel.id, type: "sms_echec", meta: { error: result.error || "inconnu" } });
        continue;
      }

      await sb.from("rappels_ordonnance").update({
        statut: "sms_envoye",
        token: newToken,
        date_dernier_sms_envoye: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", rappel.id);
      await sb.from("rappels_evenements").insert({ rappel_id: rappel.id, type: "sms_envoye", meta: { mocked: result.mocked } });
      sent++;
    } catch (e) {
      failed++;
      console.error(`[rappel] échec pour ${rappel.id}:`, (e as Error).message);
    }
  }

  return { scanned: (dus || []).length, sent, failed };
}
