# 💊 OrdoMail

> Simplifier et sécuriser la réception des ordonnances en pharmacie.

Application React (Vite) + backend Supabase (Postgres, Auth, Storage, Realtime,
Edge Functions Deno) avec facturation Stripe et emails Postmark. Le patient dépose
son ordonnance par QR code ou email, la pharmacie la traite depuis un dashboard
vendeur (PIN) et titulaire (email/mot de passe), avec un backoffice OrdoMail
Business séparé.

⚠️ Ce fichier documente l'état réel du projet. Pour la procédure de mise en
production complète, voir **[DEPLOIEMENT_CHECKLIST.md](./DEPLOIEMENT_CHECKLIST.md)**.
L'historique des phases de durcissement précédentes reste dans
`DEPLOIEMENT_PHASE1.md` / `PHASE2.md` / `PHASE3_STRIPE.md` (contexte, pas à rejouer).

---

## Démarrage en local

```bash
npm install
npm run dev        # http://localhost:5173
```

Par défaut le projet tourne en **mode démo** (`VITE_DEMO_MODE=true` ou absent) :
toutes les données vivent en mémoire navigateur, aucun Supabase requis. C'est le
mode utilisé pour les démonstrations commerciales (voir comptes ci-dessous).

Pour développer contre un vrai projet Supabase, créer `.env.local` (jamais commité) :

```env
VITE_DEMO_MODE=false
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...
VITE_APP_URL=http://localhost:5173
VITE_SENTRY_DSN=                    # optionnel — Sentry désactivé si vide
```

⚠️ En build de production (`npm run build`), si `VITE_DEMO_MODE` n'est pas
explicitement `false` avec une config Supabase valide, l'application **refuse de
démarrer** plutôt que de retomber silencieusement en mode démo (identifiants de
démo codés en dur, lisibles dans le bundle JS).

```bash
npm run build       # build de production (durci — voir vite.config.js)
npm run preview      # tester le build localement
npm run lint          # ESLint
npm run format         # Prettier
npm test                # Vitest — tests unitaires (logique JWT, validation, masquage de logs…)
```

La CI GitHub Actions (`.github/workflows/ci.yml`) bloque le merge sur `main`/`develop`
si le lint, les tests ou le build échouent.

---

## Architecture

```
src/
├── pages/           PatientPage (QR/email), Dashboard (vendeur/titulaire), AdminPage (backoffice)
├── components/      Composants extraits (OffresSection, StoriesSection, BillingModule, …)
├── lib/             utils.js (masquage logs, dates, XSS), plans.js, monitoring.js, ocr.js
└── supabase.js      Couche de persistance — bascule démo/Supabase, wrappers secure-data

supabase/
├── functions/        12 Edge Functions Deno (voir tableau ci-dessous) + _shared/ (jwt, cors, validation, masquage)
├── migrations/       Migrations SQL — appliquées manuellement via le SQL Editor Supabase (voir checklist)
└── schema.sql        Schéma de référence reconcilié avec l'état réel de la base (pas exécuté tel quel en prod)
```

### Edge Functions

| Fonction | Rôle |
|---|---|
| `secure-data` | Passerelle d'autorisation centrale — toute lecture scoping pharmacie/vendeur/admin |
| `verify-pin` / `update-pin` | Authentification vendeur (PIN bcrypt, rate-limited) |
| `verify-admin` | Authentification backoffice OrdoMail Business |
| `register-pharmacie` | Création de compte pharmacie après inscription |
| `submit-ordonnance` | Dépôt d'ordonnance par QR code (validation fichier serveur, rate-limited) |
| `send-email` / `receive-email` | Réception d'ordonnance par email (Postmark inbound) |
| `create-checkout-session` / `change-plan` | Abonnement Stripe (Checkout, changement de palier) |
| `stripe-webhook` | Synchronisation des événements Stripe (plan, factures) |
| `snapshot-metriques` | Calcul nocturne des métriques par pharmacie (pg_cron) |

Toutes partagent `_shared/cors.ts` (allowlist d'origines par environnement) et,
selon la fonction, `_shared/jwt.ts`, `_shared/upload-validation.ts`,
`_shared/checkout.ts`, `_shared/webhook-plan.ts`, `_shared/log-mask.ts`.

Déploiement d'une fonction :
```bash
supabase functions deploy <nom-de-la-fonction>
```

---

## Comptes de démonstration (mode démo uniquement)

| Rôle | Email / Méthode | Mot de passe / PIN |
|------|-----------------|-------------------|
| Pharmacie 1 | contact@pharmaciecentrale.fr | demo123 |
| Pharmacie 2 | pharma@soleil.fr | demo123 |
| Vendeur — Poste Accueil | PIN | 1234 |
| Vendeur — Poste Caisse | PIN | 5678 |
| Backoffice OrdoMail Business | admin@ordomail.fr | admin2025 |

Ces identifiants sont codés en dur et lisibles dans le bundle JS — valables
uniquement quand `VITE_DEMO_MODE=true`. Ne jamais les considérer comme un
mécanisme de sécurité en production (voir garde-fou de build ci-dessus).

---

## Déploiement — vue d'ensemble

Le frontend se déploie sur Vercel/Netlify (build Vite statique) ; le backend vit
entièrement sur Supabase (projet lié : voir `supabase/config.toml`). Procédure
complète, variables d'environnement et vérifications post-déploiement :
**→ [DEPLOIEMENT_CHECKLIST.md](./DEPLOIEMENT_CHECKLIST.md)**

### Frontend — Vercel (recommandé)

```bash
git push origin main
# Vercel : Import Git Repository → Framework "Vite" → Deploy
# Redéploiement automatique à chaque push sur main
```

### Nom de domaine

1. Vercel → Project → **Settings → Domains** → ajouter `ordomail.fr`
2. Chez le registrar : `CNAME www → cname.vercel-dns.com`, `A @ → 76.76.21.21`
3. HTTPS automatique (Let's Encrypt) une fois le DNS propagé
