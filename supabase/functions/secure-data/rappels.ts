import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveCaller } from "../_shared/resolveCaller.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { validateFile } from "../_shared/upload-validation.ts";
import { isTiff, convertTiffToPng } from "../_shared/tiffConvert.ts";
import { signToken } from "../_shared/jwt.ts";
import { planHasFeature } from "../_shared/planFeatures.ts";
import { reportAlert } from "../_shared/alert.ts";
import { resolveAppOrigin } from "../_shared/checkout.ts";
import { sendSms } from "../_shared/sms.ts";
import { sendTransactionalEmail } from "../_shared/email.ts";
import { generateShortToken } from "../_shared/shortToken.ts";
import { appliquerFiltreStatutEnvoi, buildRappelLien, buildRappelMessage, buildRappelMessageGroupe, mergeCommentairePartiel, regrouperParTelephone } from "../_shared/rappelLogic.ts";
import { supprimerRappelAction, preparerRappelAction } from "../_shared/rappelHandlers.ts";
import { computeRappelsStats } from "../_shared/rappelsStatsLogic.ts";
import { estNumeroFixe } from "../_shared/telephone.ts";
import { getSmsConsommation } from "../_shared/smsQuota.ts";
import { escapeHtml } from "../_shared/html.ts";
import { safeErrorMessage } from "../_shared/errors.ts";
import type { ContexteSecureData } from "./contexte.ts";

export async function handle_rappels(ctx: ContexteSecureData): Promise<Response | null> {
  const { req, sb, supabaseUrl, serviceKey, jwtSecret, pharmacieId, vendeurSub, callerUserId, resource, params, CORS } = ctx;
    // ── Rappels de renouvellement d'ordonnance (04/09/2026) ─────────────────
    // Voir migration 20260904_rappels_ordonnance.sql pour le cycle de statut
    // et _shared/rappelLogic.ts pour le scan cron qui fait avancer en_attente
    // → sms_envoye (resolve-rappel fait ensuite avancer → a_traiter côté
    // patient). Ici : création par le pharmacien, liste, et les deux actions
    // qui referment un cycle ("valider" relance à J+21, "fin de traitement"
    // arrête définitivement).
    if (resource === "rappels_create") {
      if (!pharmacieId) {
        return new Response(JSON.stringify({ error: "Réservé aux comptes pharmacie" }), { status: 403, headers: CORS });
      }
      // Fonctionnalité réservée au plan Performance (05/09/2026, chantier
      // tarification) — jusqu'ici disponible sans restriction sur tous les
      // plans. Contrôle explicite ici (même schéma que offre_template_toggle
      // ci-dessus) : la table rappels_ordonnance n'est accessible en écriture
      // que via cette fonction (clé de service), aucune policy RLS ne peut
      // donc porter cette restriction côté client.
      const { data: ph } = await sb.from("pharmacies").select("plan, nom").eq("id", pharmacieId).maybeSingle();
      if (!(await planHasFeature(sb, ph?.plan || "starter", "rappels"))) {
        return new Response(JSON.stringify({ error: "Les rappels de renouvellement sont réservés au plan Performance. Passez à un plan supérieur pour en créer." }), { status: 403, headers: CORS });
      }
      const { nom, prenom, telephone, commentaire, consentement, dateRappel, medecinPrescripteur, specialite, ordonnanceId } = params || {};
      if (!nom?.trim() || !prenom?.trim() || !telephone?.trim()) {
        return new Response(JSON.stringify({ error: "nom, prénom et téléphone requis" }), { status: 400, headers: CORS });
      }
      // Mode de contact (01/10/2026, retour titulaire) — plus de choix
      // manuel à la création : un patient âgé sans mobile ne recevra jamais
      // le SMS, entièrement auto-détecté par préfixe du numéro (voir
      // _shared/telephone.ts), jamais une valeur fournie par le client.
      const modeContactFinal = estNumeroFixe(telephone) ? "appel" : "sms";
      // Lien vers l'ordonnance d'origine (26/09/2026) — optionnel, jamais fait
      // confiance sans vérification : un ordonnanceId fourni par le client
      // doit appartenir à CETTE pharmacie, sinon silencieusement ignoré (pas
      // une erreur bloquante — un id invalide/périmé ne doit pas empêcher la
      // création du rappel lui-même).
      let verifiedOrdonnanceId: string | null = null;
      if (ordonnanceId) {
        const { data: ordo } = await sb.from("ordonnances").select("id").eq("id", ordonnanceId).eq("pharmacie_id", pharmacieId).maybeSingle();
        if (ordo) verifiedOrdonnanceId = ordo.id;
      }
      // Consentement du patient à être recontacté — obligatoire, jamais un
      // défaut supposé sur une donnée de santé (même logique que
      // retention_settings). Revérifié côté cron (rappelLogic.ts) en défense
      // en profondeur.
      if (!consentement) {
        return new Response(JSON.stringify({ error: "Le consentement du patient à être recontacté est requis" }), { status: 400, headers: CORS });
      }
      // Date de rappel modifiable (04/09/2026) — J+21 par défaut, calculé et
      // pré-rempli côté UI (RappelForm), mais le pharmacien peut l'ajuster
      // (ex. renouvellement connu pour une date précise). Un point dans le
      // passé n'a pas de sens (le cron le traiterait dès le prochain scan
      // sans que ce soit voulu) — seule contrainte : pas avant aujourd'hui.
      let dateProchaineRelance: string | undefined;
      if (dateRappel) {
        const parsed = new Date(dateRappel);
        if (Number.isNaN(parsed.getTime())) {
          return new Response(JSON.stringify({ error: "Date de rappel invalide" }), { status: 400, headers: CORS });
        }
        const today = new Date(); today.setHours(0, 0, 0, 0);
        if (parsed < today) {
          return new Response(JSON.stringify({ error: "La date de rappel ne peut pas être dans le passé" }), { status: 400, headers: CORS });
        }
        dateProchaineRelance = parsed.toISOString();
      }
      const { data, error } = await sb.from("rappels_ordonnance").insert({
        pharmacie_id: pharmacieId,
        patient_nom: nom.trim(),
        patient_prenom: prenom.trim(),
        patient_telephone: telephone.trim(),
        commentaire: commentaire?.trim() || null,
        medecin_prescripteur: medecinPrescripteur?.trim() || null,
        specialite: specialite?.trim() || null,
        consentement_sms: true,
        // @fix 24/09/2026 (audit RGPD) — horodatage du recueil du consentement,
        // pour pouvoir le démontrer en cas de contestation (art. 7(1)) — voir
        // migration 20260924_consentement_sms_horodatage.sql.
        consentement_sms_horodatage: new Date().toISOString(),
        token: generateShortToken(),
        ordonnance_id: verifiedOrdonnanceId,
        mode_contact: modeContactFinal,
        ...(dateProchaineRelance ? { date_prochaine_relance: dateProchaineRelance } : {}),
      }).select().single();
      if (error) throw new Error(error.message);
      await sb.from("rappels_evenements").insert({ rappel_id: data.id, type: "cree" });
      // Notification backoffice (22/09/2026, demande titulaire) — visibilité
      // sur l'activité réseau en direct. severity:"info" pour ne jamais
      // déclencher le webhook sortant de reportAlert (réservé aux vraies
      // pannes).
      await reportAlert(sb, {
        source: "secure-data", severity: "info",
        message: `Nouveau rappel créé — ${ph?.nom || pharmacieId} (${nom.trim()} ${prenom.trim()})`,
        meta: { pharmacieId, rappelId: data.id },
      });
      return new Response(JSON.stringify({ data }), { headers: CORS });
    }

    // Enregistrer le choix du patient après un appel téléphonique (30/09/2026)
    // — pendant du POST anonyme de resolve-rappel (lien SMS), mais déclenché
    // ici par le pharmacien lui-même pour un rappel en mode "appel" (patient
    // sans mobile). Même effet final que resolve-rappel (statut "a_traiter",
    // choix_patient, date_reponse_patient) pour rejoindre exactement le même
    // circuit en aval, seul le déclencheur et le garde-fou de statut diffèrent
    // (ici "a_appeler", pas "sms_envoye").
    if (resource === "rappels_enregistrer_appel") {
      if (!pharmacieId) {
        return new Response(JSON.stringify({ error: "Réservé aux comptes pharmacie" }), { status: 403, headers: CORS });
      }
      const { rappelId, choix, detailPartiel } = params || {};
      // "stop" (01/10/2026, audit RGPD) — même canal d'opposition que
      // resolve-rappel, pour un patient qui le demande pendant l'appel.
      const CHOIX_VALIDES = new Set(["tout_renouveler", "rien", "partiel", "stop"]);
      if (!rappelId || !CHOIX_VALIDES.has(choix)) {
        return new Response(JSON.stringify({ error: "rappelId et choix (tout_renouveler|rien|partiel|stop) requis" }), { status: 400, headers: CORS });
      }
      // Détail du renouvellement partiel (01/10/2026, retour titulaire) —
      // "partiel" seul ne dit pas QUELS médicaments ; exigé ici puisque
      // l'appel vient justement d'avoir lieu pour le savoir. Ajouté au
      // commentaire existant (pas de colonne dédiée, déjà affiché sur la
      // carte et dans "Modifier") plutôt que de l'écraser.
      if (choix === "partiel" && !detailPartiel?.trim()) {
        return new Response(JSON.stringify({ error: "Précisez quels médicaments renouveler." }), { status: 400, headers: CORS });
      }
      const { data: rappel } = await sb.from("rappels_ordonnance").select("id, pharmacie_id, statut, commentaire").eq("id", rappelId).maybeSingle();
      if (!rappel || rappel.pharmacie_id !== pharmacieId) {
        return new Response(JSON.stringify({ error: "Rappel introuvable" }), { status: 404, headers: CORS });
      }
      if (rappel.statut !== "a_appeler") {
        return new Response(JSON.stringify({ error: "Ce rappel n'est pas en attente d'appel" }), { status: 409, headers: CORS });
      }
      // "stop" passe par "à traiter" comme les autres choix (01/10/2026,
      // demande titulaire), pas directement "terminé" — voir resolve-rappel
      // pour la justification complète (visibilité + clôture explicite).
      const patch: Record<string, unknown> = {
        statut: "a_traiter",
        choix_patient: choix,
        opt_out: choix === "stop",
        date_reponse_patient: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      if (choix === "partiel") {
        patch.commentaire = mergeCommentairePartiel(rappel.commentaire, detailPartiel);
      }
      const { error: updErr } = await sb.from("rappels_ordonnance").update(patch).eq("id", rappelId);
      if (updErr) throw new Error(updErr.message);
      await sb.from("rappels_evenements").insert({ rappel_id: rappelId, type: "reponse_patient", meta: { choix, canal: "appel" } });
      // commentaire renvoyé SEULEMENT s'il a changé (01/10/2026, audit
      // architecture) — le client n'a plus besoin de recalculer la fusion
      // lui-même à partir d'un état local potentiellement périmé (édition
      // concurrente depuis un autre poste), et ignore ce champ absent pour
      // tout autre choix que "partiel".
      return new Response(JSON.stringify({ data: { success: true, ...(patch.commentaire ? { commentaire: patch.commentaire } : {}) } }), { headers: CORS });
    }

    // Confirmer l'appel de clarification d'un renouvellement partiel
    // (01/10/2026, retour titulaire) — un patient qui répond "partiel" via
    // le lien SMS n'a précisé AUCUN médicament (choix_patient="partiel" déjà
    // enregistré par resolve-rappel, statut déjà "a_appeler") : contrairement
    // à rappels_enregistrer_appel ci-dessus, le choix n'est pas à ressaisir,
    // seulement à confirmer que l'appel a eu lieu pour passer à "à traiter".
    if (resource === "rappels_confirmer_appel_partiel") {
      if (!pharmacieId) {
        return new Response(JSON.stringify({ error: "Réservé aux comptes pharmacie" }), { status: 403, headers: CORS });
      }
      const { rappelId, detailPartiel } = params || {};
      if (!rappelId) {
        return new Response(JSON.stringify({ error: "rappelId requis" }), { status: 400, headers: CORS });
      }
      // Détail du renouvellement partiel (01/10/2026, retour titulaire) —
      // même exigence que rappels_enregistrer_appel : l'appel de clarification
      // ne sert à rien si quels médicaments renouveler ne finit nulle part.
      if (!detailPartiel?.trim()) {
        return new Response(JSON.stringify({ error: "Précisez quels médicaments renouveler." }), { status: 400, headers: CORS });
      }
      const { data: rappel } = await sb.from("rappels_ordonnance").select("id, pharmacie_id, statut, choix_patient, commentaire").eq("id", rappelId).maybeSingle();
      if (!rappel || rappel.pharmacie_id !== pharmacieId) {
        return new Response(JSON.stringify({ error: "Rappel introuvable" }), { status: 404, headers: CORS });
      }
      if (rappel.statut !== "a_appeler" || rappel.choix_patient !== "partiel") {
        return new Response(JSON.stringify({ error: "Ce rappel n'est pas en attente d'un appel de clarification" }), { status: 409, headers: CORS });
      }
      const commentaireFinal = mergeCommentairePartiel(rappel.commentaire, detailPartiel);
      const { error: updErr } = await sb.from("rappels_ordonnance").update({
        statut: "a_traiter",
        commentaire: commentaireFinal,
        updated_at: new Date().toISOString(),
      }).eq("id", rappelId);
      if (updErr) throw new Error(updErr.message);
      await sb.from("rappels_evenements").insert({ rappel_id: rappelId, type: "appel_effectue" });
      return new Response(JSON.stringify({ data: { success: true, commentaire: commentaireFinal } }), { headers: CORS });
    }

    // Fichier de l'ordonnance liée à un rappel (26/09/2026) — donne accès en
    // un clic à l'ordonnance depuis la liste des rappels, sans exposer un
    // resource générique "ordonnance par id" (surface d'attaque plus large
    // qu'utile ici : on ne veut QUE le fichier lié à un rappel qu'on sait déjà
    // appartenir à l'appelant). Revérifie l'appartenance du rappel ET de
    // l'ordonnance à pharmacieId, même si l'ordonnance a déjà été vérifiée à
    // la création (défense en profondeur, cohérent avec le reste du fichier).
    if (resource === "rappels_ordonnance_fichier") {
      if (!pharmacieId) {
        return new Response(JSON.stringify({ error: "Réservé aux comptes pharmacie" }), { status: 403, headers: CORS });
      }
      const { rappelId } = params || {};
      if (!rappelId) {
        return new Response(JSON.stringify({ error: "rappelId requis" }), { status: 400, headers: CORS });
      }
      const { data: rappel } = await sb.from("rappels_ordonnance").select("pharmacie_id, ordonnance_id").eq("id", rappelId).maybeSingle();
      if (!rappel || rappel.pharmacie_id !== pharmacieId) {
        return new Response(JSON.stringify({ error: "Rappel introuvable" }), { status: 404, headers: CORS });
      }
      if (!rappel.ordonnance_id) {
        return new Response(JSON.stringify({ data: null }), { headers: CORS });
      }
      const { data: ordo } = await sb.from("ordonnances")
        .select("fichier_url, fichier_nom, fichier_type")
        .eq("id", rappel.ordonnance_id).eq("pharmacie_id", pharmacieId).maybeSingle();
      if (!ordo?.fichier_url) {
        return new Response(JSON.stringify({ data: null }), { headers: CORS });
      }
      // @fix 28/09/2026 — l'URL signée est générée ICI (clé de service),
      // pas laissée au client via sb.storage.createSignedUrl() : la policy
      // storage.objects (users_own_files) exige get_user_pharmacie_id(), qui
      // dépend de auth.uid() et vaut toujours NULL pour un poste vendeur
      // (jeton interne signé, jamais de vraie session Supabase Auth) — un
      // vendeur ne pouvait donc jamais générer sa propre URL signée pour un
      // fichier de sa propre pharmacie. En la générant ici avec la clé de
      // service (bypass RLS, appartenance déjà vérifiée ci-dessus), la popup
      // fonctionne aussi bien pour un vendeur que pour le titulaire.
      const { data: signed } = await sb.storage.from("ordonnances-files").createSignedUrl(ordo.fichier_url, 300);
      return new Response(JSON.stringify({
        data: { name: ordo.fichier_nom || "ordonnance", type: ordo.fichier_type || "image", signedUrl: signed?.signedUrl || null },
      }), { headers: CORS });
    }

    if (resource === "rappels_list") {
      if (!pharmacieId) {
        return new Response(JSON.stringify({ error: "Réservé aux comptes pharmacie" }), { status: 403, headers: CORS });
      }
      let q = sb.from("rappels_ordonnance").select("*").eq("pharmacie_id", pharmacieId).is("supprime_le", null);
      if (params?.statut) q = q.eq("statut", params.statut);
      q = q.order("created_at", { ascending: false }).limit(params?.limit || 200);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return new Response(JSON.stringify({ data }), { headers: CORS });
    }

    // Statistiques d'efficacité des rappels, côté pharmacien (08/09/2026) —
    // deux métriques que l'admin n'a pas : le taux de RENOUVELLEMENT réel
    // (tout_renouveler + partiel, pas juste "a répondu") et le délai de
    // réponse moyen — plus parlantes pour un titulaire que le simple taux de
    // réponse.
    //
    // Contrairement à admin_rappels_metrics (secure-data-admin), qui exclut
    // les envois de test par email pour ne jamais fausser une projection de
    // COÛT SMS, cette action compte les deux canaux (retour direct du
    // 08/09/2026) : le sender SMS OVH est encore en attente de modération,
    // donc tous les envois réels passent aujourd'hui par le canal email —
    // exclure ce canal ici viderait le tableau de bord. À revoir une fois le
    // SMS validé, si l'email de test doit alors redevenir un canal à part.
    if (resource === "rappels_stats") {
      if (!pharmacieId) {
        return new Response(JSON.stringify({ error: "Réservé aux comptes pharmacie" }), { status: 403, headers: CORS });
      }
      const since90 = new Date(Date.now() - 90 * 86400000).toISOString();
      const { data: rappels } = await sb.from("rappels_ordonnance").select("id, statut").eq("pharmacie_id", pharmacieId).is("supprime_le", null);
      const rappelIds = (rappels || []).map((r) => r.id);
      const { data: evenements } = rappelIds.length
        ? await sb.from("rappels_evenements").select("rappel_id, type, meta, created_at").in("rappel_id", rappelIds).gte("created_at", since90)
        : { data: [] as any[] };

      // Calcul extrait en fonction pure testable (01/10/2026, audit DevOps)
      // — voir _shared/rappelsStatsLogic.ts et son fichier de test.
      const data = computeRappelsStats(rappels || [], evenements || []);
      return new Response(JSON.stringify({ data }), { headers: CORS });
    }

    // Historique détaillé d'un rappel (07/09/2026) — rappels_evenements
    // journalise déjà tout (cree/sms_envoye/sms_echec/reponse_patient/traite/
    // termine/reactive, voir les actions ci-dessous) mais la table n'accorde
    // aucun accès direct à anon/authenticated : jusqu'ici rien n'exposait
    // cette donnée au pharmacien, qui ne voyait que le statut courant.
    if (resource === "rappels_journal") {
      if (!pharmacieId) {
        return new Response(JSON.stringify({ error: "Réservé aux comptes pharmacie" }), { status: 403, headers: CORS });
      }
      const { rappelId } = params || {};
      if (!rappelId) {
        return new Response(JSON.stringify({ error: "rappelId requis" }), { status: 400, headers: CORS });
      }
      const { data: rappel } = await sb.from("rappels_ordonnance").select("id, pharmacie_id").eq("id", rappelId).maybeSingle();
      if (!rappel || rappel.pharmacie_id !== pharmacieId) {
        return new Response(JSON.stringify({ error: "Rappel introuvable" }), { status: 404, headers: CORS });
      }
      const { data, error } = await sb.from("rappels_evenements")
        .select("type, meta, created_at")
        .eq("rappel_id", rappelId)
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return new Response(JSON.stringify({ data }), { headers: CORS });
    }

    // Le pharmacien valide un rappel "à traiter" (quel que soit le choix du
    // patient) : le cycle repart à J+21, comme demandé ("jusqu'à ce que le
    // pharmacien mette fin au rappel").
    // Marque un rappel "préparé" (26/09/2026) — le pharmacien a préparé le
    // médicament et l'a rangé dans un casier physique, avant que le patient
    // ne vienne le retirer. Ne concerne QUE les renouvellements réels
    // (tout_renouveler/partiel) — "rien" n'a rien à préparer et continue
    // d'aller directement de a_traiter à rappels_traiter, inchangé.
    if (resource === "rappels_preparer") {
      const { rappelId } = params || {};
      const LETTRES_CASE = "ABCDEFGHJKLMNPQRSTUVWXYZ";
      const r = await preparerRappelAction(sb, {
        pharmacieId,
        rappelId,
        incrementerCompteur: async (pid: string) => {
          const { data, error } = await sb.rpc("increment_rappel_case_compteur", { p_pharmacie_id: pid });
          return { numero: data as number | null, error: error?.message ?? null };
        },
        prefixe: () => Array.from({ length: 2 }, () => LETTRES_CASE[Math.floor(Math.random() * LETTRES_CASE.length)]).join(""),
      });
      return new Response(JSON.stringify(r.body), { status: r.status, headers: CORS });
    }

    if (resource === "rappels_traiter") {
      if (!pharmacieId) {
        return new Response(JSON.stringify({ error: "Réservé aux comptes pharmacie" }), { status: 403, headers: CORS });
      }
      const { rappelId, dateRappel } = params || {};
      if (!rappelId) {
        return new Response(JSON.stringify({ error: "rappelId requis" }), { status: 400, headers: CORS });
      }
      const { data: existing } = await sb.from("rappels_ordonnance").select("id, pharmacie_id, statut, cycle_numero, choix_patient").eq("id", rappelId).maybeSingle();
      if (!existing || existing.pharmacie_id !== pharmacieId) {
        return new Response(JSON.stringify({ error: "Rappel introuvable" }), { status: 404, headers: CORS });
      }
      // @fix 26/09/2026 — un renouvellement réel (tout_renouveler/partiel)
      // doit d'abord être passé par l'étape "préparé" (rappels_preparer) ;
      // "rien" continue de valider directement depuis "a_traiter", rien à
      // préparer dans ce cas.
      const requiertPreparation = existing.choix_patient === "tout_renouveler" || existing.choix_patient === "partiel";
      const statutAttendu = requiertPreparation ? "prepare" : "a_traiter";
      if (existing.statut !== statutAttendu) {
        return new Response(JSON.stringify({
          error: requiertPreparation ? "Ce rappel doit d'abord être marqué comme préparé" : "Ce rappel n'est pas à traiter",
        }), { status: 409, headers: CORS });
      }
      // Prochaine date de rappel (04/09/2026) — le pharmacien peut l'ajuster
      // dans la popup de confirmation (voir RappelsSection.jsx:ValiderModal),
      // sinon un défaut selon le choix du patient : J+21 pour un
      // renouvellement (total ou partiel), ou un écart croissant à chaque
      // refus successif (numéro de CYCLE ACTUEL, avant incrémentation, ×31
      // jours + 21) pour "ne rien prendre" — un patient qui décline
      // plusieurs fois de suite n'a pas besoin d'être rappelé aussi souvent.
      let dateProchaineRelance: string;
      if (dateRappel) {
        const parsed = new Date(dateRappel);
        if (Number.isNaN(parsed.getTime())) {
          return new Response(JSON.stringify({ error: "Date de rappel invalide" }), { status: 400, headers: CORS });
        }
        const today = new Date(); today.setHours(0, 0, 0, 0);
        if (parsed < today) {
          return new Response(JSON.stringify({ error: "La date de rappel ne peut pas être dans le passé" }), { status: 400, headers: CORS });
        }
        dateProchaineRelance = parsed.toISOString();
      } else {
        const joursOffset = existing.choix_patient === "rien" ? existing.cycle_numero * 31 + 21 : 21;
        dateProchaineRelance = new Date(Date.now() + joursOffset * 86400000).toISOString();
      }
      const { error } = await sb.from("rappels_ordonnance").update({
        statut: "en_attente",
        choix_patient: null,
        cycle_numero: existing.cycle_numero + 1,
        date_prochaine_relance: dateProchaineRelance,
        date_traite: new Date().toISOString(),
        // Casier libéré (26/09/2026) — le médicament vient d'être retiré,
        // le repère de l'ancien cycle n'a plus lieu d'être affiché.
        case_code: null,
        // Nouveau cycle : le groupe du cycle précédent ne s'applique plus.
        groupe_id: null,
        // Nouveau cycle = nouvelle chance de répondre au premier SMS
        // (01/10/2026) — sinon un rappel réactivé hériterait du flag de
        // l'ancien cycle et sauterait directement la relance. Même principe
        // pour le compteur d'échecs d'envoi (voir 20261001_rappels_retry_sms.sql)
        // — un échec d'il y a 3 cycles ne doit pas compter pour celui-ci.
        relance_sms_envoyee: false,
        sms_echecs_consecutifs: 0,
        // Rotation du token (01/10/2026, audit sécurité) — `token` n'était
        // jamais régénéré ici : un ancien lien SMS (cycle précédent, déjà
        // répondu) restait valide pour peutEncoreRepondre() dès que CE
        // nouveau cycle retombait en "à appeler" sans choix connu, permettant
        // à quiconque a accès à l'ancien SMS (numéro réattribué, téléphone
        // partagé) de répondre à la place du patient sur le mauvais cycle.
        // `token` est NOT NULL (voir 20260904_rappels_short_token.sql) : on
        // le fait pivoter plutôt que de l'effacer — le prochain envoi réel
        // (runRappelScan/rappels_envoyer_test) le régénère de toute façon.
        token: generateShortToken(),
        updated_at: new Date().toISOString(),
      }).eq("id", rappelId);
      if (error) throw new Error(error.message);
      await sb.from("rappels_evenements").insert({ rappel_id: rappelId, type: "traite" });
      return new Response(JSON.stringify({ data: { success: true } }), { headers: CORS });
    }

    // Fin de traitement définitive — arrête les relances, quel que soit le
    // statut courant (le pharmacien peut décider d'arrêter à tout moment).
    if (resource === "rappels_terminer") {
      if (!pharmacieId) {
        return new Response(JSON.stringify({ error: "Réservé aux comptes pharmacie" }), { status: 403, headers: CORS });
      }
      const { rappelId } = params || {};
      if (!rappelId) {
        return new Response(JSON.stringify({ error: "rappelId requis" }), { status: 400, headers: CORS });
      }
      const { data: existing } = await sb.from("rappels_ordonnance").select("id, pharmacie_id").eq("id", rappelId).maybeSingle();
      if (!existing || existing.pharmacie_id !== pharmacieId) {
        return new Response(JSON.stringify({ error: "Rappel introuvable" }), { status: 404, headers: CORS });
      }
      const { error } = await sb.from("rappels_ordonnance").update({ statut: "termine", updated_at: new Date().toISOString() }).eq("id", rappelId);
      if (error) throw new Error(error.message);
      await sb.from("rappels_evenements").insert({ rappel_id: rappelId, type: "termine" });
      return new Response(JSON.stringify({ data: { success: true } }), { headers: CORS });
    }

    // Suppression définitive d'un rappel (02/10/2026) — distincte de
    // rappels_terminer : sert à corriger une erreur de saisie (mauvais
    // patient, doublon créé par erreur), pas à clore un suivi normal. La
    // ligne et son historique (rappels_evenements, ON DELETE CASCADE) sont
    // supprimés sans retour possible — la confirmation se fait côté client
    // avant cet appel, jamais ici.
    if (resource === "rappels_supprimer") {
      const { rappelId } = params || {};
      const r = await supprimerRappelAction(sb, { pharmacieId, vendeurSub, callerUserId, rappelId });
      return new Response(JSON.stringify(r.body), { status: r.status, headers: CORS });
    }

    // Réactiver un rappel terminé (07/09/2026) — repart sur le même
    // patient/téléphone/consentement déjà recueilli plutôt que de forcer la
    // création d'un nouveau rappel depuis zéro. Même schéma de date par
    // défaut que rappels_traiter (J+21, ou l'écart croissant si le dernier
    // choix du patient était "rien"). Seul un rappel "termine" peut être
    // réactivé — les autres statuts ont déjà leur propre chemin de relance.
    if (resource === "rappels_reactiver") {
      if (!pharmacieId) {
        return new Response(JSON.stringify({ error: "Réservé aux comptes pharmacie" }), { status: 403, headers: CORS });
      }
      const { rappelId, dateRappel, consentement } = params || {};
      if (!rappelId) {
        return new Response(JSON.stringify({ error: "rappelId requis" }), { status: 400, headers: CORS });
      }
      // Consentement reconfirmé (01/10/2026, audit RGPD) — jusqu'ici, la
      // réactivation réutilisait silencieusement le consentement d'origine,
      // parfois recueilli des cycles plus tôt (art. 7(1) : un consentement
      // doit pouvoir être réitéré, pas présumé indéfiniment valide quand un
      // tiers — le pharmacien, pas le patient — relance le suivi). Exigé ici
      // comme à la création (rappels_create), avec un nouvel horodatage.
      if (!consentement) {
        return new Response(JSON.stringify({ error: "Le consentement du patient à être recontacté doit être reconfirmé pour réactiver ce rappel" }), { status: 400, headers: CORS });
      }
      const { data: existing } = await sb.from("rappels_ordonnance").select("id, pharmacie_id, statut, cycle_numero, choix_patient, opt_out").eq("id", rappelId).maybeSingle();
      if (!existing || existing.pharmacie_id !== pharmacieId) {
        return new Response(JSON.stringify({ error: "Rappel introuvable" }), { status: 404, headers: CORS });
      }
      if (existing.statut !== "termine") {
        return new Response(JSON.stringify({ error: "Seul un rappel terminé peut être réactivé" }), { status: 409, headers: CORS });
      }
      // Opposition du patient (01/10/2026, audit RGPD) — un rappel où le
      // patient a explicitement demandé à ne plus être recontacté ne doit
      // jamais pouvoir être réactivé, quel que soit le consentement fourni
      // ici : l'opposition prime et doit être levée par le patient lui-même,
      // pas réinterprétée par le pharmacien.
      if (existing.opt_out) {
        return new Response(JSON.stringify({ error: "Ce patient a demandé à ne plus être recontacté — ce rappel ne peut pas être réactivé" }), { status: 409, headers: CORS });
      }
      let dateProchaineRelance: string;
      if (dateRappel) {
        const parsed = new Date(dateRappel);
        if (Number.isNaN(parsed.getTime())) {
          return new Response(JSON.stringify({ error: "Date de rappel invalide" }), { status: 400, headers: CORS });
        }
        const today = new Date(); today.setHours(0, 0, 0, 0);
        if (parsed < today) {
          return new Response(JSON.stringify({ error: "La date de rappel ne peut pas être dans le passé" }), { status: 400, headers: CORS });
        }
        dateProchaineRelance = parsed.toISOString();
      } else {
        const joursOffset = existing.choix_patient === "rien" ? existing.cycle_numero * 31 + 21 : 21;
        dateProchaineRelance = new Date(Date.now() + joursOffset * 86400000).toISOString();
      }
      const { error: reactiverError } = await sb.from("rappels_ordonnance").update({
        statut: "en_attente",
        choix_patient: null,
        cycle_numero: existing.cycle_numero + 1,
        date_prochaine_relance: dateProchaineRelance,
        case_code: null,
        // Nouveau cycle : le groupe du cycle précédent ne s'applique plus.
        groupe_id: null,
        relance_sms_envoyee: false,
        sms_echecs_consecutifs: 0,
        // Rotation du token (01/10/2026, audit sécurité) — voir le même
        // correctif et sa justification complète dans rappels_traiter.
        token: generateShortToken(),
        // Nouvel horodatage de consentement (01/10/2026) — preuve d'une
        // reconfirmation à CETTE date, pas celle du cycle d'origine.
        consentement_sms_horodatage: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", rappelId);
      if (reactiverError) throw new Error(reactiverError.message);
      await sb.from("rappels_evenements").insert({ rappel_id: rappelId, type: "reactive" });
      return new Response(JSON.stringify({ data: { success: true } }), { headers: CORS });
    }

    // Modifier un rappel existant (04/09/2026) — nom/prénom/téléphone/
    // commentaire toujours modifiables ; la date de relance ne l'est que
    // tant que le rappel est "en_attente" (au-delà, le cycle est déjà en
    // cours ou terminé, la changer ne rescheduler rien côté cron).
    if (resource === "rappels_update") {
      if (!pharmacieId) {
        return new Response(JSON.stringify({ error: "Réservé aux comptes pharmacie" }), { status: 403, headers: CORS });
      }
      const { rappelId, nom, prenom, telephone, dateRappel, commentaire, medecinPrescripteur, specialite } = params || {};
      if (!rappelId) {
        return new Response(JSON.stringify({ error: "rappelId requis" }), { status: 400, headers: CORS });
      }
      const { data: existing } = await sb.from("rappels_ordonnance").select("id, pharmacie_id, statut").eq("id", rappelId).maybeSingle();
      if (!existing || existing.pharmacie_id !== pharmacieId) {
        return new Response(JSON.stringify({ error: "Rappel introuvable" }), { status: 404, headers: CORS });
      }
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (nom?.trim()) patch.patient_nom = nom.trim();
      if (prenom?.trim()) patch.patient_prenom = prenom.trim();
      if (telephone?.trim()) patch.patient_telephone = telephone.trim();
      // Mode de contact (01/10/2026) — plus de choix manuel : un numéro
      // modifié recalcule le mode à partir du NOUVEAU numéro, jamais à partir
      // de l'ancien ni d'une valeur fournie par le client.
      if (telephone?.trim()) {
        patch.mode_contact = estNumeroFixe(telephone) ? "appel" : "sms";
      }
      if (commentaire !== undefined) patch.commentaire = commentaire?.trim() || null;
      if (medecinPrescripteur !== undefined) patch.medecin_prescripteur = medecinPrescripteur?.trim() || null;
      if (specialite !== undefined) patch.specialite = specialite?.trim() || null;
      if (dateRappel && existing.statut === "en_attente") {
        const parsed = new Date(dateRappel);
        if (Number.isNaN(parsed.getTime())) {
          return new Response(JSON.stringify({ error: "Date de rappel invalide" }), { status: 400, headers: CORS });
        }
        const today = new Date(); today.setHours(0, 0, 0, 0);
        if (parsed < today) {
          return new Response(JSON.stringify({ error: "La date de rappel ne peut pas être dans le passé" }), { status: 400, headers: CORS });
        }
        patch.date_prochaine_relance = parsed.toISOString();
      }
      const { error } = await sb.from("rappels_ordonnance").update(patch).eq("id", rappelId);
      if (error) throw new Error(error.message);
      return new Response(JSON.stringify({ data: { success: true } }), { headers: CORS });
    }

    // Déclenchement manuel (04/09/2026, devenu envoi SMS réel le 06/09/2026 —
    // voir historique git pour le détail des deux évolutions). Ce bouton
    // envoie normalement le vrai SMS au patient, sans attendre le prochain
    // passage du cron — utile pour relancer un patient sans repasser par le
    // cycle J+21 complet.
    //
    // Canal EMAIL réintroduit le 07/09/2026 : le sender SMS "OrdoMail" est en
    // attente de modération OVH (waitingValidation), donc le SMS réel ne part
    // pas encore. Si `email` est fourni dans params, on envoie le même
    // message par email (Postmark, _shared/email.ts) à cette adresse au lieu
    // du SMS, pour continuer à tester le parcours patient de bout en bout en
    // attendant la validation OVH. Mêmes effets de bord dans les deux cas
    // (rotation du token, passage à "sms_envoye") — voir _shared/rappelLogic.ts
    // pour le pendant automatique (cron quotidien).
    if (resource === "rappels_envoyer_test") {
      if (!pharmacieId) {
        return new Response(JSON.stringify({ error: "Réservé aux comptes pharmacie" }), { status: 403, headers: CORS });
      }
      const { rappelId, email } = params || {};
      if (!rappelId) {
        return new Response(JSON.stringify({ error: "rappelId requis" }), { status: 400, headers: CORS });
      }
      const { data: rappel } = await sb.from("rappels_ordonnance")
        .select("id, pharmacie_id, patient_prenom, patient_nom, patient_telephone, medecin_prescripteur, specialite, mode_contact, date_prochaine_relance, statut, pharmacies(nom)")
        .eq("id", rappelId).maybeSingle();
      if (!rappel || rappel.pharmacie_id !== pharmacieId) {
        return new Response(JSON.stringify({ error: "Rappel introuvable" }), { status: 404, headers: CORS });
      }
      if (rappel.statut !== "en_attente" && rappel.statut !== "sms_envoye") {
        return new Response(JSON.stringify({ error: "Ce rappel a déjà reçu une réponse ou est terminé — impossible de renvoyer un lien" }), { status: 409, headers: CORS });
      }
      const appUrl = Deno.env.get("APP_URL") || "https://ordomail.fr";
      const newToken = generateShortToken();
      const lien = buildRappelLien(appUrl, newToken);
      const pharmacieNom = (rappel as any).pharmacies?.nom || "votre pharmacie";
      const { data: candidatsBruts } = await appliquerFiltreStatutEnvoi(
        sb.from("rappels_ordonnance")
          .select("id, pharmacie_id, patient_prenom, patient_nom, patient_telephone, medecin_prescripteur, specialite, mode_contact, date_prochaine_relance, pharmacies(nom)")
          .eq("pharmacie_id", pharmacieId),
      ).neq("id", rappelId);
      const groupe = regrouperParTelephone([rappel, ...(candidatsBruts || [])]).find((g) => g.some((r) => r.id === rappelId)) || [rappel];
      const autres = groupe.filter((r) => r.id !== rappelId);
      const enGroupe = autres.length > 0;
      const groupeId = enGroupe ? crypto.randomUUID() : null;
      const message = enGroupe
        ? buildRappelMessageGroupe(rappel.patient_prenom, rappel.patient_nom, lien, pharmacieNom)
        : buildRappelMessage(rappel.patient_prenom, rappel.patient_nom, lien, pharmacieNom, rappel.medecin_prescripteur, rappel.specialite);

      let mocked = false;
      let canal: "sms" | "email_test" = "sms";
      let emailDestination: string | null = null;
      if (email?.trim()) {
        canal = "email_test";
        // @fix 24/09/2026 (audit) — `email` n'est plus utilisé comme adresse de
        // destination : un appelant authentifié (vendeur ou titulaire) pouvait
        // sinon faire envoyer un email à N'IMPORTE QUELLE adresse depuis
        // l'infrastructure OrdoMail (relais de spam/phishing), en plus d'un
        // corps HTML construit à partir de champs patient non échappés
        // (injection HTML). `email` n'est donc plus qu'un booléen "utiliser le
        // canal email" ; la destination réelle est toujours l'adresse déjà
        // enregistrée de la pharmacie, jamais une valeur fournie par le client.
        const { data: phEmail } = await sb.from("pharmacies").select("email").eq("id", pharmacieId).maybeSingle();
        if (!phEmail?.email) {
          return new Response(JSON.stringify({ error: "Aucune adresse email enregistrée pour cette pharmacie" }), { status: 400, headers: CORS });
        }
        emailDestination = phEmail.email;
        // Toutes les lignes du message sauf la dernière (le lien brut, déjà
        // repris juste après en lien cliquable) — sinon seule la première
        // ligne apparaissait dans l'email depuis la mise en forme multi-ligne
        // du message (07/09/2026). Échappées (audit 24/09/2026) : construites
        // à partir de champs patient (nom, spécialité...) non fiables.
        const bodyLines = message.split("\n").slice(0, -1).map(escapeHtml);
        const html = `<p>${bodyLines.join("<br>")}</p><p><a href="${lien}">${lien}</a></p>`;
        const result = await sendTransactionalEmail(phEmail.email, `[TEST] Rappel de renouvellement — ${rappel.patient_prenom}`, html, message);
        if (!result.success) {
          return new Response(JSON.stringify({ error: result.error || "Échec de l'envoi de l'email" }), { status: 502, headers: CORS });
        }
      } else {
        const result = await sendSms(rappel.patient_telephone, message, pharmacieNom);
        if (!result.success) {
          return new Response(JSON.stringify({ error: result.error || "Échec de l'envoi du SMS" }), { status: 502, headers: CORS });
        }
        mocked = result.mocked;
      }

      const maintenant = new Date().toISOString();
      const { error: updErr } = await sb.from("rappels_ordonnance").update({
        statut: "sms_envoye",
        token: newToken,
        ...(enGroupe ? { groupe_id: groupeId } : {}),
        date_dernier_sms_envoye: maintenant,
        updated_at: maintenant,
      }).eq("id", rappelId);
      if (updErr) throw new Error(updErr.message);
      if (enGroupe) {
        const { error: updAutresErr } = await sb.from("rappels_ordonnance").update({
          statut: "sms_envoye", groupe_id: groupeId, date_dernier_sms_envoye: maintenant, updated_at: maintenant,
        }).in("id", autres.map((r) => r.id));
        if (updAutresErr) throw new Error(updAutresErr.message);
      }
      const meta = { mocked, manuel: true, canal, groupe: enGroupe, ...(emailDestination ? { to: emailDestination } : {}) };
      const { error: insErr } = await sb.from("rappels_evenements").insert([rappel, ...autres].map((r) => ({ rappel_id: r.id, type: "sms_envoye", meta })));
      if (insErr) throw new Error(insErr.message);
      return new Response(JSON.stringify({ data: { success: true, mocked } }), { headers: CORS });
    }

    // Déclenchement manuel du passage en "à appeler" (30/09/2026) — pendant
    // de rappels_envoyer_test pour un rappel en mode "appel" (numéro fixe) :
    // même utilité (ne pas attendre le prochain passage du cron), mais sans
    // SMS/email à envoyer, juste le même changement de statut que le cron
    // effectue pour ce mode (voir _shared/rappelLogic.ts).
    if (resource === "rappels_marquer_a_appeler") {
      if (!pharmacieId) {
        return new Response(JSON.stringify({ error: "Réservé aux comptes pharmacie" }), { status: 403, headers: CORS });
      }
      const { rappelId } = params || {};
      if (!rappelId) {
        return new Response(JSON.stringify({ error: "rappelId requis" }), { status: 400, headers: CORS });
      }
      const { data: rappel } = await sb.from("rappels_ordonnance").select("id, pharmacie_id, statut").eq("id", rappelId).maybeSingle();
      if (!rappel || rappel.pharmacie_id !== pharmacieId) {
        return new Response(JSON.stringify({ error: "Rappel introuvable" }), { status: 404, headers: CORS });
      }
      if (rappel.statut !== "en_attente") {
        return new Response(JSON.stringify({ error: "Ce rappel a déjà reçu une réponse ou est terminé" }), { status: 409, headers: CORS });
      }
      const { error: updErr } = await sb.from("rappels_ordonnance").update({
        statut: "a_appeler",
        updated_at: new Date().toISOString(),
      }).eq("id", rappelId);
      if (updErr) throw new Error(updErr.message);
      await sb.from("rappels_evenements").insert({ rappel_id: rappelId, type: "a_appeler", meta: { manuel: true } });
      return new Response(JSON.stringify({ data: { success: true } }), { headers: CORS });
    }

  return null;
}
