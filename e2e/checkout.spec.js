// E2E — Inscription / paiement (démo).
//
// ⚠️ Portée volontairement limitée : BillingModule.jsx n'a AUCUNE branche mode
// démo — le bouton final "Continuer vers le paiement sécurisé" appelle
// toujours sb.auth.signUp() (Supabase Auth réel) puis les edge functions
// register-pharmacie et create-checkout-session (Stripe réel), quel que soit
// VITE_DEMO_MODE. L'automatiser jusqu'au bout créerait un vrai utilisateur
// Supabase Auth et une vraie pharmacie à chaque run de CI, et nécessiterait des
// clés Stripe test + de piloter le domaine externe checkout.stripe.com — hors
// périmètre d'un "E2E minimal" sûr à exécuter sans supervision. Ce test couvre
// donc tout le parcours CLIENT (navigation, choix de plan, validation de
// formulaire, calcul du prix affiché) jusqu'au clic qui déclencherait ces
// appels réels, qui n'est pas cliqué.
import { test, expect } from '@playwright/test';

test('inscription — navigation jusqu\'au paiement, formulaire et récapitulatif corrects', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Essai gratuit 30 jours' }).click();

  // BillingModule initialView="checkout" planId="standard" billing="monthly"
  await expect(page.getByRole('heading', { name: 'Informations' })).toBeVisible();

  await page.getByPlaceholder('Dr MARTIN Pierre').fill('Dr TEST Pierre');
  await page.getByPlaceholder('contact@pharmacie.fr').fill(`e2e-${Date.now()}@ordomail-test.invalid`);
  await page.getByPlaceholder('8 caractères minimum').fill('MotDePasseTest123');
  await page.getByPlaceholder('Pharmacie de la Paix').fill('Pharmacie E2E Test');

  await page.getByRole('button', { name: 'Continuer →' }).click();

  // Étape carte : récapitulatif du plan Standard (celui choisi via "Essai
  // gratuit 30 jours", voir LandingPage.jsx: onGoToCheckout("standard","monthly")).
  await expect(page.getByRole('heading', { name: 'Paiement' })).toBeVisible();
  await expect(page.getByText('OrdoMail Standard')).toBeVisible();
  await expect(page.getByText('Mensuel', { exact: true })).toBeVisible();
  await expect(page.getByText('0 € — Gratuit')).toBeVisible();

  const submitBtn = page.getByRole('button', { name: 'Continuer vers le paiement sécurisé →' });
  await expect(submitBtn).toBeVisible();
  await expect(submitBtn).toBeEnabled();
  // Ne PAS cliquer : appellerait sb.auth.signUp() + Stripe réels (voir en-tête).
});

test('inscription — validation bloque un email invalide avant de passer à l\'étape carte', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Essai gratuit 30 jours' }).click();
  await expect(page.getByRole('heading', { name: 'Informations' })).toBeVisible();

  await page.getByPlaceholder('Dr MARTIN Pierre').fill('Dr TEST Pierre');
  await page.getByPlaceholder('contact@pharmacie.fr').fill('pas-un-email');
  await page.getByPlaceholder('Pharmacie de la Paix').fill('Pharmacie E2E Test');
  await page.getByRole('button', { name: 'Continuer →' }).click();

  // Reste bloqué sur l'étape "Informations" — jamais d'accès à l'étape carte
  // avec un email invalide.
  await expect(page.getByText('Email invalide')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Informations' })).toBeVisible();
});
