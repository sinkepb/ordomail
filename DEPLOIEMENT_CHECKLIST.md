# OrdoMail — Checklist de déploiement

Dernière vérification live complète : **26/07/2026** (via `supabase db advisors --linked`
et requêtes SQL directes contre le projet lié `hdgpkgaznsaocczxvaix`). Ce document est la
référence unique pour mettre en production ou auditer l'état actuel — les fichiers
`DEPLOIEMENT_PHASE1.md` / `PHASE2.md` / `PHASE3_STRIPE.md` restent en contexte historique.

---

## 1. Frontend (Vercel/Netlify)

- [ ] `npm run build` passe sans erreur
- [ ] `npm test` passe (44 tests Vitest — JWT, validation upload, checkout, plan webhook, masquage logs, XSS, dates)
- [ ] `npm run lint` sans erreur (warnings tolérés, voir historique du nettoyage ESLint)
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
