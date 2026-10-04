// Logique des actions rappels appelées par secure-data et resolve-rappel
// (04/10/2026, pour être testée). Le client Supabase et les dépendances
// non déterministes (casier, token) sont injectés. Chaque fonction renvoie
// { status, body } ; l'appelant construit la Response.
import { canSupprimerRappel, membresActifsDuGroupe, peutEncoreRepondre } from "./rappelLogic.ts";

export type Reponse = { status: number; body: Record<string, unknown> };
const erreur = (status: number, message: string): Reponse => ({ status, body: { error: message } });

export interface ContexteSuppression {
  pharmacieId: string | null;
  vendeurSub: string | null;
  callerUserId: string | null;
  rappelId: string | undefined;
}

export async function supprimerRappelAction(sb: any, ctx: ContexteSuppression): Promise<Reponse> {
  if (!ctx.pharmacieId) return erreur(403, "Réservé aux comptes pharmacie");
  if (!ctx.rappelId) return erreur(400, "rappelId requis");
  const { data: existing } = await sb.from("rappels_ordonnance")
    .select("id, pharmacie_id, statut, choix_patient, opt_out, consentement_sms_horodatage")
    .eq("id", ctx.rappelId).is("supprime_le", null).maybeSingle();
  if (!existing || existing.pharmacie_id !== ctx.pharmacieId) return erreur(404, "Rappel introuvable");
  const garde = canSupprimerRappel(existing);
  if (!garde.ok) return erreur(409, garde.error);
  const maintenant = new Date().toISOString();
  const { error } = await sb.from("rappels_ordonnance").update({ supprime_le: maintenant, updated_at: maintenant }).eq("id", ctx.rappelId);
  if (error) throw new Error(error.message);
  const { error: auditErr } = await sb.from("audit_logs").insert({
    pharmacie_id: ctx.pharmacieId,
    user_id: ctx.vendeurSub || ctx.callerUserId || null,
    user_role: ctx.vendeurSub ? "vendeur" : "titulaire",
    action: "delete_rappel",
    metadata: { rappel_id: ctx.rappelId, statut: existing.statut, consentement_sms_horodatage: existing.consentement_sms_horodatage, supprime_le: maintenant },
  });
  if (auditErr) throw new Error(auditErr.message);
  return { status: 200, body: { data: { success: true } } };
}

export interface ContextePreparation {
  pharmacieId: string | null;
  rappelId: string | undefined;
  // Incrément atomique du compteur de casiers (rpc increment_rappel_case_compteur).
  incrementerCompteur: (pharmacieId: string) => Promise<{ numero: number | null; error: string | null }>;
  prefixe: () => string;
}

export async function preparerRappelAction(sb: any, ctx: ContextePreparation): Promise<Reponse> {
  if (!ctx.pharmacieId) return erreur(403, "Réservé aux comptes pharmacie");
  if (!ctx.rappelId) return erreur(400, "rappelId requis");
  const { data: existing } = await sb.from("rappels_ordonnance")
    .select("id, pharmacie_id, statut, choix_patient, groupe_id").eq("id", ctx.rappelId).maybeSingle();
  if (!existing || existing.pharmacie_id !== ctx.pharmacieId) return erreur(404, "Rappel introuvable");
  if (existing.statut !== "a_traiter") return erreur(409, "Ce rappel n'est pas à traiter");
  if (existing.choix_patient !== "tout_renouveler" && existing.choix_patient !== "partiel") {
    return erreur(409, "Seuls les renouvellements (total ou partiel) passent par l'étape préparation");
  }
  let idsAPreparer = [ctx.rappelId];
  if (existing.groupe_id) {
    const { data: membres } = await sb.from("rappels_ordonnance").select("id, pharmacie_id, opt_out")
      .eq("groupe_id", existing.groupe_id).eq("statut", "a_traiter").in("choix_patient", ["tout_renouveler", "partiel"]);
    const actifs = membresActifsDuGroupe<any>({ pharmacie_id: ctx.pharmacieId }, membres || []);
    if (actifs.length) idsAPreparer = actifs.map((m: { id: string }) => m.id);
  }
  const { numero, error: compteurError } = await ctx.incrementerCompteur(ctx.pharmacieId);
  if (compteurError || numero == null) throw new Error(compteurError || "Échec de l'attribution du casier");
  const caseCode = `${ctx.prefixe()}${String(numero).padStart(2, "0")}`;
  const { error } = await sb.from("rappels_ordonnance").update({ statut: "prepare", case_code: caseCode, date_preparee: new Date().toISOString(), updated_at: new Date().toISOString() }).in("id", idsAPreparer);
  if (error) throw new Error(error.message);
  for (const id of idsAPreparer) {
    await sb.from("rappels_evenements").insert({ rappel_id: id, type: "prepare", meta: { caseCode, ...(idsAPreparer.length > 1 ? { groupe: true } : {}) } });
  }
  return { status: 200, body: { data: { success: true, caseCode, nombreOrdonnances: idsAPreparer.length } } };
}

export const CHOIX_VALIDES = ["tout_renouveler", "rien", "partiel", "stop"];

export async function repondreRappelAction(sb: any, args: { token: string; choix: string; creneau?: string | null }): Promise<Reponse> {
  const { token, choix, creneau } = args;
  const { data: rappel } = await sb.from("rappels_ordonnance")
    .select("id, statut, choix_patient, groupe_id, pharmacie_id, opt_out")
    .eq("token", token).is("supprime_le", null).maybeSingle();
  if (!rappel) return erreur(404, "Lien inconnu ou expiré");
  if (!peutEncoreRepondre(rappel)) return erreur(409, "Ce rappel a déjà reçu une réponse");

  let membres: any[] = [rappel];
  if (rappel.groupe_id) {
    const { data: tous } = await sb.from("rappels_ordonnance").select("id, statut, choix_patient, pharmacie_id, opt_out")
      .eq("groupe_id", rappel.groupe_id).is("supprime_le", null);
    if (tous?.length) membres = membresActifsDuGroupe<any>(rappel, tous as any[]).filter((m: any) => peutEncoreRepondre(m));
  }
  const statutSuivant = choix === "partiel" ? "a_appeler" : "a_traiter";
  const ids = membres.map((m) => m.id);
  const { error } = await sb.from("rappels_ordonnance").update({
    statut: statutSuivant, choix_patient: choix,
    creneau_retrait: choix === "stop" ? null : (creneau || null),
    opt_out: choix === "stop", date_reponse_patient: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).in("id", ids);
  if (error) throw new Error(error.message);
  for (const membre of membres) {
    await sb.from("rappels_evenements").insert({ rappel_id: membre.id, type: "reponse_patient", meta: { choix, ...(creneau ? { creneau } : {}), ...(membre.statut === "a_appeler" ? { apres_escalade: true } : {}), ...(rappel.groupe_id ? { groupe: true } : {}) } });
  }
  return { status: 200, body: { data: { success: true } } };
}
