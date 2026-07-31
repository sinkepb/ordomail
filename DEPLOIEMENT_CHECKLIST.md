# OrdoMail — Checklist de déploiement

Dernière vérification live complète : **28/07/2026** (via `supabase db advisors --linked`,
requêtes SQL directes et tests RLS live contre le projet lié `hdgpkgaznsaocczxvaix`). Ce
document est la référence unique pour mettre en production ou auditer l'état actuel — les
fichiers `DEPLOIEMENT_PHASE1.md` / `PHASE2.md` / `PHASE3_STRIPE.md` restent en contexte
historique.

**28/07/2026 — `develop` fusionné et poussé sur `main`** (commit `4929a0b`, 35 commits),
déclenchant le déploiement de production sur ordomail.fr. Contenu notable : tout le
correctif `offre_interets` ci-dessous, plus un 4ᵉ bug trouvé après coup — la nouvelle edge
function `toggle-interet` renvoyait un CORS `Access-Control-Allow-Headers` sans `apikey`
(copié du pattern `submit-ordonnance`, qui envoie du FormData sans ce header), bloquant
silencieusement le préflight sur le preview `develop`. Corrigé et redéployé, confirmé par
l'utilisateur ("ça marche"). Aucun conflit lors de la fusion (les 5 commits présents
uniquement sur `main` étaient d'anciens fix de build sur `OrdoCard.jsx` du 16/07/2026, déjà
réconciliés avec `develop` à l'époque).

## Historique — `offre_interets` (résolu le 27–28/07/2026)

Trois bugs distincts, tous liés au marquage/retrait d'intérêt patient pour une offre,
trouvés et corrigés en cascade le même jour en testant en direct contre le preview
`develop` :

1. **`.upsert(...,{onConflict})` échoue avec RLS violation.** Un `INSERT ... ON CONFLICT
   DO UPDATE` exige côté Postgres une visibilité SELECT sur la table, même sans conflit
   réel — `offre_interets` n'a volontairement aucune policy SELECT pour `anon`. Cassé
   depuis l'activation de RLS sur cette table (23/07/2026) : le code client faisait un
   `.upsert()` depuis bien avant.
2. **CORS + CSP bloquaient tout sur les previews Vercel.** `_shared/cors.ts` ne couvrait
   que le domaine de prod, pas les URLs `ordomail-git-<branche>-*.vercel.app` — et la CSP
   (`script-src 'self'` sans `'wasm-unsafe-eval'`) bloquait la compilation du WASM
   Tesseract, gelant tout dépôt d'ordonnance sur "Envoi en cours…".
3. **UPDATE anon silencieusement sans effet ni erreur** (200/204 renvoyé, `EXPLAIN
   VERBOSE` : "One-Time Filter: false" malgré une policy `USING(true)` correcte — cause
   exacte jamais élucidée) **+ badge jamais câblé pour un patient à une seule ordonnance**
   (`OrdoCard`/`OrdoRow` ne recevaient pas la prop `interets`, contrairement à `OrdoGroup`).

Le point 1 est corrigé côté client (voir git log). Le point 3 (UPDATE anon) a été
contourné définitivement : l'écriture passe désormais par l'edge function
`toggle-interet` (clé de service, bypass RLS complet — même schéma que
`submit-ordonnance`), plus fiable qu'une policy RLS supplémentaire qui aurait dû exposer
une lecture anon large sur la table pour fonctionner.

---

## 1. Frontend (Vercel/Netlify)

- [ ] `npm run build` passe sans erreur
- [ ] `npm test` passe (44 tests Vitest — JWT, validation upload, checkout, plan webhook, masquage logs, XSS, dates)
- [ ] `npm run lint` sans erreur (warnings tolérés, voir historique du nettoyage ESLint)
- [ ] `npm run test:rls` passe (nécessite `RLS_TEST_SERVICE_ROLE_KEY` et `RLS_TEST_JWT_SECRET`
      en secrets — voir en-tête de `src/lib/supabase/__tests__/rls.live.test.js`). Skippé
      sans ces secrets, ne bloque pas un contributeur standard.
- [ ] `npm run test:e2e` passe (Playwright, mode démo uniquement — voir `e2e/README.md`
      pour ce qui est couvert et pourquoi le paiement Stripe réel ne l'est pas)
- [ ] Variables d'environnement de production configurées (Vercel/Netlify → Environment Variables) :

  | Variable | Valeur |
  |---|---|
  | `VITE_DEMO_MODE` | `false` (⚠️ le build refuse de démarrer si `false` sans config Supabase valide — comportement voulu) |
  | `VITE_SUPABASE_URL` | URL du projet Supabase |
  | `VITE_SUPABASE_ANON_KEY` | Clé anon (publique) |
  | `VITE_APP_URL` | URL canonique du domaine (ex: `https://ordomail.fr`) |
  | `VITE_SENTRY_DSN` | DSN Sentry (optionnel — monitoring désactivé si vide) |

- [ ] Domaine configuré et HTTPS actif (voir README § Nom de domaine)

---

## 2. Secrets Edge Functions (Supabase → Project Settings → Edge Functions → Secrets)

```bash
supabase secrets set SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  ORDOMAIL_JWT_SECRET=... STRIPE_SECRET_KEY=... STRIPE_WEBHOOK_SECRET=... \
  APP_URL=https://ordomail.fr SNAPSHOT_CRON_SECRET=...
```

- [ ] `ORDOMAIL_JWT_SECRET` — secret HMAC partagé (verify-pin, verify-admin, secure-data)
- [ ] `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` — voir `DEPLOIEMENT_PHASE3_STRIPE.md` pour la création des Price par `lookup_key`
- [ ] `SNAPSHOT_CRON_SECRET` — partagé avec le job pg_cron qui appelle `snapshot-metriques`
- [ ] `APP_URL` — utilisé pour l'allowlist CORS (`_shared/cors.ts`) ET les URLs de retour Stripe Checkout — **doit matcher le domaine de production exact**

Déployer chaque fonction modifiée :
```bash
supabase functions deploy secure-data
supabase functions deploy verify-pin
supabase functions deploy update-pin
supabase functions deploy verify-admin
supabase functions deploy register-pharmacie
supabase functions deploy submit-ordonnance
supabase functions deploy send-email
supabase functions deploy receive-email
supabase functions deploy create-checkout-session
supabase functions deploy change-plan
supabase functions deploy stripe-webhook
supabase functions deploy snapshot-metriques
```

---

## 3. Migrations SQL (Supabase SQL Editor — pas de `supabase db push`, workflow manuel établi)

Aucune n'est trackée par `supabase migration list` (exécution manuelle via l'éditeur SQL
du dashboard, jamais via la CLI) — statut ci-dessous vérifié **en direct** le 26/07/2026 :

| Migration | Statut vérifié live |
|---|---|
| `20260723_phase1_security.sql` | ✅ Appliquée (RLS phase 1 confirmée) |
| `20260724_fix_offre_interets_unique.sql` | ✅ Appliquée |
| `20260724_phase3_pricing.sql` | ✅ Appliquée (table `pricing_plans` présente) |
| `20260725_phase4_security.sql` | ⚠️ Partiellement appliquée — RLS activée sur `stories_content` mais la policy de lecture manquait ; **corrigé** par `20260726_live_advisor_fixes.sql` |
| `20260725_story_metrics.sql` | ✅ Appliquée |
| `20260725_temps_traitement.sql` | ✅ Appliquée |
| `20260726_pharmacie_stories_selection.sql` | ✅ Appliquée |
| `20260726_live_advisor_fixes.sql` | ✅ Appliquée (correctifs ci-dessous) |

Sur un nouveau projet Supabase (from scratch), exécuter tous ces fichiers **dans l'ordre
chronologique** de leur préfixe de date depuis le SQL Editor, avant `schema.sql` (référence
de lecture, pas un script à rejouer tel quel).

---

## 4. Sécurité — état vérifié en direct (26/07/2026)

Vérification effectuée via `supabase db advisors --linked` + requêtes SQL directes
(`pg_policies`, `pg_class.relrowsecurity`, `has_function_privilege`, `storage.buckets`).

### Corrigé lors de cette passe

- **`pin_verification_attempts` / `submission_log`** : RLS totalement absente, `anon`
  disposait d'un accès complet (SELECT/INSERT/UPDATE/DELETE/TRUNCATE) — permettait de
  réinitialiser à volonté les compteurs de rate-limit (brute-force PIN, spam
  submit-ordonnance) en appelant directement l'API REST. → RLS activée + forcée, tous
  les grants anon/authenticated révoqués.
- **`verify_admin_login` / `verify_admin_password` / `check_admin_password`** : fonctions
  SECURITY DEFINER appelables directement via `/rest/v1/rpc/...` par `anon` — bypass total
  du rate-limit bcrypt de l'edge function `verify-admin`. → EXECUTE révoqué de `PUBLIC`
  (pas seulement `anon`/`authenticated` : Postgres accorde EXECUTE à PUBLIC par défaut).
- **`get_user_pharmacie_id()`** : accessible par `anon` sans usage légitime (retourne
  toujours NULL, `auth.uid()` n'existe pas côté anon). → conservé pour `authenticated`
  uniquement (requis par la policy RLS `pharmacie_owns_offres`).
- **`stories_content`** : RLS activée mais **aucune policy** — plus aucune lecture anon
  possible, catalogue dynamique de stories silencieusement cassé en prod (masqué par le
  fallback client vers les stories statiques). → policy de lecture publique
  (`actif = true`) recréée, grants d'écriture anon/authenticated révoqués.
- Fonctions SECURITY DEFINER : `search_path` fixé explicitement (durcissement contre le
  détournement de recherche de schéma).
- Index dupliqués supprimés sur `offre_interets` et `audit_logs`.

### Confirmé sain (pas d'action)

- **Storage** : les 2 buckets (`ordonnances-files`, `logos-pharmacies`) sont `public: false`.
- **`appels_patient`** (sonnette) : policy SELECT publique présente, table bien enregistrée
  dans la publication `supabase_realtime` — RLS/Realtime **écartés** comme cause du bug
  sonnette en cours d'investigation (symptôme : le vendeur voit la confirmation d'appel
  mais le patient ne reçoit rien).
- **CORS** : toutes les edge functions utilisent désormais `_shared/cors.ts` (allowlist
  par environnement, plus de `Access-Control-Allow-Origin: *`).

### Connu et accepté (pas un bug)

- `offre_interets`, `story_metrics`, `appels_patient` : policies anon `WITH CHECK (true)`
  pour l'écriture — voulu, ces tables sont écrites par des patients jamais authentifiés ;
  aucune donnée de santé/PII n'y transite (juste des compteurs d'engagement/appels).
- `pg_net` extension dans le schéma `public` — non utilisée dans le code (aucune référence
  trouvée), à déplacer vers `extensions` si un jour utilisée.
- Protection mots de passe compromis (HaveIBeenPwned) désactivée pour Supabase Auth —
  réglage Dashboard (Authentication → Providers → Password), pas modifiable en SQL.
- Avertissements de performance (`auth_rls_initplan`, `multiple_permissive_policies` sur
  `offres_stories`) — optimisations de policies RLS, hors périmètre sécurité.

---

## 5. Logs — masquage des données sensibles

Depuis le 26/07/2026, tout `console.log`/`error`/`warn` référençant un email, un
identifiant de pharmacie ou un code patient passe par `maskEmail`/`maskId`/`maskCode`
(`src/lib/utils.js` côté client, `supabase/functions/_shared/log-mask.ts` côté edge
functions). À respecter pour tout nouveau log touchant ces données.

---

## 6. Après déploiement

- [ ] `supabase db advisors --linked` ne remonte aucun niveau `ERROR`
- [ ] Tester le parcours patient complet (QR code → ordonnance → sonnette → stories)
- [ ] Tester le paiement Stripe en mode test avant de basculer les clés live
- [ ] Vérifier Sentry reçoit bien un événement si `VITE_SENTRY_DSN` est configuré
- [ ] Confirmer le job pg_cron `snapshot-metriques` s'exécute (log `[snapshot] N pharmacies à traiter`)

---

## 7. Dette technique restante (état au 28/07/2026)

Résolus depuis la dernière passe (confirmé par l'utilisateur, non re-audité en détail
côté code) :
- ~~Bug sonnette côté patient~~ (vendeur voit la confirmation, patient ne recevait rien).
- ~~Vérification du déploiement production post-merge~~ (build/`APP_URL`/section 6).

Par priorité décroissante :

1. **`schema.sql` — dump réel** (tâche restée en attente) : la version actuelle est une
   reconstruction manuelle, pas un `pg_dump`/export natif — probablement bloqué par les
   permissions du projet Supabase hébergé, à retenter ou à documenter comme définitivement
   impossible sans accès direct à la base.
2. **Anomalie UPDATE anon silencieuse** (`offre_interets`, cause jamais élucidée malgré
   investigation approfondie — voir commentaire dans `toggle-interet/index.ts`) :
   contournée architecturalement, mais mériterait un ticket support Supabase si le même
   symptôme réapparaît ailleurs (autre table, autre écriture anon).
3. **Durcissements mineurs restés "connus et acceptés"** (section 4) : activer la
   protection mots de passe compromis (HaveIBeenPwned) dans Supabase Auth, déplacer
   l'extension `pg_net` hors du schéma `public` si elle devient utilisée, et traiter les
   avertissements de performance RLS (`auth_rls_initplan`, policies multiples permissives
   sur `offres_stories`) — aucun n'est un risque de sécurité actif.
4. **CSP `vercel.live`** — décision utilisateur du 28/07 : laissé bloqué (widget de preview
   Vercel uniquement, aucun impact utilisateur final). À revisiter seulement si l'équipe
   veut utiliser le feedback widget en preview.

---

## 8. Prochaines évolutions produit (état au 28/07/2026)

Distinct de la section 7 (dette technique) : évolutions volontaires pour augmenter la
sécurité/qualité perçue et la valeur commerciale. Constaté par lecture directe du code —
aucun de ces points n'est amorcé actuellement.

### A. Sécurité

1. **MFA/2FA pour les comptes titulaire et admin** — aucune trace de TOTP/OTP dans le
   code (`grep` négatif sur `otp|totp|mfa`). Ce sont les comptes qui voient l'intégralité
   des ordonnances d'une pharmacie (données de santé) : cible de choix en cas de fuite de
   mot de passe, et argument de vente rassurant pour les pharmaciens.
2. **Politique de rétention/purge des ordonnances** — aucune suppression automatique après
   un délai constatée ; à documenter/implémenter pour la conformité RGPD données de santé
   (durée de conservation définie, purge ou archivage après échéance).
3. **Alerting actif sur erreurs edge functions en prod** — Sentry est scaffoldé mais
   passif (capture uniquement) ; pas de règle d'alerte (email/Slack) sur pic d'erreurs ou
   sur l'edge function `stripe-webhook` en échec (facturation).
4. **Audit de sécurité externe (pentest)** avant d'élargir la base de clientèle — la
   sensibilité des données (ordonnances) justifie une revue indépendante au-delà de
   l'auto-audit déjà mené.

### B. Qualité / fiabilité

1. **Notifications push navigateur (PWA + service worker)** — aucun `manifest.json` ni
   service worker dans `public/` : aujourd'hui, un vendeur qui n'a pas l'onglet Dashboard
   ouvert ne sait pas qu'une ordonnance vient d'arriver (dépendance à 100% du Realtime en
   onglet actif). C'est aussi la fondation technique du point C.1 ci-dessous.
2. **Vrais tests de charge outillés** (k6/Artillery) — la charge supportée a été
   *évaluée* (tâche #45) mais pas mesurée avec un outil de charge réel simulant un pic
   (ex. lundi matin en pharmacie).
3. **Vérifier/documenter la politique de backup Supabase** (PITR actif ? fréquence ?) et
   tester une restauration à blanc — aucune trace de procédure de restauration testée.
4. **Dashboard de monitoring interne** (taux d'échec OCR, latence edge functions, postes
   inactifs) au-delà de Sentry, pour détecter une dégradation avant que le client ne la
   signale.

### C. Fonctionnalités à valeur ajoutée

1. **Alerte nouvelle ordonnance (push/SMS/email) au vendeur/titulaire** — s'appuie sur B.1 ;
   réduit le risque de rater une ordonnance urgente, argument commercial direct.
2. **Gestion multi-officine / groupement** — le schéma actuel (`pharmacies`, pas de
   `groupe_id`/notion de chaîne) ne permet pas à un titulaire de piloter plusieurs
   officines depuis un seul compte ; pertinent si la cible inclut des groupements.
3. **Application réelle des quotas par plan** — les plans Stripe (starter/standard/pro)
   existent et sont facturés différemment, mais aucun quota d'usage (ordonnances/mois,
   nombre de postes, stories actives) n'est appliqué côté code : rien n'incite
   aujourd'hui un client `starter` à upgrader.
4. **Intégration LGO (logiciel de gestion officinale)** — export normalisé ou connecteur
   vers un logiciel métier existant (ex. Winpharma, LGPI) pour éviter la ressaisie ;
   probablement le levier d'adoption le plus fort pour un usage quotidien en pharmacie.
5. **Historique patient enrichi côté vendeur** — les dépôts sont traités au jour le jour ;
   relier les dépôts successifs d'un même `code_patient` donnerait un historique utile au
   vendeur (fidélisation, suivi).
6. **Notification proactive au patient sur l'offre qui l'intéresse** — `offre_interets`
   enregistre l'intérêt mais ne notifie jamais le patient (ex: offre bientôt expirée,
   disponible en caisse) ; complète le mécanisme stories déjà en place.
7. **Reporting analytics avancé pour le titulaire** — export PDF/comparatif entre postes
   et sur plusieurs mois, en s'appuyant sur les données déjà collectées
   (`story_metrics`, `metriques_journalieres`) mais non exploitées au-delà du dashboard
   temps réel actuel.
