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
import { mapWithConcurrency } from "./concurrency.ts";

// @fix 24/09/2026 (audit) — traitement séquentiel jusqu'ici (un SMS + 2
// écritures par rappel dû, borné par le timeout de la fonction) ; c'est le
// cron le plus exposé (le seul appelant un service externe par ligne).
// Concurrence bornée plutôt qu'illimitée — évite de bombarder l'adaptateur
// SMS (et le futur prestataire réel) de dizaines d'envois simultanés.
const RAPPEL_SCAN_CONCURRENCY = 5;

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
//
// Médecin prescripteur + spécialité (15/09/2026) — un même patient peut avoir
// plusieurs rappels actifs pour des traitements différents (ex. généraliste +
// dentiste), et le destinataire du SMS n'est pas forcément le patient
// lui-même (téléphone partagé, aidant…) : les deux, quand renseignés, aident
// à distinguer de quelle ordonnance il s'agit. Tous deux optionnels (repli
// sur le message d'origine si absents) — la combinaison des deux est tronquée
// à 35 caractères pour ne pas faire basculer le SMS sur un segment
// supplémentaire (facturé en plus par l'opérateur).
export function buildRappelMessage(prenom: string, nom: string, lien: string, pharmacieNom: string, medecin?: string | null, specialite?: string | null): string {
  const specialiteTrim = specialite?.trim();
  const medecinTrim = medecin?.trim();
  const detail = specialiteTrim && medecinTrim ? `${specialiteTrim}, ${medecinTrim}` : specialiteTrim || medecinTrim;
  const detailTronque = detail?.slice(0, 35);
  const objet = detailTronque
    ? `le renouvellement de votre ordonnance (${detailTronque}) est prévu prochainement`
    : `votre renouvellement d'ordonnance est prévu prochainement`;
  return `Bonjour M/Mme ${prenom} ${nom},\n${pharmacieNom} vous informe que ${objet}.\nCliquez ici pour nous dire ce que vous souhaitez faire :\n${lien}`;
}

export async function runRappelScan(sb: SupabaseClient, appUrl: string): Promise<RappelScanResult> {
  const { data: dus, error } = await sb
    .from("rappels_ordonnance")
    .select("id, pharmacie_id, patient_prenom, patient_nom, patient_telephone, medecin_prescripteur, specialite, pharmacies(nom)")
    .eq("statut", "en_attente")
    .eq("consentement_sms", true)
    .lte("date_prochaine_relance", new Date().toISOString());
  if (error) throw new Error(error.message);

  const outcomes = await mapWithConcurrency(dus || [], RAPPEL_SCAN_CONCURRENCY, async (rappel): Promise<"sent" | "failed"> => {
    try {
      const newToken = generateShortToken();
      const pharmacieNom = (rappel as any).pharmacies?.nom || "votre pharmacie";
      const lien = buildRappelLien(appUrl, newToken);
      const message = buildRappelMessage(rappel.patient_prenom, rappel.patient_nom, lien, pharmacieNom, rappel.medecin_prescripteur, rappel.specialite);

      const result = await sendSms(rappel.patient_telephone, message, pharmacieNom);

      if (!result.success) {
        await sb.from("rappels_evenements").insert({ rappel_id: rappel.id, type: "sms_echec", meta: { error: result.error || "inconnu" } });
        return "failed";
      }

      await sb.from("rappels_ordonnance").update({
        statut: "sms_envoye",
        token: newToken,
        date_dernier_sms_envoye: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", rappel.id);
      await sb.from("rappels_evenements").insert({ rappel_id: rappel.id, type: "sms_envoye", meta: { mocked: result.mocked } });
      return "sent";
    } catch (e) {
      console.error(`[rappel] échec pour ${rappel.id}:`, (e as Error).message);
      return "failed";
    }
  });

  const sent = outcomes.filter((o) => o === "sent").length;
  const failed = outcomes.filter((o) => o === "failed").length;
  return { scanned: (dus || []).length, sent, failed };
}
