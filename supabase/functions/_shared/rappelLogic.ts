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
import { generateShortToken } from "./shortToken.ts";

export interface RappelScanResult {
  scanned: number;
  sent: number;
  failed: number;
}

// Construit le lien court (voir shortToken.ts) et le message patient — une
// seule source de vérité pour le texte, réutilisée par le cron ET l'envoi
// manuel (secure-data:rappels_envoyer_test).
// Le nom de la pharmacie apparaît désormais DANS le corps (06/09/2026) —
// l'expéditeur SMS est un nom unique pour toute la plateforme ("OrdoMail",
// voir PLATFORM_SENDER dans sms.ts : un expéditeur alphanumérique par
// pharmacie exigerait un enregistrement ET une modération OVH par
// pharmacie, intenable pour un SaaS), donc ce n'est plus lui qui identifie
// la pharmacie pour le patient.
export function buildRappelLien(appUrl: string, token: string): string {
  return `${appUrl}/?r=${token}`;
}

// Mise en forme (07/09/2026, retour direct) — un saut de ligne après le nom
// du patient et après chaque phrase, plutôt qu'un seul bloc de texte, pour
// une meilleure lisibilité sur petit écran. "M/Mme" ajouté devant le nom.
export function buildRappelMessage(prenom: string, nom: string, lien: string, pharmacieNom: string): string {
  return `Bonjour M/Mme ${prenom} ${nom},\n${pharmacieNom} vous informe que votre renouvellement d'ordonnance est prévu prochainement.\nCliquez sur le lien ci-dessous pour nous indiquer ce que vous voulez faire.\n${lien}`;
}

export async function runRappelScan(sb: SupabaseClient, appUrl: string): Promise<RappelScanResult> {
  const { data: dus, error } = await sb
    .from("rappels_ordonnance")
    .select("id, pharmacie_id, patient_prenom, patient_nom, patient_telephone, pharmacies(nom)")
    .eq("statut", "en_attente")
    .eq("consentement_sms", true)
    .lte("date_prochaine_relance", new Date().toISOString());
  if (error) throw new Error(error.message);

  let sent = 0, failed = 0;
  for (const rappel of dus || []) {
    try {
      const newToken = generateShortToken();
      const pharmacieNom = (rappel as any).pharmacies?.nom || "votre pharmacie";
      const lien = buildRappelLien(appUrl, newToken);
      const message = buildRappelMessage(rappel.patient_prenom, rappel.patient_nom, lien, pharmacieNom);

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
