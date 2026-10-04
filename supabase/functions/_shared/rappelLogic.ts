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
import { normaliserTelephone } from "./telephone.ts";
import { reportAlert } from "./alert.ts";

// @fix 24/09/2026 (audit) — traitement séquentiel jusqu'ici (un SMS + 2
// écritures par rappel dû, borné par le timeout de la fonction) ; c'est le
// cron le plus exposé (le seul appelant un service externe par ligne).
// Concurrence bornée plutôt qu'illimitée — évite de bombarder l'adaptateur
// SMS (et le futur prestataire réel) de dizaines d'envois simultanés.
const RAPPEL_SCAN_CONCURRENCY = 5;

// Lot borné par passage (01/10/2026, audit) — les 3 requêtes de ce fichier
// n'avaient aucune limite : si le nombre de rappels dus le même jour grossit
// (beaucoup de pharmacies créées à la même période, échéances J+21 groupées),
// rien ne bornait la taille traitée en une seule invocation de fonction, avec
// un risque de timeout. Le reste attend simplement le passage suivant — sans
// conséquence si le cron tourne au moins chaque heure (voir
// DEPLOIEMENT_CHECKLIST.md, passé de quotidien à horaire le même jour).
const SCAN_BATCH_SIZE = 200;

// Échecs d'envoi consécutifs avant abandon du SMS pour ce cycle (01/10/2026)
// — un échec isolé (panne transitoire du prestataire) est ré-essayé tout
// seul au prochain passage (voir sms_echecs_consecutifs, remis à zéro dès
// qu'un envoi réussit). Au-delà, l'échec est probablement permanent (numéro
// invalide...) : continuer à retenter indéfiniment serait un retry muet,
// sans jamais prévenir le pharmacien. Bascule en "à appeler", même filet de
// sécurité que pour un numéro fixe ou un silence du patient.
const SMS_ECHEC_MAX = 3;

// Relance puis escalade (01/10/2026, retour titulaire) — un patient qui ne
// répond jamais au premier SMS restait bloqué indéfiniment en "sms_envoye",
// sans aucune action. Un seul SMS de relance (J+3 sans réponse) avant de
// basculer en "à appeler" (J+3 après la relance, donc J+6 au total) : assez
// doux pour ne pas déranger un patient qui allait répondre le lendemain,
// mais sans laisser un silence total sans suite. Même statut "à appeler" que
// pour un numéro fixe ou un renouvellement partiel — aucune UI nouvelle à
// construire pour le pharmacien, juste un motif différent dans le journal.
const RELANCE_DELAI_JOURS = 3;
const ESCALADE_DELAI_JOURS = 3;

export interface RappelScanResult {
  scanned: number;
  sent: number;
  failed: number;
  appeler: number;
}

export interface RelanceScanResult {
  relances: number;
  escalades: number;
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

// Fusion du détail d'un renouvellement partiel dans le commentaire existant
// (01/10/2026, audit architecture) — source unique, reprise par les deux
// resources secure-data concernées (rappels_enregistrer_appel,
// rappels_confirmer_appel_partiel) ; le client n'a plus besoin de la
// dupliquer, la resource renvoie directement le commentaire final.
export function mergeCommentairePartiel(commentaireExistant: string | null, detail: string): string {
  const note = `Renouvellement partiel : ${detail.trim()}`;
  return commentaireExistant ? `${commentaireExistant}\n\n${note}` : note;
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
export function buildRappelMessage(prenom: string, nom: string, lien: string, pharmacieNom: string, medecin?: string | null, specialite?: string | null, estRelance = false): string {
  const specialiteTrim = specialite?.trim();
  const medecinTrim = medecin?.trim();
  const detail = specialiteTrim && medecinTrim ? `${specialiteTrim}, ${medecinTrim}` : specialiteTrim || medecinTrim;
  const detailTronque = detail?.slice(0, 35);
  const objet = detailTronque
    ? `le renouvellement de votre ordonnance (${detailTronque}) est prévu prochainement`
    : `votre renouvellement d'ordonnance est prévu prochainement`;
  const entete = estRelance ? `Rappel — Bonjour M/Mme ${prenom} ${nom},` : `Bonjour M/Mme ${prenom} ${nom},`;
  return `${entete}\n${pharmacieNom} vous informe que ${objet}.\nCliquez ici pour nous dire ce que vous souhaitez faire :\n${lien}`;
}

// Message groupé (03/10/2026, retour pharmacien) — un seul SMS pour
// plusieurs rappels dus le même jour chez la même pharmacie pour le même
// numéro, plutôt qu'un message par ordonnance. Volontairement sans le
// détail médecin/spécialité de chaque item (longueur du SMS, facturation au
// segment) — ce détail reste visible sur la page web derrière le lien.
export function buildRappelMessageGroupe(prenom: string, nom: string, lien: string, pharmacieNom: string): string {
  return `${pharmacieNom} : renouvellement d'ordonnance prévu pour ${prenom} ${nom}. Indiquez votre choix : ${lien}`;
}

// Regroupe les rappels dus par (pharmacie, numéro de téléphone) avant envoi
// (03/10/2026, retour pharmacien — un patient avec plusieurs traitements
// chroniques recevait jusqu'ici un SMS par ordonnance, et la pharmacie
// autant de casiers de préparation séparés pour une seule visite). Un
// numéro fixe ("appel") n'est jamais regroupé avec un envoi SMS : il suit
// son propre chemin (statut a_appeler direct, sans lien), toujours traité
// individuellement même si un autre rappel du même patient part par SMS.
// Même pharmacie, même numéro normalisé, même jour d'envoi : un seul SMS par groupe.
export function cleGroupeEnvoi(r: { pharmacie_id: string; patient_telephone: string; date_prochaine_relance?: string | null }): string {
  const jour = r.date_prochaine_relance
    ? new Date(r.date_prochaine_relance).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })
    : "";
  return `${r.pharmacie_id}::${normaliserTelephone(r.patient_telephone)}::${jour}`;
}

export function regrouperParTelephone<T extends { pharmacie_id: string; patient_telephone: string; mode_contact?: string | null; date_prochaine_relance?: string | null }>(rappels: T[]): T[][] {
  const index = new Map<string, T[]>();
  const groupes: T[][] = [];
  for (const r of rappels) {
    if (r.mode_contact === "appel") { groupes.push([r]); continue; }
    const cle = cleGroupeEnvoi(r);
    const existant = index.get(cle);
    if (existant) { existant.push(r); continue; }
    const nouveauGroupe: T[] = [r];
    index.set(cle, nouveauGroupe);
    groupes.push(nouveauGroupe);
  }
  return groupes;
}

type Outcome = "sent" | "failed" | "appeler";

// Traitement d'un rappel seul (comportement historique, inchangé) — utilisé
// aussi bien pour un rappel sans groupe que pour un groupe de taille 1.
async function traiterRappelIndividuel(sb: SupabaseClient, appUrl: string, rappel: any): Promise<Outcome> {
  // Patient sans mobile (30/09/2026, retour titulaire) — un numéro fixe ne
  // recevra jamais le SMS : le rappel passe directement en "à appeler"
  // (le pharmacien décroche lui-même), sans lien ni token à générer.
  if (rappel.mode_contact === "appel") {
    try {
      // Erreurs d'écriture vérifiées (01/10/2026, audit) — Supabase-js ne
      // lève pas d'exception sur un échec Postgrest, le try/catch seul ne
      // suffit pas : sans ce throw explicite, une écriture en échec passait
      // inaperçue (comptée "appeler" alors que rien n'a été persisté).
      const { error: updErr } = await sb.from("rappels_ordonnance").update({
        statut: "a_appeler",
        updated_at: new Date().toISOString(),
      }).eq("id", rappel.id);
      if (updErr) throw new Error(updErr.message);
      const { error: insErr } = await sb.from("rappels_evenements").insert({ rappel_id: rappel.id, type: "a_appeler" });
      if (insErr) throw new Error(insErr.message);
      return "appeler";
    } catch (e) {
      console.error(`[rappel] échec (mode appel) pour ${rappel.id}:`, (e as Error).message);
      return "failed";
    }
  }
  try {
    const newToken = generateShortToken();
    const pharmacieNom = (rappel as any).pharmacies?.nom || "votre pharmacie";
    const lien = buildRappelLien(appUrl, newToken);
    const message = buildRappelMessage(rappel.patient_prenom, rappel.patient_nom, lien, pharmacieNom, rappel.medecin_prescripteur, rappel.specialite);

    const result = await sendSms(rappel.patient_telephone, message, pharmacieNom);

    if (!result.success) {
      // Retry + escalade (01/10/2026) — un échec isolé reste "en_attente"
      // tel quel, ré-essayé tout seul au prochain passage (voir
      // SCAN_BATCH_SIZE plus haut sur la fréquence). Au bout de
      // SMS_ECHEC_MAX échecs D'AFFILÉE, probablement permanent (numéro
      // invalide...) : plutôt que de continuer à retenter en silence,
      // bascule en "à appeler" comme pour un numéro fixe.
      const echecs = (rappel.sms_echecs_consecutifs || 0) + 1;
      if (echecs >= SMS_ECHEC_MAX) {
        const { error: updErr } = await sb.from("rappels_ordonnance").update({
          statut: "a_appeler",
          sms_echecs_consecutifs: echecs,
          updated_at: new Date().toISOString(),
        }).eq("id", rappel.id);
        if (updErr) throw new Error(updErr.message);
        const { error: insErr } = await sb.from("rappels_evenements").insert({ rappel_id: rappel.id, type: "a_appeler", meta: { motif: "echec_envoi", echecs } });
        if (insErr) throw new Error(insErr.message);
      } else {
        const { error: updErr } = await sb.from("rappels_ordonnance").update({ sms_echecs_consecutifs: echecs }).eq("id", rappel.id);
        if (updErr) throw new Error(updErr.message);
        const { error: insErr } = await sb.from("rappels_evenements").insert({ rappel_id: rappel.id, type: "sms_echec", meta: { error: result.error || "inconnu", echecs } });
        if (insErr) throw new Error(insErr.message);
      }
      return "failed";
    }

    // Écriture critique (01/10/2026, audit) — si CE update échoue après un
    // SMS réellement envoyé, le patient reçoit un lien dont le token n'est
    // jamais enregistré en base (inutilisable côté resolve-rappel) sans que
    // rien ne le signale. Le throw fait retomber dans le catch ci-dessous :
    // compté "failed" (donc visible), et le rappel reste "en_attente" pour
    // être retenté au prochain passage plutôt que faussement marqué "sent".
    const { error: updErr } = await sb.from("rappels_ordonnance").update({
      statut: "sms_envoye",
      token: newToken,
      date_dernier_sms_envoye: new Date().toISOString(),
      sms_echecs_consecutifs: 0,
      updated_at: new Date().toISOString(),
    }).eq("id", rappel.id);
    if (updErr) throw new Error(updErr.message);
    const { error: insErr } = await sb.from("rappels_evenements").insert({ rappel_id: rappel.id, type: "sms_envoye", meta: { mocked: result.mocked } });
    if (insErr) throw new Error(insErr.message);
    return "sent";
  } catch (e) {
    console.error(`[rappel] échec pour ${rappel.id}:`, (e as Error).message);
    return "failed";
  }
}

// Traitement d'un groupe de 2+ rappels (03/10/2026, retour pharmacien) — un
// seul SMS pour tout le groupe, via le "porteur" (premier membre), dont le
// token est le seul à être régénéré et envoyé dans le lien. Un échec
// d'envoi est partagé par tout le groupe (même numéro, même raison
// probable) plutôt que de ne pénaliser que le porteur — pas de retry "par
// item" qui désynchroniserait le compteur d'échecs entre membres.
async function traiterGroupeRappels(sb: SupabaseClient, appUrl: string, groupe: any[]): Promise<Outcome[]> {
  const ids = groupe.map((r) => r.id);
  try {
    const porteur = groupe[0];
    const newToken = generateShortToken();
    const groupeId = crypto.randomUUID();
    const pharmacieNom = (porteur as any).pharmacies?.nom || "votre pharmacie";
    const lien = buildRappelLien(appUrl, newToken);
    const message = buildRappelMessageGroupe(porteur.patient_prenom, porteur.patient_nom, lien, pharmacieNom);

    const result = await sendSms(porteur.patient_telephone, message, pharmacieNom);

    if (!result.success) {
      const echecs = Math.max(...groupe.map((r) => r.sms_echecs_consecutifs || 0)) + 1;
      if (echecs >= SMS_ECHEC_MAX) {
        const { error: updErr } = await sb.from("rappels_ordonnance").update({
          statut: "a_appeler", sms_echecs_consecutifs: echecs, updated_at: new Date().toISOString(),
        }).in("id", ids);
        if (updErr) throw new Error(updErr.message);
        for (const id of ids) {
          const { error: insErr } = await sb.from("rappels_evenements").insert({ rappel_id: id, type: "a_appeler", meta: { motif: "echec_envoi", echecs, groupe: true } });
          if (insErr) throw new Error(insErr.message);
        }
      } else {
        const { error: updErr } = await sb.from("rappels_ordonnance").update({ sms_echecs_consecutifs: echecs }).in("id", ids);
        if (updErr) throw new Error(updErr.message);
        for (const id of ids) {
          const { error: insErr } = await sb.from("rappels_evenements").insert({ rappel_id: id, type: "sms_echec", meta: { error: result.error || "inconnu", echecs, groupe: true } });
          if (insErr) throw new Error(insErr.message);
        }
      }
      return groupe.map(() => "failed" as const);
    }

    // Porteur d'abord (04/10/2026, audit) : c'est lui qui reçoit le token du
    // lien déjà envoyé. S'il n'est pas enregistré, rien d'autre n'est modifié :
    // les autres membres restent en_attente et seront traités à part.
    const { error: updErrPorteur } = await sb.from("rappels_ordonnance").update({
      statut: "sms_envoye", token: newToken, groupe_id: groupeId, date_dernier_sms_envoye: new Date().toISOString(),
      sms_echecs_consecutifs: 0, updated_at: new Date().toISOString(),
    }).eq("id", porteur.id);
    if (updErrPorteur) throw new Error(updErrPorteur.message);
    const { error: insPorteur } = await sb.from("rappels_evenements").insert({ rappel_id: porteur.id, type: "sms_envoye", meta: { mocked: result.mocked, groupe: true, groupeTaille: groupe.length } });
    if (insPorteur) throw new Error(insPorteur.message);

    // Les autres membres suivent. Un échec ici ne remet pas en cause le lien
    // déjà envoyé : le porteur répond pour le groupe, et ces membres sont
    // signalés pour un traitement individuel.
    const outcomes: Outcome[] = [ "sent" ];
    for (const membre of groupe.slice(1)) {
      const { error: updErr } = await sb.from("rappels_ordonnance").update({
        statut: "sms_envoye", groupe_id: groupeId, date_dernier_sms_envoye: new Date().toISOString(),
        sms_echecs_consecutifs: 0, updated_at: new Date().toISOString(),
      }).eq("id", membre.id);
      if (updErr) {
        console.error(`[rappel] membre ${membre.id} non enregistré dans le groupe ${groupeId}:`, updErr.message);
        await reportAlert(sb, { source: "rappel-groupe", severity: "warning", message: "Membre de groupe non enregistré après envoi SMS", meta: { rappelId: membre.id, groupeId } });
        outcomes.push("failed");
        continue;
      }
      await sb.from("rappels_evenements").insert({ rappel_id: membre.id, type: "sms_envoye", meta: { mocked: result.mocked, groupe: true, groupeTaille: groupe.length } });
      outcomes.push("sent");
    }
    return outcomes;
  } catch (e) {
    console.error(`[rappel] échec groupe (${ids.join(",")}):`, (e as Error).message);
    return groupe.map(() => "failed" as const);
  }
}

// Filtre unique des rappels envoyables par SMS, partagé par le cron et l'envoi
// manuel : les deux doivent regrouper exactement les mêmes rappels.
export function appliquerFiltreStatutEnvoi(requete: any): any {
  return requete
    .eq("statut", "en_attente")
    .eq("consentement_sms", true)
    .is("supprime_le", null);
}

export function appliquerFiltreEnvoyable(requete: any, maintenant: string): any {
  return appliquerFiltreStatutEnvoi(requete).lte("date_prochaine_relance", maintenant);
}

export async function runRappelScan(sb: SupabaseClient, appUrl: string): Promise<RappelScanResult> {
  const { data: dus, error } = await appliquerFiltreEnvoyable(
    sb.from("rappels_ordonnance").select("id, pharmacie_id, patient_prenom, patient_nom, patient_telephone, medecin_prescripteur, specialite, mode_contact, date_prochaine_relance, sms_echecs_consecutifs, pharmacies(nom)"),
    new Date().toISOString(),
  )
    .order("pharmacie_id")
    .order("patient_telephone")
    .limit(SCAN_BATCH_SIZE);
  if (error) throw new Error(error.message);

  const lot = retirerGroupeIncomplet(dus || [], cleGroupeEnvoi, SCAN_BATCH_SIZE);
  const groupes = regrouperParTelephone(lot);
  const outcomesParGroupe = await mapWithConcurrency(groupes, RAPPEL_SCAN_CONCURRENCY, async (groupe): Promise<Outcome[]> => {
    if (groupe.length === 1) return [await traiterRappelIndividuel(sb, appUrl, groupe[0])];
    return traiterGroupeRappels(sb, appUrl, groupe);
  });
  const outcomes = outcomesParGroupe.flat();

  const sent = outcomes.filter((o) => o === "sent").length;
  const failed = outcomes.filter((o) => o === "failed").length;
  const appeler = outcomes.filter((o) => o === "appeler").length;
  return { scanned: lot.length, sent, failed, appeler };
}

// Relance puis escalade pour les rappels "sms_envoye" sans réponse
// (01/10/2026) — voir RELANCE_DELAI_JOURS/ESCALADE_DELAI_JOURS ci-dessus.
// Le token n'est PAS régénéré à la relance (contrairement à un nouveau
// cycle) : c'est le même lien, pour la même question, qu'un patient ayant
// gardé le premier SMS doit pouvoir encore utiliser.
export async function runRelanceEtEscaladeScan(sb: SupabaseClient, appUrl: string): Promise<RelanceScanResult> {
  const relanceAvant = new Date(Date.now() - RELANCE_DELAI_JOURS * 86400000).toISOString();
  const { data: aRelancer, error: errRelance } = await sb
    .from("rappels_ordonnance")
    .select("id, token, patient_prenom, patient_nom, patient_telephone, medecin_prescripteur, specialite, pharmacies(nom)")
    .eq("statut", "sms_envoye")
    .eq("relance_sms_envoyee", false)
    .is("supprime_le", null)
    .lte("date_dernier_sms_envoye", relanceAvant)
    .limit(SCAN_BATCH_SIZE);
  if (errRelance) throw new Error(errRelance.message);

  let relances = 0;
  await mapWithConcurrency(aRelancer || [], RAPPEL_SCAN_CONCURRENCY, async (rappel) => {
    try {
      const pharmacieNom = (rappel as any).pharmacies?.nom || "votre pharmacie";
      const lien = buildRappelLien(appUrl, rappel.token);
      const message = buildRappelMessage(rappel.patient_prenom, rappel.patient_nom, lien, pharmacieNom, rappel.medecin_prescripteur, rappel.specialite, true);
      const result = await sendSms(rappel.patient_telephone, message, pharmacieNom);
      if (!result.success) {
        const { error: insErr } = await sb.from("rappels_evenements").insert({ rappel_id: rappel.id, type: "sms_echec", meta: { error: result.error || "inconnu", relance: true } });
        if (insErr) throw new Error(insErr.message);
        return;
      }
      const { error: updErr } = await sb.from("rappels_ordonnance").update({
        relance_sms_envoyee: true,
        date_dernier_sms_envoye: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", rappel.id);
      if (updErr) throw new Error(updErr.message);
      const { error: insErr2 } = await sb.from("rappels_evenements").insert({ rappel_id: rappel.id, type: "relance_envoyee", meta: { mocked: result.mocked } });
      if (insErr2) throw new Error(insErr2.message);
      relances++;
    } catch (e) {
      console.error(`[rappel] échec relance pour ${rappel.id}:`, (e as Error).message);
    }
  });

  const escaladeAvant = new Date(Date.now() - ESCALADE_DELAI_JOURS * 86400000).toISOString();
  const { data: aEscalader, error: errEscalade } = await sb
    .from("rappels_ordonnance")
    .select("id")
    .eq("statut", "sms_envoye")
    .eq("relance_sms_envoyee", true)
    .is("supprime_le", null)
    .lte("date_dernier_sms_envoye", escaladeAvant)
    .limit(SCAN_BATCH_SIZE);
  if (errEscalade) throw new Error(errEscalade.message);

  let escalades = 0;
  await mapWithConcurrency(aEscalader || [], RAPPEL_SCAN_CONCURRENCY, async (rappel) => {
    try {
      const { error: updErr } = await sb.from("rappels_ordonnance").update({
        statut: "a_appeler",
        updated_at: new Date().toISOString(),
      }).eq("id", rappel.id);
      if (updErr) throw new Error(updErr.message);
      const { error: insErr } = await sb.from("rappels_evenements").insert({ rappel_id: rappel.id, type: "a_appeler", meta: { motif: "sans_reponse" } });
      if (insErr) throw new Error(insErr.message);
      escalades++;
    } catch (e) {
      console.error(`[rappel] échec escalade pour ${rappel.id}:`, (e as Error).message);
    }
  });

  return { relances, escalades };
}

// Garde-fou de suppression d'un rappel (04/10/2026, audit RGPD). Une fois le
// patient intervenu (réponse, opposition) ou le cycle terminé, la ligne est
// une preuve : on ne la retire pas de la base, on refuse. Le pharmacien doit
// passer par "Fin de traitement" dans ce cas.
export function canSupprimerRappel(rappel: { statut: string; choix_patient: string | null; opt_out?: boolean | null }): { ok: true } | { ok: false; error: string } {
  if (rappel.opt_out) return { ok: false, error: "Ce patient a demandé à ne plus être recontacté : le rappel ne peut pas être supprimé" };
  if (rappel.choix_patient) return { ok: false, error: "Le patient a déjà répondu : utilisez « Fin de traitement » au lieu de supprimer" };
  if (rappel.statut === "termine") return { ok: false, error: "Ce rappel est terminé : il ne peut pas être supprimé" };
  return { ok: true };
}

// Membres d'un groupe concernés par une réponse ou une préparation (04/10/2026,
// audit). Un groupe ne doit jamais s'étendre à une autre pharmacie, ni à un
// rappel en opposition ; les autres membres ne sont retenus que s'ils portent
// le même groupe et la même pharmacie que le porteur.
export function membresActifsDuGroupe<T extends { pharmacie_id: string; opt_out?: boolean | null }>(porteur: { pharmacie_id: string }, membres: T[]): T[] {
  return membres.filter((m) => m.pharmacie_id === porteur.pharmacie_id && !m.opt_out);
}

// Un rappel accepte une réponse tant qu'il attend le patient, ou qu'il a été
// escaladé sans réponse (et sans choix déjà connu). Extrait de resolve-rappel
// (04/10/2026) pour être testé unitairement.
export function peutEncoreRepondre(rappel: { statut: string; choix_patient: string | null }): boolean {
  return rappel.statut === "sms_envoye" || (rappel.statut === "a_appeler" && !rappel.choix_patient);
}

// Retire le dernier groupe d'un lot plein, s'il pourrait être coupé par la limite
// (04/10/2026, audit). Ce groupe sera traité en entier au passage suivant, car
// les rappels déjà envoyés sortent de l'ensemble "en_attente". Un lot entièrement
// composé d'un seul groupe est conservé tel quel.
export function retirerGroupeIncomplet<T>(rows: T[], cle: (r: T) => string, limite: number): T[] {
  if (rows.length < limite) return rows;
  const derniereCle = cle(rows[rows.length - 1]);
  let i = rows.length;
  while (i > 0 && cle(rows[i - 1]) === derniereCle) i--;
  return i === 0 ? rows : rows.slice(0, i);
}
