# OrdoMail — Configurer Stripe (phase 3)

Le paiement réel (Stripe Checkout) a besoin de 6 tarifs ("Price") créés dans votre
compte Stripe. Sans eux, `create-checkout-session` échoue avec une erreur claire
("Tarif Stripe introuvable") plutôt que d'accepter un faux paiement.

## 1. Créer les 6 Price dans Stripe

Aller sur **dashboard.stripe.com** (commencer en **mode Test**, bascule en haut à
droite) → **Produits** → **+ Ajouter un produit**.

Créer 3 produits, chacun avec 2 tarifs (mensuel + annuel). Pour chaque tarif,
dans les options avancées, renseigner le champ **"Clé de référence" (lookup key)**
— c'est cette clé, pas l'ID Stripe généré automatiquement, que le code utilise
pour retrouver le bon tarif :

| Produit | Tarif | Montant | Récurrence | Lookup key (obligatoire) |
|---|---|---|---|---|
| OrdoMail Starter | Mensuel | 29,00 € | / mois | `price_starter_monthly` |
| OrdoMail Starter | Annuel | 324,00 € | / an | `price_starter_annual` |
| OrdoMail Standard | Mensuel | 59,00 € | / mois | `price_standard_monthly` |
| OrdoMail Standard | Annuel | 672,00 € | / an | `price_standard_annual` |
| OrdoMail Pro | Mensuel | 89,00 € | / mois | `price_pro_monthly` |
| OrdoMail Pro | Annuel | 984,00 € | / an | `price_pro_annual` |

(Montants annuels = tarif "annuel" affiché dans l'app × 12 — voir la table
`pricing_plans`, éditable depuis le backoffice (onglet Tarifs). @maj 27/08/2026 :
ce tableau reflétait des tarifs obsolètes datant de la création initiale de ce
document — toujours vérifier `pricing_plans` avant de recréer des Price Stripe.)

Si le champ "Clé de référence" n'est pas visible dans l'UI de création rapide,
utiliser "Ajouter un autre tarif" sur la fiche produit, qui donne accès aux
options avancées.

## 2. Vérifier les secrets des edge functions

```bash
supabase secrets list
```

Doivent être présents (déjà utilisés par `stripe-webhook`/`change-plan` avant
cette phase) :
- `STRIPE_SECRET_KEY` — clé secrète Stripe (test ou live selon l'environnement)
- `STRIPE_WEBHOOK_SECRET` — secret de signature du webhook

Optionnel :
- `APP_URL` — URL de base pour les redirections Stripe (`https://ordomail.fr`
  en prod). Si absent, `create-checkout-session` utilise l'URL envoyée par le
  frontend (`window.location.origin`) ou retombe sur `https://ordomail.fr`.

## 3. Déployer la nouvelle fonction

```bash
supabase functions deploy create-checkout-session
supabase functions deploy change-plan
```

`change-plan` a aussi été corrigée dans cette phase (même bug de lookup Stripe,
plus une authentification manquante — n'importe qui pouvait changer l'abonnement
de n'importe quelle pharmacie).

## 4. Tester (mode Test Stripe)

Utiliser une carte de test Stripe : `4242 4242 4242 4242`, toute date future,
tout CVC. Parcours : Landing → Tarifs → choisir un plan → remplir le formulaire
→ "Continuer vers le paiement sécurisé" → redirection Stripe → payer → retour
sur `/?checkout=success`.

Vérifier ensuite dans Supabase (table `pharmacies`) que `stripe_customer_id`
est renseigné, et dans Stripe que l'abonnement est bien en statut "en essai"
(trialing), prélèvement prévu dans 30 jours.
