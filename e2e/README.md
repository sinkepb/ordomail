# E2E — OrdoMail

Tests Playwright minimaux, exécutés exclusivement en **mode démo**
(`VITE_DEMO_MODE=true`, forcé par `playwright.config.js` — prioritaire sur
`.env.local`). Lancer avec :

```bash
npm run test:e2e
```

## Pourquoi le mode démo

Le "minimal E2E" demandé couvre : inscription, paiement, dépôt patient,
dashboard. Le mode démo est le seul moyen de tester ces parcours **sans
secrets Stripe/Supabase en CI** et **sans polluer les données réelles** à
chaque run.

## `checkout.spec.js` — inscription / paiement

`BillingModule.jsx` (le composant d'inscription + paiement) n'a **aucune
branche mode démo** : le bouton final "Continuer vers le paiement sécurisé"
appelle toujours `sb.auth.signUp()` (Supabase Auth réel) puis les edge
functions `register-pharmacie` et `create-checkout-session` (Stripe réel),
quel que soit `VITE_DEMO_MODE`. L'automatiser jusqu'au bout :
- créerait un vrai utilisateur Supabase Auth et une vraie pharmacie à chaque
  run de CI ;
- nécessiterait des clés Stripe test et de piloter le domaine externe
  `checkout.stripe.com`.

Le test couvre donc tout le parcours **client** — navigation, choix de plan,
validation de formulaire, calcul du prix affiché — jusqu'au clic qui
déclencherait ces appels réels, qui n'est **jamais cliqué**.

## `patient-to-dashboard.spec.js` — dépôt patient / dashboard

Deux tests séparés plutôt qu'un seul parcours chaîné patient → vendeur :
après l'envoi, le patient reste sur un écran "salle d'attente" (stories/quiz
santé) sans bouton de retour — un vrai patient attend physiquement en
pharmacie, il n'a aucune raison de revenir vers le site vitrine. Un vrai
vendeur est sur un appareil séparé, connecté au préalable, et verrait la mise
à jour en direct (Realtime) — pas modélisable dans un seul onglet en mode
démo, où la base mock (`window._ordomailDB`) vit en mémoire par instance de
page, pas partagée entre onglets/navigations complètes.

Le dashboard est donc vérifié séparément contre les ordonnances de
démonstration déjà présentes (`makeOrdos()` dans `App.jsx`), et le dépôt
patient est vérifié via l'écriture réelle dans la base démo partagée
(`window._ordomailDB`), le même mécanisme que lit le dashboard.

## Bug trouvé en écrivant ces tests

`App.jsx` ne définissait jamais `codeVendeur` sur les pharmacies de démo,
alors que l'UI de connexion (`LoginPage.jsx`) affiche "123456"/"654321" comme
codes de démo — la connexion vendeur en mode démo était donc cassée. Corrigé
le 27/07/2026 (voir `App.jsx`).

## Ce qui n'est PAS couvert

- Le paiement Stripe réel (hors périmètre sûr, voir ci-dessus).
- L'OCR Tesseract en conditions réelles (le fichier de test est un JPEG 1×1 —
  suffisant pour valider le parcours d'envoi, pas la qualité d'extraction).
- Les policies RLS Supabase — couvertes séparément par
  `npm run test:rls` (voir `src/lib/supabase/__tests__/rls.live.test.js`).
