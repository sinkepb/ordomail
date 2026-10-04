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
import { buildRappelLien, buildRappelMessage, mergeCommentairePartiel } from "../_shared/rappelLogic.ts";
import { supprimerRappelAction, preparerRappelAction } from "../_shared/rappelHandlers.ts";
import { computeRappelsStats } from "../_shared/rappelsStatsLogic.ts";
import { estNumeroFixe } from "../_shared/telephone.ts";
import { getSmsConsommation } from "../_shared/smsQuota.ts";
import { escapeHtml } from "../_shared/html.ts";
import { safeErrorMessage } from "../_shared/errors.ts";
import type { ContexteSecureData } from "./contexte.ts";

export async function handle_compte(ctx: ContexteSecureData): Promise<Response | null> {
  const { req, sb, supabaseUrl, serviceKey, jwtSecret, pharmacieId, vendeurSub, callerUserId, resource, params, CORS } = ctx;
    // PIN unique (06/09/2026) — heartbeat + libération de session. Appelés
    // pour TOUT vendeur connecté, pas seulement en mode PIN unique : sans
    // ligne vendeur_sessions correspondante (mode multi-PIN, sub = id de
    // poste), l'update/delete ne touche simplement aucune ligne — no-op
    // silencieux plutôt que de faire porter au frontend la connaissance du
    // mode de la pharmacie juste pour savoir s'il doit appeler ceci.
    if (resource === "vendeur_heartbeat") {
      if (vendeurSub) {
        await sb.from("vendeur_sessions").update({ last_seen_at: new Date().toISOString() })
          .eq("id", vendeurSub).eq("pharmacie_id", pharmacieId);
      }
      return new Response(JSON.stringify({ success: true }), { headers: CORS });
    }

    if (resource === "vendeur_release_session") {
      if (vendeurSub) {
        await sb.from("vendeur_sessions").delete().eq("id", vendeurSub).eq("pharmacie_id", pharmacieId);
      }
      return new Response(JSON.stringify({ success: true }), { headers: CORS });
    }

    // Journal d'audit (24/09/2026, audit sécurité) — remplace l'INSERT direct
    // depuis le navigateur (src/lib/supabase/audit.js:addAuditLog), qui reposait
    // sur une policy RLS ouverte à tous (WITH CHECK(true), voir migration
    // 20260808_audit_logs_policies.sql) : à l'époque, un poste vendeur (PIN, pas
    // de session Supabase Auth) n'avait aucun autre moyen de s'authentifier pour
    // une écriture directe. resolveCaller() vérifie désormais le jeton
    // vendeur/la session titulaire ICI — pharmacie_id/user_id/user_role ne
    // viennent donc plus jamais du client (seuls action/ordonnanceId/posteNom,
    // purement cosmétiques, le sont encore). Voir migration
    // 20260924_audit_logs_close_open_insert.sql pour la fermeture de la policy.
    if (resource === "audit_log_create") {
      const { action, ordonnanceId, posteNom } = params || {};
      const ACTIONS_CONNUES = new Set(["view", "print", "download", "delete", "upload", "reopen", "login", "logout", "traiter"]);
      if (!ACTIONS_CONNUES.has(action)) {
        return new Response(JSON.stringify({ error: "action invalide" }), { status: 400, headers: CORS });
      }
      // ordonnanceId revérifié (01/10/2026, audit) — reconnu "cosmétique" avant
      // ce correctif : un appelant pouvait journaliser l'ID d'une ordonnance
      // appartenant à une AUTRE pharmacie (FK globale, non scopée par tenant),
      // affaiblissant la valeur probante du journal en cas de litige. Même
      // pattern que rappels_create pour ordonnanceId : silencieusement ignoré
      // si invalide/étranger, jamais une erreur bloquante — une entrée de
      // journal mal référencée ne doit pas empêcher l'action elle-même.
      let verifiedOrdonnanceId: string | null = null;
      if (ordonnanceId) {
        const { data: ordo } = await sb.from("ordonnances").select("id").eq("id", ordonnanceId).eq("pharmacie_id", pharmacieId).maybeSingle();
        if (ordo) verifiedOrdonnanceId = ordo.id;
      }
      await sb.from("audit_logs").insert({
        pharmacie_id: pharmacieId,
        user_id: vendeurSub || callerUserId || null,
        user_role: vendeurSub ? "vendeur" : "admin",
        poste_nom: posteNom?.trim() || null,
        action,
        ordonnance_id: verifiedOrdonnanceId,
      });
      return new Response(JSON.stringify({ data: { success: true } }), { headers: CORS });
    }

    if (resource === "pharmacie_info") {
      if (!pharmacieId) {
        return new Response(JSON.stringify({ error: "Réservé aux comptes pharmacie" }),
          { status: 403, headers: CORS });
      }
      // Utilisé par le dashboard vendeur (jeton, pas de session Supabase Auth) à la place
      // d'un select('*') direct — jamais de postes/pin_hash ici, un vendeur n'en a pas besoin
      // (les écrans postes/PIN sont réservés au titulaire, qui utilise fetchPharmacie normal).
      const { data, error } = await sb
        .from("pharmacies")
        .select("id, nom, couleur, accent_unique, plan, plan_status, sonnette_active, code_vendeur, email_reception")
        .eq("id", pharmacieId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return new Response(JSON.stringify({ data }), { headers: CORS });
    }

    // Module d'aide backoffice (14/09/2026) — "poser une question" quand la
    // FAQ en ligne (recherche côté client, voir AideModal.jsx) ne suffit pas.
    // Pas de table dédiée : simple email à contact@ordomail.fr, comme
    // rappels_envoyer_test réutilise déjà sendTransactionalEmail plutôt que
    // d'ajouter un canal de plus pour un besoin ponctuel/faible volume.
    if (resource === "aide_poser_question") {
      const { question, posteNom } = params || {};
      if (!question?.trim()) {
        return new Response(JSON.stringify({ error: "Question requise" }), { status: 400, headers: CORS });
      }
      const { data: ph } = await sb.from("pharmacies").select("nom, email").eq("id", pharmacieId).maybeSingle();
      const pharmacieNom = ph?.nom || "Pharmacie inconnue";
      const auteur = vendeurSub ? (posteNom?.trim() || "Poste vendeur") : "Titulaire";
      const safeQuestion = String(question).trim().slice(0, 2000);
      // @fix 24/09/2026 (audit) — pharmacieNom/email/auteur/safeQuestion sont
      // tous dérivés de champs modifiables par l'utilisateur (nom de pharmacie,
      // nom de poste vendeur, question libre) : échappés avant interpolation
      // HTML pour éviter une injection de balises dans l'email de support.
      const html = `<p><strong>Pharmacie :</strong> ${escapeHtml(pharmacieNom)} (${escapeHtml(ph?.email || "—")})</p><p><strong>Posé par :</strong> ${escapeHtml(auteur)}</p><p><strong>Question :</strong></p><p>${escapeHtml(safeQuestion).replace(/\n/g, "<br>")}</p>`;
      const text = `Pharmacie : ${pharmacieNom} (${ph?.email || "—"})\nPosé par : ${auteur}\n\nQuestion :\n${safeQuestion}`;
      const result = await sendTransactionalEmail("contact@ordomail.fr", `[Aide] Question de ${pharmacieNom}`, html, text);
      if (!result.success) {
        return new Response(JSON.stringify({ error: result.error || "Échec de l'envoi de la question" }), { status: 502, headers: CORS });
      }
      return new Response(JSON.stringify({ data: { success: true } }), { headers: CORS });
    }

    // Quota SMS mensuel (11/09/2026, révisé 15/09/2026) — 100 SMS/mois inclus
    // dans Performance, dépassement facturé automatiquement en fin de mois
    // (voir _shared/smsQuota.ts et facturer-depassement-sms). Affiché sur le
    // Dashboard pharmacien (RappelsSection.jsx) pour suivre la conso en
    // temps réel — purement informatif, l'envoi n'est jamais bloqué.
    if (resource === "sms_consommation") {
      if (!pharmacieId) {
        return new Response(JSON.stringify({ error: "Réservé aux comptes pharmacie" }), { status: 403, headers: CORS });
      }
      const conso = await getSmsConsommation(sb, pharmacieId);
      return new Response(JSON.stringify({ data: conso }), { headers: CORS });
    }

    // Demande de suppression de compte (03/10/2026, retour titulaire — le
    // bouton "Supprimer mon compte" de CompteSection.jsx n'était relié à
    // rien) — volontairement PAS une suppression immédiate : contrairement à
    // admin_delete_pharmacie (secure-data-admin, réservé à l'équipe OrdoMail,
    // qui vérifie l'abonnement Stripe et fait la cascade réelle), ceci
    // enregistre juste la demande pour qu'un humain la traite — une
    // suppression de compte potentiellement avec abonnement actif ne doit
    // pas partir d'un clic sans supervision. Réservé au titulaire, jamais
    // un poste vendeur (voir canAdmin côté client, mais revérifié ici :
    // ne jamais faire confiance au seul gating de l'interface).
    if (resource === "demande_suppression_compte") {
      if (!pharmacieId || vendeurSub) {
        return new Response(JSON.stringify({ error: "Réservé au titulaire" }), { status: 403, headers: CORS });
      }
      const { data: ph } = await sb.from("pharmacies").select("nom, email, plan, plan_status").eq("id", pharmacieId).maybeSingle();
      if (!ph) {
        return new Response(JSON.stringify({ error: "Pharmacie introuvable" }), { status: 404, headers: CORS });
      }
      // Idempotence — un double clic ou un rechargement de page ne doit pas
      // créer une seconde alerte pour la même pharmacie tant que la première
      // n'a pas été traitée (même pattern que facturer-depassement-sms).
      const { data: dejaDemande } = await sb.from("alerts")
        .select("id").eq("source", "demande-suppression-compte").eq("resolved", false)
        .contains("meta", { pharmacieId }).limit(1);
      if (!dejaDemande || dejaDemande.length === 0) {
        await reportAlert(sb, {
          source: "demande-suppression-compte",
          severity: "critical",
          message: `Demande de suppression de compte — ${ph.nom}`,
          meta: { pharmacieId, nom: ph.nom, email: ph.email, plan: ph.plan, plan_status: ph.plan_status },
        });
      }
      return new Response(JSON.stringify({ data: { success: true } }), { headers: CORS });
    }

  return null;
}
