// @version 16/07/2026 16:04 — fix-email-notnull
// OrdoMail — register-pharmacie
// Crée le compte pharmacie après inscription Supabase Auth

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { maskId } from "../_shared/log-mask.ts";
import { safeErrorMessage } from "../_shared/errors.ts";
import { checkRateLimit, getClientIp } from "../_shared/rateLimit.ts";
import { reportAlert } from "../_shared/alert.ts";

Deno.serve(async (req) => {
  const CORS = corsHeaders(req, {
    "Access-Control-Allow-Headers": "content-type, authorization, x-client-info, apikey",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  });
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: CORS });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // @fix 24/09/2026 (audit) — aucune limitation de débit jusqu'ici : création
  // de comptes en masse possible sans frein. 5 inscriptions/heure par IP —
  // large marge pour un usage légitime (une officine ne s'inscrit qu'une
  // fois), mais bloque un script automatisé.
  const allowed = await checkRateLimit(supabase, "register-pharmacie", getClientIp(req), 5, 60);
  if (!allowed) {
    return new Response(
      JSON.stringify({ error: "Trop de tentatives d'inscription — réessayez dans quelques instants" }),
      { status: 429, headers: CORS }
    );
  }

  try {
    const { nom, pharmacie: pharmacieNom, adresse, siret, email, userId } = await req.json();

    if (!nom || !email) {
      return new Response(
        JSON.stringify({ error: "Nom et email requis" }),
        { status: 400, headers: CORS }
      );
    }
    // @conformite 09/09/2026 — SIRET obligatoire (BillingModule.jsx le valide déjà
    // côté client, 14 chiffres) : nécessaire pour l'identification légale du client
    // sur les factures Stripe (voir create-checkout-session — name/address/SIRET
    // transmis au Customer) et sur le modèle de facture (generateInvoiceHTML).
    if (!/^\d{14}$/.test(siret || "")) {
      return new Response(
        JSON.stringify({ error: "SIRET requis (14 chiffres)" }),
        { status: 400, headers: CORS }
      );
    }

    // Générer le code vendeur (6 chiffres unique)
    const codeVendeur = String(100000 + Math.floor(Math.random() * 900000));

    // email_slug : code court "pharmacie-XXXX" (4 caractères alphanumériques), PAS dérivé
    // du nom — deux pharmacies au nom identique ou proche (ex: deux officines "Pharmacie
    // Centrale" dans des villes différentes) auraient sinon produit le même slug et donc
    // violé la contrainte UNIQUE sur email_reception à l'inscription de la seconde. Le code
    // court élimine aussi la fuite du nom de la pharmacie dans une adresse email publique.
    const CODE_CHARS = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // sans I/O (confusion avec 1/0)
    function generateEmailCode() {
      const arr = new Uint8Array(4);
      crypto.getRandomValues(arr);
      return Array.from(arr, (b) => CODE_CHARS[b % CODE_CHARS.length]).join("");
    }

    // Créer la pharmacie — retente avec un nouveau code en cas de collision sur la
    // contrainte UNIQUE email_reception (23505), jusqu'à 5 tentatives.
    let pharmacie, phErr, emailSlug;
    for (let attempt = 0; attempt < 5; attempt++) {
      emailSlug = `pharmacie-${generateEmailCode()}`;
      const res = await supabase
        .from("pharmacies")
        .insert({
          // @conformite 27/08/2026 — `pharmacie` (nom de l'officine, saisi séparément
          // du nom du titulaire dans BillingModule.jsx) n'était jamais lu ici : cette
          // colonne recevait silencieusement le nom PERSONNEL du titulaire ("Dr MARTIN
          // Pierre") au lieu du nom de la pharmacie ("Pharmacie de la Paix"), et
          // `adresse` n'était jamais enregistrée du tout malgré sa validation
          // obligatoire côté client — repéré en cherchant à afficher nom du titulaire +
          // pharmacie + ville dans le backoffice, aucune des deux dernières n'existait
          // en base pour les comptes déjà créés.
          nom: pharmacieNom || nom,
          adresse: adresse || null,
          // Obligatoire depuis le 09/09/2026 (déjà validé ci-dessus) — via
          // l'autocomplete du référentiel (BillingModule.jsx) ou saisi
          // librement.
          siret,
          email,
          email_reception: `${emailSlug}@in.ordomail.fr`,
          email_slug:      emailSlug,
          code_vendeur:    codeVendeur,
          plan:            "starter",
          // @fix 29/08/2026 (Phase 2 tarification) — la sonnette est une
          // fonctionnalité Fluidité+ (voir pricing_plans.feature_sonnette) ;
          // toute inscription démarre sur Essentiel (plan "starter" par
          // défaut, ligne ci-dessus), qui ne l'inclut pas. change-plan
          // resynchronise cette valeur à chaque changement de plan.
          sonnette_active: false,
          couleur:         "#1a3a6e",
          // @fix 14/09/2026 — jamais renseigné ici depuis la création de cette
          // fonction (repéré en ajoutant l'onglet QR code en libre-service côté
          // pharmacien) : sans lui, le lien ?patient=<id>&t=<qr_token> de la
          // pharmacie est définitivement non fonctionnel (submit-ordonnance
          // exige qr_token === pharmacies.qr_token). Seules les pharmacies
          // déjà existantes au 23/07/2026 avaient été couvertes par un
          // backfill ponctuel — voir la migration 20260914_backfill_qr_token.sql
          // pour celles créées depuis.
          qr_token:        crypto.randomUUID().replace(/-/g, ""),
        })
        .select()
        .single();
      pharmacie = res.data;
      phErr = res.error;
      if (!phErr || phErr.code !== "23505") break;
    }

    if (phErr) {
      // @fix 24/09/2026 (audit) — contrairement à tous les autres chemins
      // critiques (submit-ordonnance, stripe-webhook...), un échec ici
      // n'alertait jamais : un souci sur l'inscription (impact direct sur le
      // chiffre d'affaires) pouvait passer totalement inaperçu.
      await reportAlert(supabase, {
        source: "register-pharmacie", severity: "critical",
        message: `Échec de création pharmacie — ${phErr.message}`,
      });
      return new Response(
        JSON.stringify({ error: safeErrorMessage(new Error(phErr.message), "register-pharmacie") }),
        { status: 500, headers: CORS }
      );
    }

    // Lier l'utilisateur à la pharmacie.
    //
    // Audit du 17/08/2026 : ce bloc faisait confiance à userId tel que fourni
    // par le client, sans aucune vérification — un appelant pouvait fournir
    // l'id de n'importe quel autre utilisateur Supabase Auth existant pour se
    // faire lier comme "admin" d'une pharmacie qu'il vient de créer, sur un
    // compte qui n'est pas le sien.
    //
    // On ne lie que si le client a demandé une liaison (userId fourni, comme
    // avant — préserve le comportement des appelants qui ne le fournissent
    // pas, ex: BillingModule.jsx qui lie via un autre mécanisme). L'identité
    // est ensuite vérifiée côté serveur avant d'écrire :
    //   - si une session Supabase Auth est jointe (Authorization: Bearer),
    //     l'identité qu'elle porte fait foi et doit correspondre à userId ;
    //   - sinon (cas normal ici : juste après signUp() avec confirmation
    //     email en attente, authData.session encore null côté client — voir
    //     LoginPage.jsx RegisterForm), userId est revérifié via l'API admin :
    //     l'utilisateur doit réellement exister et son email doit
    //     correspondre exactement à l'email d'inscription de cette requête.
    // Dans tous les cas où la vérification échoue, la liaison est refusée
    // (mais la pharmacie reste créée : la liaison peut être reprise plus
    // tard, pas de risque à bloquer uniquement cette étape).
    if (userId) {
      let verifiedUserId: string | null = null;
      const authHeader = req.headers.get("authorization") || "";
      const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();

      if (bearer) {
        const { data: authUser } = await supabase.auth.getUser(bearer);
        if (authUser?.user && authUser.user.id === userId) {
          verifiedUserId = authUser.user.id;
        } else {
          console.warn("[register-pharmacie] session fournie mais userId ne correspond pas — liaison ignorée:", maskId(userId));
        }
      } else {
        const { data: lookup } = await supabase.auth.admin.getUserById(userId);
        const candidate = lookup?.user;
        if (candidate && candidate.email && candidate.email.toLowerCase() === String(email).toLowerCase()) {
          verifiedUserId = candidate.id;
        } else {
          console.warn("[register-pharmacie] userId fourni non vérifiable (email non correspondant) — liaison ignorée:", maskId(userId));
        }
      }

      if (verifiedUserId) {
        // `nom` ici est le nom personnel du titulaire ("Votre nom *" dans
        // BillingModule.jsx, ex: "Dr MARTIN Pierre") — un seul champ texte côté
        // formulaire, pas de prénom/nom séparés à découper fiablement.
        await supabase.from("pharmacie_users").insert({
          id:           verifiedUserId,
          pharmacie_id: pharmacie.id,
          role:         "admin",
          nom,
        });
      }
    }

    // Créer 2 postes vendeurs par défaut
    await supabase.from("pharmacie_postes").insert([
      { pharmacie_id: pharmacie.id, nom: "Poste Accueil", actif: true },
      { pharmacie_id: pharmacie.id, nom: "Poste Caisse",  actif: true },
    ]);

    // @fix 23/09/2026 (audit critique) — loggait le nom réel du titulaire en
    // clair juste à côté d'un ID masqué, une incohérence : l'ID de la
    // pharmacie suffit pour corréler/déboguer, pas besoin du nom personnel.
    console.log("[register-pharmacie] Pharmacie créée:", maskId(pharmacie.id));

    return new Response(JSON.stringify({
      success:       true,
      pharmacie_id:  pharmacie.id,
      code_vendeur:  codeVendeur,
      email_slug:    emailSlug,
      trial_ends_at: pharmacie.trial_ends_at,
    }), { headers: CORS });

  } catch (e) {
    await reportAlert(supabase, {
      source: "register-pharmacie", severity: "critical",
      message: `Échec d'inscription — ${(e as Error).message}`,
    });
    return new Response(
      JSON.stringify({ error: safeErrorMessage(e, "register-pharmacie") }),
      { status: 500, headers: CORS }
    );
  }
});
